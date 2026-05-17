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

```sh
cd mcp
npm install
```

Pulls in `@modelcontextprotocol/sdk`. No build step — `index.js` is the server.

## Register with an agent host

### Claude Code

```sh
claude mcp add --scope user surface node /Users/maxwraae/Documents/surface/mcp/index.js
```

`--scope user` makes the server available in every Claude Code session (not just the project where you ran the command). Adjust the absolute path to wherever you cloned this repo. Restart Claude Code to pick up the new server.

Confirm with `claude mcp list` — you should see `surface: node …/mcp/index.js - ✓ Connected`.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) and add:

```json
"mcpServers": {
  "surface": {
    "command": "node",
    "args": ["/Users/maxwraae/Documents/surface/mcp/index.js"]
  }
}
```

Restart Claude Desktop.

### Cursor

Settings → Features → Model Context Protocol → Add MCP Server. Command: `node`. Args: `/Users/maxwraae/Documents/surface/mcp/index.js`.

### OpenCode

OpenCode supports MCP via its config — refer to OpenCode's docs for the exact path. The server shape is the same: `command: "node"`, `args: ["<absolute-path>/mcp/index.js"]`.

### Anything else

Any MCP-capable host can spawn a stdio MCP server. The command is `node <absolute-path>/mcp/index.js`. No environment variables, no flags.

## How it works

The server is a thin stdio MCP wrapper around `bin/surface`. On every tool call:

1. Inspect the `content` argument — URL? path? HTML?
2. For HTML/text: write to `~/Library/Application Support/surface/temp/` with a timestamped + content-hashed filename (e.g. `2026-05-16T17-30-12-a8f3c2.html`).
3. Spawn `bin/surface <target>` **detached** with `stdio: 'ignore'` and `child.unref()`. The MCP server returns immediately while Electron continues running on its own.
4. The first invocation boots Surface (Electron). Subsequent invocations hit Surface's single-instance lock and pop new windows in the existing process. Garbage collection of old temp files happens during Surface's startup.

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

v0.3.

Working:
- `surface(content)` dispatching on URL / path / HTML / plain text.
- Temp-file machinery in `~/Library/Application Support/surface/temp/`.
- Detached fire-and-forget spawn (no agent-side hang).
- 24-hour GC of temp files on Surface launch.

Backlog:
- **Error reporting from detached child.** v0.3 fire-and-forget loses errors — agent always sees success even if the open silently failed. Future: pipe stderr from the child, peek exit code within a short window.
- **`surface_grant(folder)`** — pre-authorize a folder for the active app, when Surface gains a CLI for it.
- **`surface_list_windows()`, `surface_close_window(id)`** — observability and control over open windows; requires IPC into Surface.
- **Target validation** — currently the MCP server passes any string through. Future hardening could reject suspicious paths or URLs depending on threat model.
- **Cross-platform** — `TEMP_DIR` is hardcoded to macOS userData. Linux/Windows paths come with packaging.
