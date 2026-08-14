<h1 align="center">Agent Client — personal fork</h1>

<p align="center">
  <img src="https://img.shields.io/github/license/RAIT-09/obsidian-agent-client" alt="License">
</p>

> ### This is a modified fork, not the original plugin
>
> The original is **[RAIT-09/obsidian-agent-client](https://github.com/RAIT-09/obsidian-agent-client)**
> by RAIT-09 — an Obsidian plugin that brings AI agents (Claude Code, Codex,
> Gemini CLI) into your vault over Zed's
> [Agent Client Protocol](https://github.com/agentclientprotocol/agent-client-protocol).
> Star it, report issues there, and support that project. Not this one.
>
> **If you just want the plugin, [install the original](https://community.obsidian.md/plugins/agent-client).**
> It is in the community registry, is maintained, and has documentation. This
> fork is none of those things.
>
> Forked from upstream `89e2d75` (v0.11.0).

## What this fork is for

Reshaping the plugin to work like the **Claude Code app, inside Obsidian**, for
one person's research vault — two vault folders (`my-wiki`, `paper-wiki`) worked
on in parallel, sessions kept warm, answers arriving in the background.

Everything below is a change to RAIT-09's work. All the rest of the plugin —
the agents, the protocol layer, the chat itself — is theirs.

## What's different

### Sessions

- **Folder tree.** Sessions group under the folder they run in, so two vault
  folders no longer fight over one flat list. Folders can be pinned, renamed
  (display-only alias), collapsed, and dragged into a manual order.
- **Switching reuses the open view** instead of opening a tab per session.
  Spawning the agent process is the slow part; reusing it makes switching
  near-instant and stops the sidebar filling with icons. A view is left alone if
  it has a turn running or a permission prompt waiting.
- **The in-progress session reopens after a restart**, in its own folder, rather
  than coming back blank.
- **Sessions keep running when you switch away**, and say so when they finish —
  named, because the point is knowing *which* one is ready.

### Chat

- **Tool calls collapse by default**, expandable on click; a pending permission
  request always stays open. A *Show tool calls* toggle hides them entirely.
- **Rewind.** Esc interrupts a running generation; Esc when idle lists the
  conversation's user messages, and picking one drops it and everything after,
  putting its text back in the composer. This rewinds the *local* transcript
  only — ACP exposes no truncation API, so the agent still holds the turns.
- **Restyled**: plain white background, user messages as grey bubbles on the
  right, more space between turns.

### Composer

- Options split out of the one truncated strip: permission mode on the left;
  usage, model, effort, settings and send on the right. The agent picker is gone
  — `/` already selects one.
- **Usage popover.** Clicking the percentage shows the session's context window
  *and* the subscription's 5-hour and weekly plan limits, like Claude Code's
  `/usage`. ACP only reports per-session context, so plan limits are read from
  the credentials the Claude Code CLI already stores locally, and sent only to
  `api.anthropic.com`. Fails soft — API-key users just don't see them.
- The active note sits in its own box above the input.

### Vault

- **PDF `@`-mentions.** Markdown is still inlined as text, but a PDF is passed
  as a resource link for the agent to open, since embedding binary would be
  garbage. Name collisions prefer the `.md` file, matching wikilink behaviour.
- **The working directory is always shown** in the header, abbreviated to the
  last one or two folders (configurable), full path on hover. Clicking it slides
  the session list in over the chat pane instead of opening a separate leaf.

## Bug fixes

These are bugs in the original, not in the fork's own features. They are meant
to go back upstream as pull requests rather than live here:

| Fix | Symptom |
| --- | --- |
| Track the session's working directory | A prompt sent in one vault folder could create files in **another** — the connection only remembered its spawn folder. |
| Drop duplicate `createSession` calls | Opening a chat failed with *"ACP connection closed"*. |
| Keep the active agent on folder switch | *New chat in directory...* silently switched to the **default** agent. |
| Call `createSession` through a ref | Every folder change spawned a stray blank session over the restored one. |
| Adopt agent-pushed titles | Titles arrived (`session_info_update`) and were dropped, so a session stayed named after its whole first prompt. |
| Paint restored messages after replay | Switching sessions flickered for several seconds. |

## Install

Not in the community registry, and no releases are published — so there is **no
one-click link**. Build it yourself:

```bash
git clone https://github.com/JuYeobOh/obsidian-agent-client.git
cd obsidian-agent-client
npm install
npm run build
```

Then copy `main.js`, `manifest.json` and `styles.css` into your vault:

```
<vault>/.obsidian/plugins/agent-client-fork/
```

and restart Obsidian.

> This fork uses its own plugin id (`agent-client-fork`), so it installs
> **alongside** the original rather than replacing it — and Obsidian never
> offers to "update" it back to the community-registry version, which would
> silently overwrite the fork. Settings and saved sessions live in that folder's
> `data.json`; to carry them over from an existing install, copy its `data.json`
> across.

Requires the agent CLI itself; see the
[original's documentation](https://rait-09.github.io/obsidian-agent-client/) for
setting up Claude Code, Codex or Gemini CLI. Nothing about that changed here.

## Development

```bash
npm install
npm run dev     # watch build
npm run build   # typecheck + production build
npm test        # 47 tests
```

`upstream` tracks RAIT-09's repository:

```bash
git remote add upstream https://github.com/RAIT-09/obsidian-agent-client.git
```

## Credits and license

The plugin is the work of **[RAIT-09](https://github.com/RAIT-09)**, licensed
Apache-2.0. If it is useful to you, support the original author:

<p align="center">
  <a href="https://www.buymeacoffee.com/rait09" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy the original author a coffee" width="180" height="50" ></a>
</p>

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

Copyright 2025-2026 RAIT-09. This repository is a modified fork of
[RAIT-09/obsidian-agent-client](https://github.com/RAIT-09/obsidian-agent-client),
branched at `89e2d75` (v0.11.0). Files have been changed relative to that
version; the changes are summarised above and recorded individually in the
commit history.
