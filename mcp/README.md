# surface-mcp

MCP server for Surface. Gives any MCP-capable AI agent visual hands.

## The tool

One tool. One parameter. Three behaviors.

**`surface(content)`** — dispatches on what you pass:

| If `content` is… | Surface does… |
|---|---|
| A URL (`http://`, `https://`, `file://`) | Opens the page in a window. |
| An absolute or `~/`-prefixed file path | Opens the file (HTML in the doc-app, PDFs in Chromium's viewer, anything else as plain rendering). |
| Raw HTML or plain text | Writes it to a temp file and opens it. |

The third case is the magic one: the agent generates HTML and the user sees it instantly. Charts, drafts, dashboards, sequence diagrams, working prototypes. HTML is the agent's output medium.

Multiple calls open multiple windows in the same Surface process. Temp files live in `~/Library/Application Support/surface/temp/` and Surface auto-deletes anything older than 24 hours on its next launch.

The tool's `description` field (visible to the model via every MCP host) teaches the agent the three cases, the HTML-first vibe, the styling defaults, and inline examples. Treat it as the universal "skill" — no host-specific install files needed.

## Install

In whichever AI agent you use, ask it:

> Please run `npx -y surface-mcp install` and confirm it succeeded.

Or just run it yourself in a terminal:

```sh
npx -y surface-mcp install
```

It detects which agent hosts you have (Claude Code, Claude Desktop, Cursor, Codex), shows you the plan, asks once before writing, and adds a `surface` server entry to each. Idempotent — re-run any time.

Restart your agent host(s) and the `surface` tool is callable.

### Manual install per host

If you'd rather configure by hand, the entry looks like this in every JSON-config host:

```json
"mcpServers": {
  "surface": { "command": "npx", "args": ["-y", "surface-mcp"] }
}
```

Locations:

- **Claude Code** — `claude mcp add --scope user surface -- npx -y surface-mcp`
- **Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Cursor** — `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project)
- **Codex / OpenCode** — `~/.codex/config.toml`, as `[mcp_servers.surface]` with `command = "npx"` and `args = ["-y", "surface-mcp"]`

Anything else MCP-capable: spawn `npx -y surface-mcp` as a stdio MCP server. No env vars, no flags.

## Requirements

The MCP server is a thin wrapper around Surface.app. Surface.app must be installed at `/Applications/Surface.app` (or `~/Applications/`); download the latest from the [Releases page](https://github.com/maxwraae/surface/releases). If Surface.app isn't found, the first tool call throws a clear download-and-retry error.

## How it works

The server is a thin stdio MCP wrapper around Surface.app. On every tool call:

1. Inspect the `content` argument — URL? path? HTML?
2. For HTML/text: write to `~/Library/Application Support/surface/temp/` with a timestamped + content-hashed filename (e.g. `2026-05-16T17-30-12-a8f3c2.html`).
3. Locate the Surface binary — `findSurfaceBinary()` probes `/Applications/Surface.app/Contents/MacOS/Surface`, then `~/Applications/...`, then `mdfind` by bundle id, then `bin/surface` for repo-dev mode. Throws a download-and-retry error if none are found.
4. Spawn the binary with the target argument, **detached**, capturing stderr for 600ms so a launch failure surfaces to the agent rather than silently appearing to succeed. After the window opens (or 600ms elapse with no error), the server unrefs the child and returns.
5. The first invocation boots Surface (Electron). Subsequent invocations hit Surface's single-instance lock and pop new windows in the existing process. Garbage collection of old temp files happens during Surface's startup.

## Verification

Smoke-test the server boots:

```sh
node index.js
# Idles on stdio. Ctrl-C to stop.
```

End-to-end (after registering with Claude Code):

1. Open a **new** Claude Code session.
2. *"Show me a bar chart of Q1–Q4 sales: 12, 19, 8, 15."*
3. **Expected:** the agent calls `surface` with HTML containing inline Chart.js → a Surface window appears with the chart rendered. No CLI typing.
4. *"Now show me the Wikipedia article on hypertext."*
5. **Expected:** a second window opens in the same Surface process with the Wikipedia page.
6. *"Open `~/Documents/surface/pitch.html`."*
7. **Expected:** a third window opens, showing the pitch.

If all three appear without you ever touching a CLI — the agent has visual hands.

## Status

v0.4.

Working:
- `surface(content)` dispatching on URL / path / HTML / plain text.
- Temp-file machinery in `~/Library/Application Support/surface/temp/`.
- Detached spawn with 600ms stderr capture — early launch failures reach the agent.
- 24-hour GC of temp files on Surface launch.
- Runtime discovery of Surface.app (`/Applications`, `~/Applications`, `mdfind`, repo-dev fallback).
- `surface-mcp install` subcommand — writes Surface entries into detected agent-host configs in one Y/n confirm.

Backlog:
- **`surface_grant(folder)`** — pre-authorize a folder for the active app, when Surface gains a CLI for it.
- **`surface_list_windows()`, `surface_close_window(id)`** — observability and control over open windows; requires IPC into Surface.
- **Target validation** — the MCP server currently passes any string through. Future hardening could reject suspicious paths or URLs depending on threat model.
- **Cross-platform** — `TEMP_DIR` and the binary probe are macOS-only. Linux/Windows come if/when Surface.app gets cross-platform builds.
