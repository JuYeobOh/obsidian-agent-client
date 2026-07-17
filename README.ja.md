<h1 align="center">Agent Client Plugin for Obsidian — 個人用フォーク</h1>

<p align="center">
  <img src="https://img.shields.io/github/license/RAIT-09/obsidian-agent-client" alt="License">
</p>

> ### これは改変されたフォークであり、オリジナルのプラグインではありません
>
> オリジナルは RAIT-09 氏による
> **[RAIT-09/obsidian-agent-client](https://github.com/RAIT-09/obsidian-agent-client)**
> です。Star・Issue・支援はそちらへお願いします。
>
> このフォークは、個人の Vault で Claude Code アプリのように使うための改変です。
> Obsidian コミュニティプラグインには登録されておらず、リリースも配布せず、
> サポートもありません。プラグインを使いたいだけであればオリジナルをどうぞ。
>
> アップストリーム `89e2d75`（v0.11.0）から分岐。変更点は
> [英語版 README](README.md) を参照してください。以下はオリジナルの日本語 README を
> そのまま残したもので、このフォークでの変更は反映されていません。

AIエージェント（Claude Code、Codex、Gemini CLI）をObsidianに直接統合。Vault内からAIアシスタントとチャットできます。

このプラグインは、Zed の [Agent Client Protocol (ACP)](https://github.com/agentclientprotocol/agent-client-protocol) で構築されています。

このプラグインが役に立ったなら、支援すべきはオリジナルの作者です:

<p align="center">
  <a href="https://www.buymeacoffee.com/rait09" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy the original author a coffee" width="180" height="50" ></a>
</p>

https://github.com/user-attachments/assets/1c538349-b3fb-44dd-a163-7331cbca7824

## 機能

- **ノートメンション**: `@ノート名`でノートを参照
- **画像添付**: チャットに画像をペーストまたはドラッグ&ドロップ
- **スラッシュコマンド**: エージェントが提供する`/`コマンドを使用
- **マルチエージェント**: Claude Code、Codex、Gemini CLI、カスタムエージェントを切り替え
- **マルチセッション**: 複数のエージェントを別々のビューで同時実行
- **フローティングチャット**: 素早くアクセスできる折りたたみ可能なチャットウィンドウ
- **モード・モデル切り替え**: チャット画面からAIモデルやエージェントモードを変更
- **セッション履歴**: 過去の会話を再開またはフォーク
- **チャットエクスポート**: 会話をMarkdownノートとして保存
- **ターミナル統合**: エージェントがコマンドを実行し結果を返す
- **MCPサポート**: エージェントに設定済みのMCPサーバーがそのまま利用可能 — プラグイン側の追加設定は不要

## インストール

### コミュニティプラグインから（推奨）

1. **設定 → コミュニティプラグイン → 閲覧** を開く
2. **「Agent Client」** を検索
3. **インストール** → **有効化** をクリック

### BRAT経由（プレリリース版）

コミュニティプラグインに公開される前のプレリリース版を試すには:

1. [BRAT](https://github.com/TfTHacker/obsidian42-brat) プラグインをインストール
2. **設定 → BRAT → Add Beta Plugin** に移動
3. 貼り付け: `https://github.com/RAIT-09/obsidian-agent-client`
4. プラグインリストから **Agent Client** を有効化

### 手動インストール

1. [リリース](https://github.com/RAIT-09/obsidian-agent-client/releases)から `main.js`、`manifest.json`、`styles.css` をダウンロード
2. `VaultFolder/.obsidian/plugins/agent-client/` に配置
3. **設定 → コミュニティプラグイン** でプラグインを有効化

## クイックスタート

ターミナル（macOS/LinuxではTerminal、WindowsではPowerShell）を開き、以下のコマンドを実行します。

1. **エージェントとACPアダプタをインストール**（例: Claude Code）:
   ```bash
   curl -fsSL https://claude.ai/install.sh | bash   # Claude Codeをインストール
   npm install -g @agentclientprotocol/claude-agent-acp   # ACPアダプタをインストール
   ```

2. **ログイン**（APIキーを使う場合はスキップ）:
   ```bash
   claude
   ```
   プロンプトに従ってAnthropicアカウントで認証します。

3. **パスを確認**:
   ```bash
   which node   # macOS/Linux
   which claude-agent-acp

   where.exe node   # Windows
   where.exe claude-agent-acp
   ```

4. **設定 → Agent Client** で設定:
   - **Node.js path**: 例: `/usr/local/bin/node`
   - **Built-in agents → Claude Code → Path**: 例: `/usr/local/bin/claude-agent-acp`（`claude`ではない）
   - **API key**: キーを追加、またはCLIでログイン済みの場合は空欄

5. **チャット開始**: リボンのロボットアイコンをクリック

### セットアップガイド

- [Claude Code](https://rait-09.github.io/obsidian-agent-client/agent-setup/claude-code.html)
- [Codex](https://rait-09.github.io/obsidian-agent-client/agent-setup/codex.html)
- [Gemini CLI](https://rait-09.github.io/obsidian-agent-client/agent-setup/gemini-cli.html)
- [カスタムエージェント](https://rait-09.github.io/obsidian-agent-client/agent-setup/custom-agents.html)（OpenCode、Qwen Code、Kiro、Mistral Vibeなど）

**[ドキュメント全文](https://rait-09.github.io/obsidian-agent-client/)**

## 開発

```bash
npm install
npm run dev
```

プロダクションビルド:
```bash
npm run build
```

## ライセンス

Apache License 2.0 — 詳細は [LICENSE](LICENSE) と [NOTICE](NOTICE) を参照。

Copyright 2025-2026 RAIT-09. このリポジトリは
[RAIT-09/obsidian-agent-client](https://github.com/RAIT-09/obsidian-agent-client)
を改変したフォークです。アップストリームからの変更点は
[英語版 README](README.md) に記載し、
個々の変更はコミット履歴に残しています。
