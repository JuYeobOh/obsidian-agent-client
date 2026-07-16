<h1 align="center">Agent Client Plugin for Obsidian — personal fork</h1>

<p align="center">
  <img src="https://img.shields.io/github/license/RAIT-09/obsidian-agent-client" alt="License">
</p>

> ### This is a modified fork, not the original plugin
>
> The original is **[RAIT-09/obsidian-agent-client](https://github.com/RAIT-09/obsidian-agent-client)**
> by RAIT-09. Star it, report issues there, and support that project — not this one.
>
> This fork exists to make the plugin behave more like the Claude Code app inside
> Obsidian, for one person's own vault. It is **not** in the Obsidian community
> plugin registry, ships no releases, and comes with no support. If you just want
> the plugin, install the original.
>
> Forked from upstream `89e2d75` (v0.11.0) — see [Changes in this fork](#changes-in-this-fork).

<p align="center">
  <a href="README.ja.md">日本語はこちら</a>
</p>

Bring AI agents (Claude Code, Codex, Gemini CLI) directly into Obsidian. Chat with your AI assistant right from your vault.

Built on [Agent Client Protocol (ACP)](https://github.com/agentclientprotocol/agent-client-protocol) by Zed.

If the plugin is useful to you, the person to support is its original author:

<p align="center">
  <a href="https://www.buymeacoffee.com/rait09" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy the original author a coffee" width="180" height="50" ></a>
</p>

https://github.com/user-attachments/assets/1c538349-b3fb-44dd-a163-7331cbca7824

## Features

- **Note Mentions**: Reference your notes with `@notename` syntax
- **Image Attachments**: Paste or drag-and-drop images into the chat
- **Slash Commands**: Use `/` commands provided by your agent
- **Multi-Agent Support**: Switch between Claude Code, Codex, Gemini CLI, and custom agents
- **Multi-Session**: Run multiple agents simultaneously in separate views
- **Floating Chat**: A persistent, collapsible chat window for quick access
- **Mode & Model Switching**: Change AI models and agent modes from the chat
- **Session History**: Resume or fork previous conversations
- **Chat Export**: Save conversations as Markdown notes
- **Terminal Integration**: Let agents execute commands and return results
- **MCP Support**: Agents use their configured MCP servers — no extra setup needed in the plugin

## Installation

### From Community Plugins (Recommended)

1. Open **Settings → Community Plugins → Browse**
2. Search for **"Agent Client"**
3. Click **Install**, then **Enable**

### Via BRAT (Pre-release Versions)

To try pre-release versions before they are published to Community Plugins:

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. Go to **Settings → BRAT → Add Beta Plugin**
3. Paste: `https://github.com/RAIT-09/obsidian-agent-client`
4. Enable **Agent Client** from the plugin list

### Manual Installation

1. Download `main.js`, `manifest.json`, `styles.css` from [Releases](https://github.com/RAIT-09/obsidian-agent-client/releases)
2. Place them in `VaultFolder/.obsidian/plugins/agent-client/`
3. Enable the plugin in **Settings → Community Plugins**

## Quick Start

Open a terminal (Terminal on macOS/Linux, PowerShell on Windows) and run the following commands.

1. **Install an agent and its ACP adapter** (e.g., Claude Code):
   ```bash
   curl -fsSL https://claude.ai/install.sh | bash   # Install Claude Code
   npm install -g @agentclientprotocol/claude-agent-acp   # Install ACP adapter
   ```

2. **Login** (skip if using API key):
   ```bash
   claude
   ```
   Follow the prompts to authenticate with your Anthropic account.

3. **Find the paths**:
   ```bash
   which node   # macOS/Linux
   which claude-agent-acp

   where.exe node   # Windows
   where.exe claude-agent-acp
   ```

4. **Configure** in **Settings → Agent Client**:
   - **Node.js path**: e.g., `/usr/local/bin/node`
   - **Built-in agents → Claude Code → Path**: e.g., `/usr/local/bin/claude-agent-acp` (not `claude`)
   - **API key**: Add your key, or leave empty if logged in via CLI

5. **Start chatting**: Click the robot icon in the ribbon

### Setup Guides

- [Claude Code](https://rait-09.github.io/obsidian-agent-client/agent-setup/claude-code.html)
- [Codex](https://rait-09.github.io/obsidian-agent-client/agent-setup/codex.html)
- [Gemini CLI](https://rait-09.github.io/obsidian-agent-client/agent-setup/gemini-cli.html)
- [Custom Agents](https://rait-09.github.io/obsidian-agent-client/agent-setup/custom-agents.html) (OpenCode, Qwen Code, Kiro, Mistral Vibe, etc.)

**[Full Documentation](https://rait-09.github.io/obsidian-agent-client/)**

## Changes in this fork

All of these are modifications to the original work, made after upstream
`89e2d75` (v0.11.0). Everything else is RAIT-09's.

**Bug fixes** — these are upstream bugs, and are intended to go back as pull
requests rather than live here:

- The connection only remembered the folder it was spawned in, so a tool call in
  a session opened from a different folder ran against the spawn folder — a
  prompt in one vault subfolder could create files in another.
- Opening a chat could fail with "ACP connection closed": persisted view state
  arriving after mount re-ran session creation, and the second attempt tore down
  the connection the first was building.
- "New chat in directory..." passed `undefined` to `restartSession()`, whose
  fallback is the *default* agent — changing folder silently switched agents.
- `createSession` was named as an effect dependency while closing over the
  working directory, so every folder change spawned a stray blank session.
- Titles pushed by the agent (`session_info_update`) were received and dropped,
  so a session stayed titled with its entire first prompt.

**Features and UI**, specific to using Claude Code in a research vault:

- Session manager: sessions grouped into a folder tree, with pinning, aliases,
  collapse and manual ordering; selecting one loads it into the open view
  instead of spawning another tab.
- The in-progress session reopens after an Obsidian restart.
- Tool calls collapse by default, with a toggle to hide them entirely.
- Rewind: Esc when idle picks an earlier point to restore the local thread to.
- Composer rebuilt, with a usage popover showing context *and* subscription
  plan limits (read from the Claude Code CLI's local credentials).
- `@`-mentions accept PDFs, passed as resource links rather than inlined text.
- The working directory is always shown, and opens a session drawer in-pane.
- Restyled chat: white background, right-aligned user bubbles, wider spacing.

## Development

```bash
npm install
npm run dev
```

For production builds:
```bash
npm run build
```

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

Copyright 2025-2026 RAIT-09. This repository is a modified fork of
[RAIT-09/obsidian-agent-client](https://github.com/RAIT-09/obsidian-agent-client);
the files changed relative to upstream are described in
[Changes in this fork](#changes-in-this-fork), and the commit history records
each modification individually.
