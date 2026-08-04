import * as React from "react";
const { useRef, useEffect, useCallback, useMemo, useState } = React;
import { createPortal } from "react-dom";
import { setIcon, Menu } from "obsidian";

import {
	flattenConfigSelectOptions,
	type SessionModeState,
	type SessionUsage,
	type SessionConfigOption,
	type SessionConfigSelectGroup,
} from "../types/session";
import { fetchPlanUsage, type PlanUsage } from "../services/plan-usage";

// ============================================================================
// ToolbarDropdown — themed dropdown using Obsidian's Menu
// ============================================================================

interface ToolbarDropdownItem {
	value: string;
	label: string;
	groupName?: string;
}

interface ToolbarDropdownProps {
	label: string;
	title: string;
	items: ToolbarDropdownItem[];
	currentValue: string | undefined;
	onChange: (value: string) => void;
	className?: string;
}

/**
 * Themed dropdown trigger. Uses Obsidian's Menu instead of a native <select>
 * so the open state respects Obsidian theme tokens, supports keyboard nav,
 * and can be positioned above the trigger to avoid covering the input.
 */
function ToolbarDropdown({
	label,
	title,
	items,
	currentValue,
	onChange,
	className,
}: ToolbarDropdownProps) {
	const buttonRef = useRef<HTMLButtonElement>(null);
	const chevronRef = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		if (chevronRef.current) {
			setIcon(chevronRef.current, "chevron-down");
		}
	}, []);

	const handleClick = useCallback(
		(e: React.MouseEvent<HTMLButtonElement>) => {
			e.preventDefault();
			e.stopPropagation();

			const menu = new Menu();

			menu.addItem((menuItem) => {
				menuItem.setTitle(title).setIsLabel(true);
			});

			let lastGroupName: string | undefined;
			for (const item of items) {
				if (
					item.groupName &&
					item.groupName !== lastGroupName &&
					lastGroupName !== undefined
				) {
					menu.addSeparator();
				}
				lastGroupName = item.groupName;

				menu.addItem((menuItem) => {
					menuItem
						.setTitle(item.label)
						.setChecked(item.value === currentValue)
						.onClick(() => {
							onChange(item.value);
						});
				});
			}

			menu.showAtMouseEvent(e.nativeEvent);
			buttonRef.current?.blur();
		},
		[items, currentValue, onChange],
	);

	const wrapperClass = `agent-client-toolbar-dropdown${className ? ` ${className}` : ""}`;

	return (
		<button
			ref={buttonRef}
			type="button"
			className={wrapperClass}
			title={title}
			onClick={handleClick}
		>
			<span className="agent-client-toolbar-dropdown-label-area">
				{items.map((item) => (
					<span
						key={item.value}
						className="agent-client-toolbar-dropdown-sizer"
					>
						{item.label}
					</span>
				))}
				<span className="agent-client-toolbar-dropdown-label">
					{label}
				</span>
			</span>
			<span
				ref={chevronRef}
				className="agent-client-toolbar-dropdown-chevron"
				aria-hidden="true"
			/>
		</button>
	);
}

// ============================================================================
// Utility Functions
// ============================================================================

/** Format token count for display (e.g., 21367 → "21.4K", 200000 → "200K") */
function formatTokenCount(tokens: number): string {
	if (tokens < 1000) return String(tokens);
	const k = tokens / 1000;
	return k >= 100 ? `${Math.round(k)}K` : `${k.toFixed(1)}K`;
}

/** Get CSS class for usage percentage color thresholds */
function getUsageColorClass(percentage: number): string {
	if (percentage >= 90) return "agent-client-usage-danger";
	if (percentage >= 80) return "agent-client-usage-warning";
	if (percentage >= 70) return "agent-client-usage-caution";
	return "agent-client-usage-normal";
}

// ============================================================================
// Config option helpers + collapsed options menu
// ============================================================================

type SelectConfigOption = Extract<SessionConfigOption, { type: "select" }>;

/**
 * Compact chip label: strip a trailing parenthetical so chips stay short —
 * "Default (recommended)" → "Default", "Opus (1M context)" → "Opus".
 * The full label remains visible inside the menu.
 */
function shortOptionLabel(label: string): string {
	const stripped = label.replace(/\s*\([^)]*\)\s*$/, "").trim();
	return stripped.length > 0 ? stripped : label;
}

/** Build flat dropdown items for a select config option (grouped or flat). */
function buildDropdownItems(option: SelectConfigOption): ToolbarDropdownItem[] {
	const isGrouped =
		option.options.length > 0 && "group" in option.options[0];
	if (isGrouped) {
		const items: ToolbarDropdownItem[] = [];
		for (const group of option.options as SessionConfigSelectGroup[]) {
			for (const opt of group.options) {
				items.push({
					value: opt.value,
					label: `${group.name} / ${opt.name}`,
					groupName: group.name,
				});
			}
		}
		return items;
	}
	return flattenConfigSelectOptions(option.options).map((opt) => ({
		value: opt.value,
		label: opt.name,
	}));
}

/**
 * Single sliders icon that opens one menu containing all non-mode config
 * options (model, thought level, ...) as labelled sections with checkmarks.
 * Replaces the row of truncated text dropdowns.
 */
function OptionsMenuButton({
	options,
	onChange,
	pluginToggles = [],
}: {
	options: SelectConfigOption[];
	onChange?: (configId: string, value: string) => void;
	pluginToggles?: PluginToggle[];
}) {
	const buttonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (buttonRef.current) {
			setIcon(buttonRef.current, "sliders-horizontal");
		}
	}, []);

	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			const menu = new Menu();
			options.forEach((option, index) => {
				if (index > 0) menu.addSeparator();
				menu.addItem((item) => {
					item.setTitle(option.name).setIsLabel(true);
				});
				for (const entry of buildDropdownItems(option)) {
					menu.addItem((item) => {
						item.setTitle(entry.label)
							.setChecked(entry.value === option.currentValue)
							.onClick(() => {
								onChange?.(option.id, entry.value);
							});
					});
				}
			});
			// Plugin-managed toggles (e.g. "Show tool calls") below the
			// adapter options, matching the "under Fast mode" placement.
			if (pluginToggles.length > 0) {
				if (options.length > 0) menu.addSeparator();
				for (const toggle of pluginToggles) {
					menu.addItem((item) => {
						item.setTitle(toggle.label)
							.setChecked(toggle.checked)
							.onClick(() => toggle.onToggle());
					});
				}
			}
			menu.showAtMouseEvent(e.nativeEvent);
		},
		[options, onChange, pluginToggles],
	);

	// Tooltip summarising current selections, e.g. "Model: Opus (1M context)"
	const summary = options
		.map((option) => {
			const current = buildDropdownItems(option).find(
				(it) => it.value === option.currentValue,
			);
			return `${option.name}: ${current?.label ?? option.currentValue}`;
		})
		.join("\n");

	return (
		<button
			ref={buttonRef}
			type="button"
			className="clickable-icon agent-client-toolbar-options-button"
			aria-label={summary}
			title={summary}
			onClick={handleClick}
		/>
	);
}

// ============================================================================
// UsageIndicator — % badge; click opens a usage panel (context + plan limits)
// ============================================================================

/** "resets in 4h 9m" for <24h, otherwise localized weekday + time */
function formatReset(date: Date): string {
	const diffMs = date.getTime() - Date.now();
	if (diffMs <= 0) return "resets soon";
	const totalMinutes = Math.round(diffMs / 60000);
	if (totalMinutes < 24 * 60) {
		const h = Math.floor(totalMinutes / 60);
		const m = totalMinutes % 60;
		return h > 0 ? `resets in ${h}h ${m}m` : `resets in ${m}m`;
	}
	return `resets ${date.toLocaleString(undefined, {
		weekday: "short",
		hour: "numeric",
		minute: "2-digit",
	})}`;
}

/** Bar color class from API severity, falling back to percent thresholds */
function getSeverityColorClass(severity: string, percent: number): string {
	if (severity === "critical") return "agent-client-usage-danger";
	if (severity === "warning") return "agent-client-usage-warning";
	return getUsageColorClass(percent);
}

/**
 * Popover is rendered into document.body via a portal because the input box
 * has overflow:hidden (for its border radius) which would clip it.
 */
function UsageIndicator({ usage }: { usage: SessionUsage }) {
	const anchorRef = useRef<HTMLSpanElement>(null);
	const popoverRef = useRef<HTMLDivElement>(null);
	const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
	const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null);

	const percentage = Math.round((usage.used / usage.size) * 100);
	const colorClass = getUsageColorClass(percentage);
	const isOpen = anchorRect !== null;

	const handleToggle = useCallback(() => {
		if (isOpen) {
			setAnchorRect(null);
			return;
		}
		const rect = anchorRef.current?.getBoundingClientRect();
		if (rect) setAnchorRect(rect);
	}, [isOpen]);

	// Fetch plan limits when the panel opens (cached 60s in the service)
	useEffect(() => {
		if (!isOpen) return;
		let cancelled = false;
		void fetchPlanUsage().then((result) => {
			if (!cancelled) setPlanUsage(result);
		});
		return () => {
			cancelled = true;
		};
	}, [isOpen]);

	// Close on outside click, Escape, scroll, or resize
	useEffect(() => {
		if (!isOpen) return;
		const close = () => setAnchorRect(null);
		const onMouseDown = (e: MouseEvent) => {
			const target = e.target as Node;
			if (
				anchorRef.current?.contains(target) ||
				popoverRef.current?.contains(target)
			) {
				return;
			}
			close();
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") close();
		};
		activeDocument.addEventListener("mousedown", onMouseDown, true);
		activeDocument.addEventListener("keydown", onKeyDown);
		activeWindow.addEventListener("scroll", close, true);
		activeWindow.addEventListener("resize", close);
		return () => {
			activeDocument.removeEventListener("mousedown", onMouseDown, true);
			activeDocument.removeEventListener("keydown", onKeyDown);
			activeWindow.removeEventListener("scroll", close, true);
			activeWindow.removeEventListener("resize", close);
		};
	}, [isOpen]);

	const popover = anchorRect
		? createPortal(
				<div
					ref={popoverRef}
					className="agent-client-usage-popover"
					style={{
						left: anchorRect.left,
						bottom:
							activeWindow.innerHeight - anchorRect.top + 8,
					}}
				>
					<div className="agent-client-usage-popover-row">
						<span className="agent-client-usage-popover-label">
							Context window
						</span>
						<span className="agent-client-usage-popover-value">
							{formatTokenCount(usage.used)} /{" "}
							{formatTokenCount(usage.size)} ({percentage}%)
						</span>
					</div>
					<div className="agent-client-usage-popover-bar">
						<div
							className={`agent-client-usage-popover-fill ${colorClass}`}
							style={{
								width: `${Math.min(percentage, 100)}%`,
							}}
						/>
					</div>
					{usage.cost && (
						<div className="agent-client-usage-popover-row agent-client-usage-popover-cost">
							<span className="agent-client-usage-popover-label">
								Session cost
							</span>
							<span className="agent-client-usage-popover-value">
								${usage.cost.amount.toFixed(2)}{" "}
								{usage.cost.currency}
							</span>
						</div>
					)}
					{planUsage && planUsage.limits.length > 0 && (
						<>
							<div className="agent-client-usage-popover-divider" />
							{planUsage.limits.map((limit) => (
								<div
									key={limit.kind + limit.label}
									className="agent-client-usage-popover-limit"
								>
									<div className="agent-client-usage-popover-row">
										<span className="agent-client-usage-popover-label">
											{limit.label}
										</span>
										<span className="agent-client-usage-popover-value">
											{limit.resetsAt && (
												<span className="agent-client-usage-popover-reset">
													{formatReset(
														limit.resetsAt,
													)}
												</span>
											)}{" "}
											{Math.round(limit.percent)}%
										</span>
									</div>
									<div className="agent-client-usage-popover-bar">
										<div
											className={`agent-client-usage-popover-fill ${getSeverityColorClass(
												limit.severity,
												limit.percent,
											)}`}
											style={{
												width: `${Math.min(limit.percent, 100)}%`,
											}}
										/>
									</div>
								</div>
							))}
						</>
					)}
				</div>,
				activeDocument.body,
			)
		: null;

	return (
		<span
			ref={anchorRef}
			className={`agent-client-usage-indicator ${colorClass} ${isOpen ? "is-active" : ""}`}
			onClick={handleToggle}
			role="button"
			aria-label="Usage details"
		>
			{percentage}%{popover}
		</span>
	);
}

// ============================================================================
// InputToolbar
// ============================================================================

export interface InputToolbarProps {
	isSending: boolean;
	isButtonDisabled: boolean;
	hasContent: boolean;
	onSendOrStop: () => void;
	modes?: SessionModeState;
	onModeChange?: (modeId: string) => void;
	configOptions?: SessionConfigOption[];
	onConfigOptionChange?: (configId: string, value: string) => void;
	usage?: SessionUsage;
	isSessionReady: boolean;
	/** Whether tool-call blocks are shown in the chat (plugin display setting) */
	showToolCalls: boolean;
	/** Toggle the show-tool-calls display setting */
	onToggleShowToolCalls: () => void;
}

/** A plugin-managed boolean toggle rendered in the options (⚙) menu. */
interface PluginToggle {
	label: string;
	checked: boolean;
	onToggle: () => void;
}

export function InputToolbar({
	isSending,
	isButtonDisabled,
	hasContent,
	onSendOrStop,
	modes,
	onModeChange,
	configOptions,
	onConfigOptionChange,
	usage,
	isSessionReady,
	showToolCalls,
	onToggleShowToolCalls,
}: InputToolbarProps) {
	const sendButtonRef = useRef<HTMLButtonElement>(null);

	const updateIconColor = useCallback(
		(svg: SVGElement) => {
			svg.classList.remove(
				"agent-client-icon-sending",
				"agent-client-icon-active",
				"agent-client-icon-inactive",
			);

			if (isSending) {
				svg.classList.add("agent-client-icon-sending");
			} else {
				svg.classList.add(
					hasContent
						? "agent-client-icon-active"
						: "agent-client-icon-inactive",
				);
			}
		},
		[isSending, hasContent],
	);

	useEffect(() => {
		if (sendButtonRef.current) {
			const iconName = isSending ? "square" : "send-horizontal";
			setIcon(sendButtonRef.current, iconName);
			const svg = sendButtonRef.current.querySelector("svg");
			if (svg) {
				updateIconColor(svg);
			}
		}
	}, [isSending, updateIconColor]);

	useEffect(() => {
		if (sendButtonRef.current) {
			const svg = sendButtonRef.current.querySelector("svg");
			if (svg) {
				updateIconColor(svg);
			}
		}
	}, [updateIconColor]);

	// ----- Build dropdown item lists (memoized) -----

	const modeItems = useMemo<ToolbarDropdownItem[]>(() => {
		if (!modes?.availableModes) return [];
		return modes.availableModes.map((m) => ({
			value: m.id,
			label: m.name,
		}));
	}, [modes]);

	const currentModeLabel = useMemo(() => {
		const id = modes?.currentModeId;
		return modes?.availableModes?.find((m) => m.id === id)?.name ?? "Mode";
	}, [modes]);

	// Classify config options for the Claude Code-style composer layout:
	// permission mode chip on the left; model + effort chips on the right;
	// anything else (e.g. Fast mode) behind the sliders icon. The "agent"
	// persona option is dropped entirely — subagents are invoked via "/".
	const {
		modeConfigOption,
		modelConfigOption,
		effortConfigOption,
		extraConfigOptions,
	} = useMemo(() => {
		const selectable = (configOptions ?? []).filter(
			(o): o is SelectConfigOption =>
				o.type === "select" &&
				o.id !== "agent" &&
				flattenConfigSelectOptions(o.options).length > 1,
		);
		const mode = selectable.find((o) => o.category === "mode");
		const model = selectable.find((o) => o.category === "model");
		const effort = selectable.find(
			(o) => o.category === "thought_level",
		);
		return {
			modeConfigOption: mode,
			modelConfigOption: model,
			effortConfigOption: effort,
			extraConfigOptions: selectable.filter(
				(o) => o !== mode && o !== model && o !== effort,
			),
		};
	}, [configOptions]);

	const renderConfigChip = (
		option: SelectConfigOption,
		className?: string,
	) => {
		const current = flattenConfigSelectOptions(option.options).find(
			(o) => o.value === option.currentValue,
		);
		return (
			<ToolbarDropdown
				label={shortOptionLabel(current?.name ?? option.name)}
				title={option.description ?? option.name}
				items={buildDropdownItems(option)}
				currentValue={option.currentValue}
				onChange={(value) => {
					onConfigOptionChange?.(option.id, value);
				}}
				className={className}
			/>
		);
	};

	// ----- Render -----

	return (
		<div className="agent-client-chat-input-actions">
			{/* Left: permission mode chip (Claude Code composer layout) */}
			{configOptions && configOptions.length > 0
				? modeConfigOption &&
					renderConfigChip(
						modeConfigOption,
						"agent-client-config-selector-mode",
					)
				: modes &&
					modes.availableModes.length > 1 &&
					onModeChange && (
						<ToolbarDropdown
							label={currentModeLabel}
							title={
								modes.availableModes.find(
									(m) => m.id === modes.currentModeId,
								)?.description ?? "Select mode"
							}
							items={modeItems}
							currentValue={modes.currentModeId ?? undefined}
							onChange={onModeChange}
						/>
					)}

			<div className="agent-client-toolbar-spacer" />

			{/* Right: usage, model, effort, leftover options, send */}
			{usage && <UsageIndicator usage={usage} />}

			{configOptions && configOptions.length > 0 && (
				<>
					{modelConfigOption &&
						renderConfigChip(
							modelConfigOption,
							"agent-client-config-selector-model",
						)}
					{effortConfigOption &&
						renderConfigChip(
							effortConfigOption,
							"agent-client-config-selector-effort",
						)}
				</>
			)}

			{/* Options (⚙) menu — always present so the plugin toggles below
			    the adapter options (e.g. "Show tool calls") are reachable. */}
			<OptionsMenuButton
				options={extraConfigOptions}
				onChange={onConfigOptionChange}
				pluginToggles={[
					{
						label: "Show tool calls",
						checked: showToolCalls,
						onToggle: onToggleShowToolCalls,
					},
				]}
			/>

			{/* Send/Stop Button */}
			<button
				ref={sendButtonRef}
				onClick={onSendOrStop}
				disabled={isButtonDisabled}
				className={`agent-client-chat-send-button ${isSending ? "sending" : ""} ${isButtonDisabled ? "agent-client-disabled" : ""}`}
				title={
					!isSessionReady
						? "Connecting..."
						: isSending
							? "Stop generation"
							: "Send message"
				}
			></button>
		</div>
	);
}
