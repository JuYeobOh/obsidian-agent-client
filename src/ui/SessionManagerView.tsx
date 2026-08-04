import {
	ItemView,
	WorkspaceLeaf,
	setIcon,
	Menu,
	Notice,
	Platform,
	FileSystemAdapter,
} from "obsidian";
import * as React from "react";
const { useRef, useEffect, useCallback, useMemo, useState } = React;
import { useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";

import type AgentClientPlugin from "../plugin";
import type {
	IChatViewContainer,
	SessionStatus,
} from "../services/view-registry";
import type { SavedSessionInfo, SessionUsage } from "../types/session";
import { convertWslPathToWindows } from "../utils/platform";
import { addRenameSessionMenuItem, EditTitleModal } from "./EditTitleModal";
import { ConfirmDeleteModal } from "./SessionHistoryModal";
import { useSettings } from "../hooks/useSettings";

export const VIEW_TYPE_SESSION_MANAGER = "agent-client-session-manager";

// ============================================================================
// Folder helpers
// ============================================================================

/**
 * Normalize a folder path into a stable grouping key.
 * Handles Windows/WSL format differences and trailing slashes;
 * case-insensitive on Windows.
 */
function normalizeFolderKey(path: string): string {
	const win = convertWslPathToWindows(path);
	const normalized = win.replace(/\\/g, "/").replace(/\/+$/, "");
	return Platform.isWin ? normalized.toLowerCase() : normalized;
}

/** Last path segment, for display (e.g. "C:\vault\notes" → "notes"). */
function folderBasename(path: string): string {
	const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
	const segments = normalized.split("/").filter((s) => s.length > 0);
	return segments[segments.length - 1] ?? normalized;
}

/** Compact relative-time label ("2h ago", "yesterday", "Mar 3"). */
function formatRelativeTime(date: Date): string {
	const diffMs = Date.now() - date.getTime();
	const minutes = Math.floor(diffMs / 60000);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days === 1) return "yesterday";
	if (days < 7) return `${days}d ago`;
	const month = date.toLocaleString("default", { month: "short" });
	return `${month} ${date.getDate()}`;
}

/** Compact token count ("32.1k", "1.2M"). */
function formatTokenCount(count: number): string {
	if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
	return String(count);
}

/** Color class matching InputToolbar's usage thresholds. */
function getUsageColorClass(percentage: number): string {
	if (percentage >= 90) return "agent-client-usage-danger";
	if (percentage >= 80) return "agent-client-usage-warning";
	if (percentage >= 70) return "agent-client-usage-caution";
	return "agent-client-usage-normal";
}

interface FolderGroup {
	/** Normalized grouping key */
	key: string;
	/** Original path for display / new sessions */
	path: string;
	pinned: boolean;
	/** Live chat views working in this folder */
	views: IChatViewContainer[];
	/** Saved sessions in this folder, excluding ones already open in a view */
	sessions: SavedSessionInfo[];
	/** Most recent activity (ms epoch) for sorting unpinned groups */
	latestActivity: number;
}

// ============================================================================
// React Components
// ============================================================================

function ObsidianIcon({
	name,
	className,
}: {
	name: string;
	className?: string;
}) {
	const ref = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		if (ref.current) setIcon(ref.current, name);
	}, [name]);
	return <span ref={ref} className={className} />;
}

function SessionStatusIcon({ status }: { status: SessionStatus }) {
	const iconName = ((s: SessionStatus): string => {
		switch (s) {
			case "ready":
				return "circle-check";
			case "busy":
				return "loader";
			case "permission":
				return "shield-alert";
			case "error":
				return "circle-x";
			case "disconnected":
				return "circle-off";
		}
	})(status);

	return (
		<ObsidianIcon
			name={iconName}
			className={`agent-client-session-status-icon agent-client-session-status-${status}`}
		/>
	);
}

/** Row for a live (open) chat view. */
const ActiveSessionItem = React.memo(function ActiveSessionItem({
	view,
	isFocused,
	plugin,
	status,
	title,
	agentName,
	modeLabel,
	usage,
}: {
	view: IChatViewContainer;
	isFocused: boolean;
	plugin: AgentClientPlugin;
	status: SessionStatus;
	title: string;
	agentName: string;
	modeLabel: string | null;
	usage: SessionUsage | null;
}) {
	const moreRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (moreRef.current) setIcon(moreRef.current, "more-horizontal");
	}, []);

	const handleClick = useCallback(() => view.focus(), [view]);

	const showMenu = useCallback(
		(position: { x: number; y: number }) => {
			const menu = new Menu();

			addRenameSessionMenuItem(
				menu,
				plugin,
				view.getSessionId(),
				view.getSessionTitle(),
				{ label: "Rename" },
			);

			menu.addItem((item) => {
				item.setTitle("Close")
					.setIcon("x")
					.onClick(() => {
						plugin.closeView(view.viewId);
					});
			});

			menu.showAtPosition(position);
		},
		[plugin, view],
	);

	const handleMoreClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			showMenu({ x: e.clientX, y: e.clientY });
		},
		[showMenu],
	);

	const handleContextMenu = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			showMenu({ x: e.clientX, y: e.clientY });
		},
		[showMenu],
	);

	return (
		<div className="tree-item">
			<div
				className={`tree-item-self is-clickable agent-client-session-row ${isFocused ? "is-active" : ""}`}
				onClick={handleClick}
				onContextMenu={handleContextMenu}
			>
				<SessionStatusIcon status={status} />
				<div className="tree-item-inner agent-client-session-item-text">
					<div
						className="agent-client-session-item-title"
						aria-label={title}
					>
						{title}
					</div>
					<div
						className="agent-client-session-item-agent"
						aria-label={agentName}
					>
						{agentName}
						{modeLabel && (
							<span className="agent-client-session-item-mode">
								{" · "}
								{modeLabel}
							</span>
						)}
						{usage && usage.size > 0 && (
							<span
								className={`agent-client-session-item-usage ${getUsageColorClass(
									Math.round(
										(usage.used / usage.size) * 100,
									),
								)}`}
								title={`${formatTokenCount(usage.used)} / ${formatTokenCount(usage.size)} tokens`}
							>
								{" · "}
								{Math.round((usage.used / usage.size) * 100)}%
							</span>
						)}
					</div>
				</div>
				<button
					ref={moreRef}
					type="button"
					className="agent-client-session-item-more clickable-icon"
					aria-label="Session actions"
					onClick={handleMoreClick}
				/>
			</div>
		</div>
	);
});

/** Row for a saved (not currently open) session. */
const SavedSessionItem = React.memo(function SavedSessionItem({
	session,
	plugin,
	agentName,
	onOpen,
}: {
	session: SavedSessionInfo;
	plugin: AgentClientPlugin;
	agentName: string;
	onOpen: (
		session: SavedSessionInfo,
		opts?: { newView?: boolean },
	) => void;
}) {
	const moreRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (moreRef.current) setIcon(moreRef.current, "more-horizontal");
	}, []);

	const title = session.title ?? "Untitled Session";
	// Ctrl/Cmd-click opens the session in an additional view (its own tab
	// icon) instead of taking over the current one.
	const handleClick = useCallback(
		(e: React.MouseEvent) =>
			onOpen(session, { newView: e.ctrlKey || e.metaKey }),
		[onOpen, session],
	);

	const showMenu = useCallback(
		(position: { x: number; y: number }) => {
			const menu = new Menu();

			menu.addItem((item) => {
				item.setTitle("Open")
					.setIcon("play")
					.onClick(() => onOpen(session));
			});

			menu.addItem((item) => {
				item.setTitle("Open in new view")
					.setIcon("plus-square")
					.onClick(() => onOpen(session, { newView: true }));
			});

			addRenameSessionMenuItem(menu, plugin, session.sessionId, title, {
				label: "Rename",
			});

			menu.addSeparator();

			menu.addItem((item) => {
				item.setTitle("Delete")
					.setIcon("trash-2")
					.onClick(() => {
						new ConfirmDeleteModal(plugin.app, title, async () => {
							await plugin.settingsService.deleteSession(
								session.sessionId,
							);
						}).open();
					});
			});

			menu.showAtPosition(position);
		},
		[plugin, session, title, onOpen],
	);

	const handleMoreClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			showMenu({ x: e.clientX, y: e.clientY });
		},
		[showMenu],
	);

	const handleContextMenu = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			showMenu({ x: e.clientX, y: e.clientY });
		},
		[showMenu],
	);

	return (
		<div className="tree-item">
			<div
				className="tree-item-self is-clickable agent-client-session-row agent-client-saved-session-row"
				onClick={handleClick}
				onContextMenu={handleContextMenu}
			>
				<ObsidianIcon
					name="history"
					className="agent-client-session-status-icon agent-client-saved-session-icon"
				/>
				<div className="tree-item-inner agent-client-session-item-text">
					<div
						className="agent-client-session-item-title"
						aria-label={title}
					>
						{title}
					</div>
					<div className="agent-client-session-item-agent">
						{agentName}
						{session.updatedAt && (
							<span className="agent-client-session-item-time">
								{" · "}
								{formatRelativeTime(new Date(session.updatedAt))}
							</span>
						)}
					</div>
				</div>
				<button
					ref={moreRef}
					type="button"
					className="agent-client-session-item-more clickable-icon"
					aria-label="Session actions"
					onClick={handleMoreClick}
				/>
			</div>
		</div>
	);
});

/** Collapsible folder group header + its session rows. */
function FolderGroupSection({
	group,
	label,
	collapsed,
	plugin,
	focusedId,
	agentNameById,
	canMoveUp,
	canMoveDown,
	onToggleCollapse,
	onPin,
	onUnpin,
	onMove,
	onRename,
	onNewChat,
	onOpenSaved,
	onDragStart,
	onDrop,
}: {
	group: FolderGroup;
	label: string;
	collapsed: boolean;
	plugin: AgentClientPlugin;
	focusedId: string | null;
	agentNameById: Map<string, string>;
	canMoveUp: boolean;
	canMoveDown: boolean;
	onToggleCollapse: (key: string) => void;
	onPin: (key: string) => void;
	onUnpin: (key: string) => void;
	onMove: (key: string, direction: -1 | 1) => void;
	onRename: (key: string, currentLabel: string) => void;
	onNewChat: (path: string, opts?: { newView?: boolean }) => void;
	onOpenSaved: (
		session: SavedSessionInfo,
		opts?: { newView?: boolean },
	) => void;
	onDragStart: (key: string) => void;
	onDrop: (targetKey: string) => void;
}) {
	const count = group.views.length + group.sessions.length;
	const [isDragOver, setIsDragOver] = useState(false);

	const showMenu = useCallback(
		(position: { x: number; y: number }) => {
			const menu = new Menu();

			if (group.pinned) {
				menu.addItem((item) => {
					item.setTitle("Unpin folder")
						.setIcon("pin-off")
						.onClick(() => onUnpin(group.key));
				});
			} else {
				menu.addItem((item) => {
					item.setTitle("Pin folder")
						.setIcon("pin")
						.onClick(() => onPin(group.key));
				});
			}

			if (canMoveUp) {
				menu.addItem((item) => {
					item.setTitle("Move up")
						.setIcon("arrow-up")
						.onClick(() => onMove(group.key, -1));
				});
			}
			if (canMoveDown) {
				menu.addItem((item) => {
					item.setTitle("Move down")
						.setIcon("arrow-down")
						.onClick(() => onMove(group.key, 1));
				});
			}

			menu.addItem((item) => {
				item.setTitle("Rename folder")
					.setIcon("pencil")
					.onClick(() => onRename(group.key, label));
			});

			menu.addSeparator();

			menu.addItem((item) => {
				item.setTitle("New chat in this folder")
					.setIcon("plus")
					.onClick(() => onNewChat(group.path));
			});

			menu.addItem((item) => {
				item.setTitle("Copy path")
					.setIcon("copy")
					.onClick(() => {
						void navigator.clipboard.writeText(group.path);
						new Notice("Path copied");
					});
			});

			menu.showAtPosition(position);
		},
		[
			group,
			label,
			canMoveUp,
			canMoveDown,
			onPin,
			onUnpin,
			onMove,
			onRename,
			onNewChat,
		],
	);

	const handleHeaderClick = useCallback(
		() => onToggleCollapse(group.key),
		[onToggleCollapse, group.key],
	);

	const handleContextMenu = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			showMenu({ x: e.clientX, y: e.clientY });
		},
		[showMenu],
	);

	const handleMoreClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			showMenu({ x: e.clientX, y: e.clientY });
		},
		[showMenu],
	);

	const handleNewChatClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onNewChat(group.path, { newView: e.ctrlKey || e.metaKey });
		},
		[onNewChat, group.path],
	);

	return (
		<div className="agent-client-folder-group">
			<div
				className={`agent-client-folder-header is-clickable ${isDragOver ? "agent-client-folder-drop-target" : ""}`}
				onClick={handleHeaderClick}
				onContextMenu={handleContextMenu}
				title={group.path}
				draggable
				onDragStart={(e) => {
					e.dataTransfer.effectAllowed = "move";
					onDragStart(group.key);
				}}
				onDragOver={(e) => {
					e.preventDefault();
					e.dataTransfer.dropEffect = "move";
					setIsDragOver(true);
				}}
				onDragLeave={() => setIsDragOver(false)}
				onDrop={(e) => {
					e.preventDefault();
					setIsDragOver(false);
					onDrop(group.key);
				}}
			>
				<ObsidianIcon
					name={collapsed ? "chevron-right" : "chevron-down"}
					className="agent-client-folder-chevron"
				/>
				<ObsidianIcon
					name={group.pinned ? "pin" : "folder"}
					className={`agent-client-folder-icon ${group.pinned ? "agent-client-folder-pinned" : ""}`}
				/>
				<span className="agent-client-folder-label">{label}</span>
				<span className="agent-client-folder-count">{count}</span>
				<button
					type="button"
					className="clickable-icon agent-client-folder-action"
					aria-label="New chat in this folder"
					onClick={handleNewChatClick}
					ref={(el) => {
						if (el) setIcon(el, "plus");
					}}
				/>
				<button
					type="button"
					className="clickable-icon agent-client-folder-action"
					aria-label="Folder actions"
					onClick={handleMoreClick}
					ref={(el) => {
						if (el) setIcon(el, "more-horizontal");
					}}
				/>
			</div>

			{!collapsed && (
				<div className="agent-client-folder-children">
					{group.views.map((view) => (
						<ActiveSessionItem
							key={view.viewId}
							view={view}
							isFocused={view.viewId === focusedId}
							plugin={plugin}
							status={view.getSessionStatus()}
							title={view.getSessionTitle()}
							agentName={view.getDisplayName()}
							modeLabel={view.getModeLabel()}
							usage={view.getUsage()}
						/>
					))}
					{group.sessions.map((session) => (
						<SavedSessionItem
							key={session.sessionId}
							session={session}
							plugin={plugin}
							agentName={
								agentNameById.get(session.agentId) ??
								session.agentId
							}
							onOpen={onOpenSaved}
						/>
					))}
					{count === 0 && (
						<div className="agent-client-folder-empty">
							No sessions
						</div>
					)}
				</div>
			)}
		</div>
	);
}

/**
 * The session tree itself. Rendered both as the standalone Session Manager view
 * and as the in-chat drawer, so the two can never drift apart.
 *
 * @param onNavigate - fired once a session/new chat has been opened, letting the
 *   drawer close itself. Omitted by the standalone view, which stays put.
 */
export function SessionManagerComponent({
	plugin,
	onNavigate,
}: {
	plugin: AgentClientPlugin;
	onNavigate?: () => void;
}) {
	const { views, focusedId } = useSyncExternalStore(
		plugin.viewRegistry.subscribe,
		plugin.viewRegistry.getSnapshot,
		plugin.viewRegistry.getSnapshot,
	);

	// Subscribe to settings changes (saved sessions, pins, aliases, renames)
	const settings = useSettings(plugin);
	const sessionManagerState = settings.sessionManager;

	const vaultBasePath = useMemo(() => {
		const adapter = plugin.app.vault.adapter;
		return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
	}, [plugin]);

	const agentNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const agent of plugin.getAvailableAgents()) {
			map.set(agent.id, agent.displayName);
		}
		return map;
	}, [plugin, settings]);

	// ------------------------------------------------------------
	// Build folder groups from live views + saved sessions
	// ------------------------------------------------------------
	const groups = useMemo(() => {
		const map = new Map<string, FolderGroup>();

		const getGroup = (path: string): FolderGroup => {
			const key = normalizeFolderKey(path);
			let group = map.get(key);
			if (!group) {
				group = {
					key,
					path,
					pinned: sessionManagerState.pinnedFolders.includes(key),
					views: [],
					sessions: [],
					latestActivity: 0,
				};
				map.set(key, group);
			}
			return group;
		};

		// Live views group under their agent cwd (fallback: vault root)
		const openSessionIds = new Set<string>();
		for (const view of views) {
			const cwd = view.getWorkingDirectory() || vaultBasePath;
			if (!cwd) continue;
			const group = getGroup(cwd);
			group.views.push(view);
			group.latestActivity = Date.now();
			const sid = view.getSessionId();
			if (sid) openSessionIds.add(sid);
		}

		// Saved sessions (all agents), skipping ones already open in a view
		for (const session of settings.savedSessions ?? []) {
			if (!session.cwd) continue;
			if (openSessionIds.has(session.sessionId)) continue;
			const group = getGroup(session.cwd);
			group.sessions.push(session);
			const activity = new Date(session.updatedAt).getTime();
			if (!Number.isNaN(activity) && activity > group.latestActivity) {
				group.latestActivity = activity;
			}
		}

		// Pinned folders always appear, even when currently empty
		for (const pinnedKey of sessionManagerState.pinnedFolders) {
			if (!map.has(pinnedKey)) {
				map.set(pinnedKey, {
					key: pinnedKey,
					path: pinnedKey,
					pinned: true,
					views: [],
					sessions: [],
					latestActivity: 0,
				});
			}
		}

		// Sort sessions within each group by recency
		for (const group of map.values()) {
			group.sessions.sort(
				(a, b) =>
					new Date(b.updatedAt).getTime() -
					new Date(a.updatedAt).getTime(),
			);
		}

		// Pinned first; within each section user-defined folderOrder wins,
		// then most-recent activity.
		const orderIndex = new Map(
			sessionManagerState.folderOrder.map((k, i) => [k, i]),
		);
		const pinnedIndex = new Map(
			sessionManagerState.pinnedFolders.map((k, i) => [k, i]),
		);
		const rank = (g: FolderGroup): number => {
			const idx = orderIndex.get(g.key);
			if (idx !== undefined) return idx;
			const pIdx = pinnedIndex.get(g.key);
			// Not-yet-ordered pinned folders keep their pin order, after
			// explicitly ordered ones
			return pIdx !== undefined
				? sessionManagerState.folderOrder.length + pIdx
				: Number.MAX_SAFE_INTEGER;
		};
		return Array.from(map.values()).sort((a, b) => {
			if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
			const ra = rank(a);
			const rb = rank(b);
			if (ra !== rb) return ra - rb;
			return b.latestActivity - a.latestActivity;
		});
	}, [views, settings.savedSessions, sessionManagerState, vaultBasePath]);

	// ------------------------------------------------------------
	// Settings mutations (pin / order / alias / collapse)
	// ------------------------------------------------------------
	const updateSessionManager = useCallback(
		(
			updater: (
				current: typeof sessionManagerState,
			) => typeof sessionManagerState,
		) => {
			const current =
				plugin.settingsService.getSnapshot().sessionManager;
			void plugin.settingsService.updateSettings({
				sessionManager: updater(current),
			});
		},
		[plugin],
	);

	const handlePin = useCallback(
		(key: string) => {
			updateSessionManager((cur) => ({
				...cur,
				pinnedFolders: cur.pinnedFolders.includes(key)
					? cur.pinnedFolders
					: [...cur.pinnedFolders, key],
			}));
		},
		[updateSessionManager],
	);

	const handleUnpin = useCallback(
		(key: string) => {
			updateSessionManager((cur) => ({
				...cur,
				pinnedFolders: cur.pinnedFolders.filter((k) => k !== key),
			}));
		},
		[updateSessionManager],
	);

	// Persist the full displayed sequence as the manual folder order.
	// Both the context-menu Move up/down and drag & drop funnel through this,
	// so the stored order always reflects exactly what the user sees.
	const persistFolderOrder = useCallback(
		(sequence: FolderGroup[]) => {
			const keys = sequence.map((g) => g.key);
			updateSessionManager((cur) => ({ ...cur, folderOrder: keys }));
		},
		[updateSessionManager],
	);

	const handleMoveFolder = useCallback(
		(key: string, direction: -1 | 1) => {
			const seq = [...groups];
			const i = seq.findIndex((g) => g.key === key);
			const j = i + direction;
			if (i < 0 || j < 0 || j >= seq.length) return;
			// Pinned and unpinned sections don't mix
			if (seq[i].pinned !== seq[j].pinned) return;
			[seq[i], seq[j]] = [seq[j], seq[i]];
			persistFolderOrder(seq);
		},
		[groups, persistFolderOrder],
	);

	const draggedFolderRef = useRef<string | null>(null);

	const handleFolderDragStart = useCallback((key: string) => {
		draggedFolderRef.current = key;
	}, []);

	const handleFolderDrop = useCallback(
		(targetKey: string) => {
			const draggedKey = draggedFolderRef.current;
			draggedFolderRef.current = null;
			if (!draggedKey || draggedKey === targetKey) return;
			const seq = [...groups];
			const from = seq.findIndex((g) => g.key === draggedKey);
			if (from < 0) return;
			const [item] = seq.splice(from, 1);
			const to = seq.findIndex((g) => g.key === targetKey);
			if (to < 0) return;
			seq.splice(to, 0, item);
			// Keep the pinned section contiguous at the top
			persistFolderOrder([
				...seq.filter((g) => g.pinned),
				...seq.filter((g) => !g.pinned),
			]);
		},
		[groups, persistFolderOrder],
	);

	const handleToggleCollapse = useCallback(
		(key: string) => {
			updateSessionManager((cur) => ({
				...cur,
				collapsedFolders: cur.collapsedFolders.includes(key)
					? cur.collapsedFolders.filter((k) => k !== key)
					: [...cur.collapsedFolders, key],
			}));
		},
		[updateSessionManager],
	);

	const handleRename = useCallback(
		(key: string, currentLabel: string) => {
			new EditTitleModal(plugin.app, currentLabel, (newTitle) => {
				updateSessionManager((cur) => {
					const aliases = { ...cur.folderAliases };
					if (newTitle.trim().length === 0) {
						delete aliases[key];
					} else {
						aliases[key] = newTitle.trim();
					}
					return { ...cur, folderAliases: aliases };
				});
			}).open();
		},
		[plugin, updateSessionManager],
	);

	// ------------------------------------------------------------
	// Open actions — reuse the current chat view when one exists
	// (replacing its content, like Claude Code) instead of spawning a
	// new view + adapter process, which is much slower.
	// ------------------------------------------------------------
	/**
	 * Find a view we may take over.
	 *
	 * Folder no longer matters: a view can swap to a session in any folder
	 * without restarting its agent, so reusing one keeps switching instant and
	 * keeps a single chat pane. The only view we must not take over is one
	 * that's mid-turn (or waiting on a permission) — that would abandon a
	 * running answer, so the caller opens a new view and lets it finish in the
	 * background.
	 */
	const pickTargetView = useCallback((): IChatViewContainer | null => {
		// Keyed off hasWorkInProgress(), not the "busy" display status: "busy"
		// also covers a session that is merely loading, so using it meant every
		// rapid click landed on a still-loading view and opened yet another tab.
		const isReusable = (v: IChatViewContainer) => !v.hasWorkInProgress();

		const focused = plugin.viewRegistry.getFocused();
		if (focused && isReusable(focused)) return focused;
		return plugin.viewRegistry.getAll().find(isReusable) ?? null;
	}, [plugin]);

	const handleNewChat = useCallback(
		(path: string, opts?: { newView?: boolean }) => {
			// newView (Ctrl/Cmd-click): the user explicitly wants another
			// view — and is knowingly paying for another adapter process —
			// so skip reuse and fall through to the create-a-view branch.
			const target = opts?.newView ? null : pickTargetView();
			if (target) {
				target.focus();
				plugin.app.workspace.trigger(
					"agent-client:new-chat-in-directory",
					target.viewId,
					path,
				);
			} else {
				void plugin.openChatViewForSession({
					cwd: path,
					deliberate: opts?.newView,
				});
			}
			onNavigate?.();
		},
		[plugin, pickTargetView, onNavigate],
	);

	const handleOpenSaved = useCallback(
		(session: SavedSessionInfo, opts?: { newView?: boolean }) => {
			// Already open in a view? Focus it instead of duplicating — even
			// on Ctrl/Cmd-click: two views loading the same session id would
			// fight over one transcript.
			const live = plugin.viewRegistry
				.getAll()
				.find((v) => v.getSessionId() === session.sessionId);
			if (live) {
				live.focus();
				onNavigate?.();
				return;
			}
			// newView (Ctrl/Cmd-click): skip reuse, fall through to the
			// create-a-view branch below.
			const target = opts?.newView ? null : pickTargetView();
			if (target) {
				target.focus();
				plugin.app.workspace.trigger(
					"agent-client:open-session-requested",
					target.viewId,
					session.sessionId,
					session.cwd,
					session.agentId,
				);
			} else {
				void plugin.openChatViewForSession({
					agentId: session.agentId,
					cwd: session.cwd,
					sessionId: session.sessionId,
					deliberate: opts?.newView,
				});
			}
			onNavigate?.();
		},
		[plugin, pickTargetView, onNavigate],
	);

	if (groups.length === 0) {
		return (
			<div className="agent-client-session-manager-empty">
				No sessions yet
			</div>
		);
	}

	return (
		<div className="agent-client-session-manager">
			{groups.map((group, index) => (
				<FolderGroupSection
					key={group.key}
					group={group}
					label={
						sessionManagerState.folderAliases[group.key] ??
						folderBasename(group.path)
					}
					collapsed={sessionManagerState.collapsedFolders.includes(
						group.key,
					)}
					plugin={plugin}
					focusedId={focusedId}
					agentNameById={agentNameById}
					canMoveUp={
						index > 0 && groups[index - 1].pinned === group.pinned
					}
					canMoveDown={
						index < groups.length - 1 &&
						groups[index + 1].pinned === group.pinned
					}
					onToggleCollapse={handleToggleCollapse}
					onPin={handlePin}
					onUnpin={handleUnpin}
					onMove={handleMoveFolder}
					onRename={handleRename}
					onNewChat={handleNewChat}
					onOpenSaved={handleOpenSaved}
					onDragStart={handleFolderDragStart}
					onDrop={handleFolderDrop}
				/>
			))}
		</div>
	);
}

// ============================================================================
// Obsidian ItemView
// ============================================================================

export class SessionManagerView extends ItemView {
	private root: Root | null = null;
	private plugin: AgentClientPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: AgentClientPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.navigation = false;
	}

	getViewType() {
		return VIEW_TYPE_SESSION_MANAGER;
	}

	getDisplayText() {
		return "Agent sessions";
	}

	getIcon() {
		return "layout-list";
	}

	onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		this.root = createRoot(container);
		this.root.render(
			<SessionManagerComponent plugin={this.plugin} />,
		);
		return Promise.resolve();
	}

	async onClose() {
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
	}
}
