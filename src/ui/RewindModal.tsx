/**
 * Rewind picker modal.
 *
 * Lists the previous user messages so the user can pick a point to rewind the
 * conversation to. Selecting a message restores the local transcript to that
 * point (dropping later messages) and loads its text into the composer for
 * editing/resending. Dismissing does nothing ("Never mind").
 *
 * NOTE: This rewinds the LOCAL transcript only. The agent process still retains
 * the earlier turns in its own context (ACP exposes no conversation-truncation
 * or checkpoint API), so the note below sets that expectation.
 */

import { Modal, App } from "obsidian";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { truncateTitle } from "../utils/text";

export interface RewindItem {
	/** Index of this user message in the full messages array */
	index: number;
	/** Message text (for display + to preload into the composer) */
	text: string;
}

export interface RewindModalProps {
	items: RewindItem[];
	onSelect: (index: number) => void;
}

function RewindContent({
	items,
	onSelect,
	onClose,
}: RewindModalProps & { onClose: () => void }) {
	if (items.length === 0) {
		return (
			<div className="agent-client-rewind-empty">
				No previous messages to rewind to.
			</div>
		);
	}

	return (
		<div className="agent-client-rewind-list">
			{items.map((item) => (
				<button
					key={item.index}
					type="button"
					className="agent-client-rewind-item"
					onClick={() => {
						onClose();
						onSelect(item.index);
					}}
				>
					{truncateTitle(item.text, 120)}
				</button>
			))}
		</div>
	);
}

export class RewindModal extends Modal {
	private root: Root | null = null;
	private props: RewindModalProps;

	constructor(app: App, props: RewindModalProps) {
		super(app);
		this.props = props;
	}

	onOpen() {
		const { contentEl, titleEl } = this;
		this.modalEl.addClass("agent-client-rewind-modal");
		titleEl.setText("Rewind");
		contentEl.empty();

		contentEl.createEl("p", {
			text: "Restore the conversation to a previous message.",
			cls: "agent-client-rewind-subtitle",
		});
		contentEl.createEl("p", {
			text: "Note: this rewinds the transcript shown here. The agent still remembers the removed turns.",
			cls: "agent-client-rewind-caveat",
		});

		const container = contentEl.createDiv();
		this.root = createRoot(container);
		this.root.render(
			React.createElement(RewindContent, {
				...this.props,
				onClose: () => this.close(),
			}),
		);
	}

	onClose() {
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
		this.contentEl.empty();
	}
}
