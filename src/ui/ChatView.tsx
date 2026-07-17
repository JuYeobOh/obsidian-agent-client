import { ItemView, WorkspaceLeaf } from "obsidian";
import type {
	IChatViewContainer,
	ChatViewType,
	SessionStatus,
} from "../services/view-registry";
import * as React from "react";
const { useState, useEffect, useMemo, useCallback } = React;
import { createRoot, Root } from "react-dom/client";

import type AgentClientPlugin from "../plugin";
import type { ChatInputState } from "../types/chat";

// Utility imports
import { getLogger, Logger } from "../utils/logger";

// Context imports
import { ChatContextProvider } from "./ChatContext";

// Component imports
import { ChatPanel, type ChatPanelCallbacks } from "./ChatPanel";

// Service imports
import { VaultService } from "../services/vault-service";

export const VIEW_TYPE_CHAT = "agent-client-chat-view";

function ChatComponent({
	plugin,
	view,
	viewId,
}: {
	plugin: AgentClientPlugin;
	view: ChatView;
	viewId: string;
}) {
	// ============================================================
	// Agent ID State (synced with Obsidian view state)
	// ============================================================
	const [restoredAgentId, setRestoredAgentId] = useState<string | undefined>(
		view.getInitialAgentId() ?? undefined,
	);

	// Initial cwd / session restore target — read once at mount. Views opened
	// via openChatViewForSession() have these set before React mounts.
	const [initialCwd] = useState<string | undefined>(
		view.getInitialCwd() ?? undefined,
	);
	const [initialSessionId] = useState<string | undefined>(
		view.getInitialSessionId() ?? undefined,
	);

	// ============================================================
	// Context Value
	// ============================================================
	const contextValue = useMemo(
		() => ({
			plugin,
			acpClient: view.acpClient,
			vaultService: view.vaultService,
			settingsService: plugin.settingsService,
		}),
		[plugin, view.acpClient, view.vaultService],
	);

	// ============================================================
	// Agent ID Restoration (ChatView-specific)
	// Subscribe to agentId restoration from Obsidian's setState
	// ============================================================
	useEffect(() => {
		const unsubscribe = view.onAgentIdRestored((agentId) => {
			setRestoredAgentId(agentId);
		});
		return unsubscribe;
	}, [view]);

	// Stable so ChatPanel's title-update effect deps are value-stable.
	const handleSessionTitleChanged = useCallback(
		() => view.refreshDisplayText(),
		[view],
	);

	// ============================================================
	// Render
	// ============================================================
	return (
		<ChatContextProvider value={contextValue}>
			<ChatPanel
				variant="sidebar"
				viewId={viewId}
				initialAgentId={restoredAgentId}
				initialCwd={initialCwd}
				initialSessionId={initialSessionId}
				viewHost={view}
				onRegisterCallbacks={(callbacks) =>
					view.setCallbacks(callbacks)
				}
				onAgentIdChanged={(agentId) => view.setAgentId(agentId)}
				onSessionIdChanged={(sessionId) => view.setSessionId(sessionId)}
				onCwdChanged={(cwd) => view.setCwd(cwd)}
				onSessionTitleChanged={handleSessionTitleChanged}
			/>
		</ChatContextProvider>
	);
}

/** State stored for view persistence */
interface ChatViewState extends Record<string, unknown> {
	initialAgentId?: string;
	/** Working directory to start the session in (persisted across restarts) */
	initialCwd?: string;
	/** Saved session to restore once the agent is ready (ephemeral, not persisted) */
	initialSessionId?: string;
	/** Whether the user deliberately created this view as an extra one
	 *  (Ctrl/Cmd-click, "Open in new view"). Deliberate views keep their tab
	 *  icon visible; auto-created background views hide it unless active. */
	deliberateTab?: boolean;
}

export class ChatView extends ItemView implements IChatViewContainer {
	private root: Root | null = null;
	private plugin: AgentClientPlugin;
	private logger: Logger;
	/** Unique identifier for this view instance (for multi-session support) */
	readonly viewId: string;
	/** View type for IChatViewContainer */
	readonly viewType: ChatViewType = "sidebar";
	/** Initial agent ID passed via state (for openNewChatViewWithAgent) */
	private initialAgentId: string | null = null;
	/** Initial working directory passed via state (for openChatViewForSession) */
	private initialCwd: string | null = null;
	/** Session to restore once ready, passed via state (ephemeral) */
	private initialSessionId: string | null = null;
	/** See ChatViewState.deliberateTab */
	private deliberateTab = false;
	/** The live session id, tracked so it can be restored after an app restart */
	private currentSessionId: string | null = null;
	/** Callbacks to notify React when agentId is restored from workspace state */
	private agentIdRestoredCallbacks: Set<(agentId: string) => void> =
		new Set();

	// Services owned by this class (lifecycle managed here)
	/** @internal Exposed to ChatComponent for context creation */
	acpClient!: ReturnType<AgentClientPlugin["getOrCreateAcpClient"]>;
	/** @internal Exposed to ChatComponent for context creation */
	vaultService!: VaultService;

	// Callbacks from ChatPanel for IChatViewContainer delegation
	private callbacks: ChatPanelCallbacks | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: AgentClientPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.logger = getLogger();
		// Static sidebar view (not navigable) — hides .view-header
		this.navigation = false;
		// Use leaf.id if available, otherwise generate UUID
		this.viewId = (leaf as { id?: string }).id ?? crypto.randomUUID();

		// Views opened via openChatViewForSession receive their init payload
		// through this side channel — Obsidian may deliver setState() only
		// after React has mounted, which would miss mount-time initial values
		// and re-trigger session creation.
		const pending = plugin.consumePendingViewInit(this.viewId);
		if (pending) {
			this.initialAgentId = pending.agentId ?? null;
			this.initialCwd = pending.cwd ?? null;
			this.initialSessionId = pending.sessionId ?? null;
			this.deliberateTab = pending.deliberate ?? false;
		}
	}

	/**
	 * Mark this view's tab header so CSS can tell a deliberately created
	 * extra view (icon stays visible) from an auto-created background one
	 * (icon hidden unless active). The header element is Obsidian-managed and
	 * recreated on layout changes, so this is re-applied from onOpen's
	 * layout-change listener rather than set once.
	 */
	private applyTabHeaderClass(): void {
		const header = (this.leaf as { tabHeaderEl?: HTMLElement })
			.tabHeaderEl;
		header?.toggleClass(
			"agent-client-deliberate-tab",
			this.deliberateTab,
		);
		header?.toggleClass(
			"agent-client-primary-tab",
			this.plugin.getPrimaryViewId() === this.viewId,
		);
	}

	/** IChatViewContainer — see the interface docs. */
	isDeliberateTab(): boolean {
		return this.deliberateTab;
	}

	/** IChatViewContainer — see the interface docs. */
	refreshTabHeader(): void {
		this.applyTabHeaderClass();
	}

	getViewType() {
		return VIEW_TYPE_CHAT;
	}

	getDisplayText() {
		// Tab title == Session Manager title; fallback lives in getSessionTitle().
		return this.getSessionTitle();
	}

	getIcon() {
		return "bot-message-square";
	}

	/**
	 * Get the view state for persistence.
	 */
	getState(): ChatViewState {
		return {
			initialAgentId: this.initialAgentId ?? undefined,
			// Persist the folder so the view reopens there after a restart.
			initialCwd: this.initialCwd ?? undefined,
			// Persist the live session so the in-progress conversation reopens
			// after the app is closed and reopened.
			initialSessionId:
				this.currentSessionId ?? this.initialSessionId ?? undefined,
			deliberateTab: this.deliberateTab || undefined,
		};
	}

	/**
	 * Restore the view state from persistence.
	 * Notifies React when agentId is restored so it can re-create the session.
	 */
	async setState(
		state: ChatViewState,
		result: { history: boolean },
	): Promise<void> {
		const previousAgentId = this.initialAgentId;
		this.initialAgentId = state.initialAgentId ?? null;
		this.initialCwd = state.initialCwd ?? this.initialCwd;
		this.initialSessionId = state.initialSessionId ?? this.initialSessionId;
		this.deliberateTab = state.deliberateTab ?? this.deliberateTab;
		// A restored deliberate flag can invalidate a primary claim made in
		// onOpen before this state arrived — re-settle, then re-mark.
		this.plugin.reconcilePrimaryView();
		this.applyTabHeaderClass();
		await super.setState(state, result);

		// Notify React when agentId is restored and differs from previous value
		if (this.initialAgentId && this.initialAgentId !== previousAgentId) {
			this.agentIdRestoredCallbacks.forEach((cb) =>
				cb(this.initialAgentId!),
			);
		}
	}

	/**
	 * Get the initial agent ID for this view.
	 * Used by ChatComponent to determine which agent to initialize.
	 */
	getInitialAgentId(): string | null {
		return this.initialAgentId;
	}

	/** Initial working directory for this view (from openChatViewForSession). */
	getInitialCwd(): string | null {
		return this.initialCwd;
	}

	/** Session to restore once the agent is ready (from openChatViewForSession). */
	getInitialSessionId(): string | null {
		return this.initialSessionId;
	}

	/**
	 * Set the agent ID for this view.
	 * Called when agent is switched to persist the change.
	 */
	setAgentId(agentId: string): void {
		this.initialAgentId = agentId;
		// Request workspace to save the updated state
		this.app.workspace.requestSaveLayout();
	}

	/**
	 * Record the live session id so it survives an app restart. Persisted via
	 * getState(); restored as initialSessionId on the next launch.
	 */
	setSessionId(sessionId: string | null): void {
		if (this.currentSessionId === sessionId) return;
		this.currentSessionId = sessionId;
		this.app.workspace.requestSaveLayout();
	}

	/**
	 * Record the live working directory. Without this the view would reopen at
	 * the vault root and fail to restore a session that belongs to a subfolder.
	 */
	setCwd(cwd: string): void {
		if (this.initialCwd === cwd) return;
		this.initialCwd = cwd;
		this.app.workspace.requestSaveLayout();
	}

	/**
	 * Register a callback to be notified when agentId is restored from workspace state.
	 * Used by React components to sync with Obsidian's setState lifecycle.
	 * @returns Unsubscribe function
	 */
	onAgentIdRestored(callback: (agentId: string) => void): () => void {
		this.agentIdRestoredCallbacks.add(callback);
		return () => {
			this.agentIdRestoredCallbacks.delete(callback);
		};
	}

	// ============================================================
	// Callbacks from ChatPanel
	// ============================================================

	/**
	 * Register callbacks from ChatPanel for IChatViewContainer delegation.
	 */
	setCallbacks(callbacks: ChatPanelCallbacks): void {
		this.callbacks = callbacks;
	}

	getDisplayName(): string {
		return this.callbacks?.getDisplayName() ?? "Chat";
	}

	getSessionStatus(): SessionStatus {
		return this.callbacks?.getSessionStatus() ?? "disconnected";
	}

	getSessionTitle(): string {
		return this.callbacks?.getSessionTitle() ?? "New session";
	}

	getSessionId(): string | null {
		return this.callbacks?.getSessionId() ?? null;
	}

	hasWorkInProgress(): boolean {
		return this.callbacks?.hasWorkInProgress() ?? false;
	}

	getWorkingDirectory(): string {
		return this.callbacks?.getWorkingDirectory() ?? "";
	}

	getUsage() {
		return this.callbacks?.getUsage() ?? null;
	}

	getModeLabel(): string | null {
		return this.callbacks?.getModeLabel() ?? null;
	}

	closeContainer(): void {
		this.leaf.detach();
	}

	refreshDisplayText(): void {
		// Undocumented WorkspaceLeaf.updateHeader() — Obsidian core uses the same internal method to refresh tab headers.
		const leaf = this.leaf as unknown as { updateHeader?: () => void };
		leaf.updateHeader?.();
	}

	/**
	 * Get current input state (text + images).
	 * Returns null if React component not mounted.
	 */
	getInputState(): ChatInputState | null {
		return this.callbacks?.getInputState() ?? null;
	}

	/**
	 * Set input state (text + images).
	 */
	setInputState(state: ChatInputState): void {
		this.callbacks?.setInputState(state);
	}

	/**
	 * Trigger send message. Returns true if message was sent.
	 */
	async sendMessage(): Promise<boolean> {
		return (await this.callbacks?.sendMessage()) ?? false;
	}

	/**
	 * Check if this view can send a message.
	 */
	canSend(): boolean {
		return this.callbacks?.canSend() ?? false;
	}

	/**
	 * Cancel current operation.
	 */
	async cancelOperation(): Promise<void> {
		await this.callbacks?.cancelOperation();
	}

	// ============================================================
	// IChatViewContainer Implementation
	// ============================================================

	/**
	 * Called when this view becomes the active/focused view.
	 */
	onActivate(): void {
		this.logger.log(`[ChatView] Activated: ${this.viewId}`);
	}

	/**
	 * Called when this view loses active/focused status.
	 */
	onDeactivate(): void {
		this.logger.log(`[ChatView] Deactivated: ${this.viewId}`);
	}

	/**
	 * Programmatically focus this view's input.
	 * Reveals the leaf first so that Obsidian switches to this tab
	 * before focusing the textarea (required for sidebar tabs).
	 */
	focus(): void {
		void this.app.workspace.revealLeaf(this.leaf).then(() => {
			const textarea = this.containerEl.querySelector(
				"textarea.agent-client-chat-input-textarea",
			);
			if (textarea instanceof HTMLTextAreaElement) {
				textarea.focus();
			}
		});
	}

	/**
	 * Check if this view currently has focus.
	 */
	hasFocus(): boolean {
		return this.containerEl.contains(activeDocument.activeElement);
	}

	/**
	 * Expand the view if it's in a collapsed state.
	 * Sidebar views don't have expand/collapse state - no-op.
	 */
	expand(): void {
		// Sidebar views don't have expand/collapse state - no-op
	}

	collapse(): void {
		// Sidebar views don't have expand/collapse state - no-op
	}

	/**
	 * Get the DOM container element for this view.
	 */
	getContainerEl(): HTMLElement {
		return this.containerEl;
	}

	onOpen() {
		const container = this.containerEl.children[1];
		container.empty();

		// Create services owned by this class
		this.acpClient = this.plugin.getOrCreateAcpClient(this.viewId);
		this.vaultService = new VaultService(this.plugin);

		this.root = createRoot(container);
		this.root.render(
			<ChatComponent
				plugin={this.plugin}
				view={this}
				viewId={this.viewId}
			/>,
		);

		// Register with plugin's view registry
		this.plugin.viewRegistry.register(this);

		// Claim/settle the primary badge now that this view is registered.
		this.plugin.reconcilePrimaryView();

		// Obsidian recreates tab header elements on layout changes, dropping
		// any class we set — re-mark on every layout change.
		this.applyTabHeaderClass();
		this.registerEvent(
			this.app.workspace.on("layout-change", () =>
				this.applyTabHeaderClass(),
			),
		);

		return Promise.resolve();
	}

	async onClose(): Promise<void> {
		this.logger.log("[ChatView] onClose() called");

		// Unregister from plugin's view registry
		this.plugin.viewRegistry.unregister(this.viewId);

		// If this view held the primary badge, hand it to a surviving view.
		this.plugin.reconcilePrimaryView();

		// Cleanup is handled by React useEffect cleanup in ChatPanel
		// which performs auto-export and closeSession
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}

		// Cleanup services owned by this class
		this.vaultService?.destroy();

		// Remove adapter for this view (disconnect process)
		await this.plugin.removeAcpClient(this.viewId);
	}
}
