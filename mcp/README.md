# surface-mcp

MCP server for Surface. Gives any AI agent the ability to open files and URLs in Surface windows on the user's screen.

## What it does

Exposes one tool to the host agent:

- **`surface_open(target)`** — opens `target` (a local file path or a URL) in a Surface window. Multiple calls open multiple windows in the same Surface process.

The agent calls the tool. The user sees a window appear. The user types nothing.

## Install

```sh
cd mcp
npm install
```

That pulls in `@modelcontextprotocol/sdk`. The server itself is a single ESM file (`index.js`) — no build step.

## Register with an agent host

### Claude Code

```sh
claude mcp add surface node /Users/maxwraae/Documents/surface/mcp/index.js
```

Adjust the absolute path to wherever you cloned this repo. Restart Claude Code to pick up the new server.

If `claude mcp add` isn't available on your Claude Code version, edit your Claude Code MCP config directly (`~/.claude.json` on most installs — confirm with `claude --help` or your version's docs) and add:

```json
"mcpServers": {
  "surface": {
    "command": "node",
    "args": ["/Users/maxwraae/Documents/surface/mcp/index.js"]
  }
}
```

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) and add the same `mcpServers` block as above. Restart Claude Desktop.

### Cursor

Settings → Features → Model Context Protocol → Add MCP Server. Command: `node`. Args: `/Users/maxwraae/Documents/surface/mcp/index.js`.

### OpenCode

OpenCode supports MCP via its config — refer to OpenCode's docs for the exact path. The server shape is the same: `command: "node"`, `args: ["<absolute-path>/mcp/index.js"]`.

## How it works

The server is a thin stdio MCP wrapper around `bin/surface` (the Surface CLI shim). When the agent calls `surface_open(target)`:

1. The server expands `~/` to the user's home dir.
2. It spawns `bin/surface <target>` **detached** with `stdio: 'ignore'` and `child.unref()` — so the MCP server returns to the agent immediately while Electron continues running on its own.
3. The first invocation boots Surface (Electron). Subsequent invocations hit Surface's single-instance lock and pop new windows in the existing process.

## Verification

Smoke-test the server boots:

```sh
node index.js
# Idles on stdio. Ctrl-C to stop.
```

End-to-end:

1. Register the server with Claude Code (above).
2. Restart Claude Code.
3. Ask Claude: *"Open `~/Documents/surface/pitch.html` in Surface."*
4. Expect: a Surface window appears showing pitch.html. The tool call returns immediately, not after Electron exits.
5. Ask: *"Now show me Wikipedia's page on hypertext."*
6. Expect: a second window appears in the **same** Surface process.

## Status

v0.2. One tool. Fire-and-forget — errors from the detached child are not surfaced back to the agent yet (file-not-found just looks like success from the agent's side). Hardening backlog:

- Pipe stderr from the detached child briefly to catch obvious failures.
- Add `surface_grant(folder)` for pre-authorizing folders.
- Add `surface_list_windows()` and `surface_close_window(id)` once Surface has IPC for them.
- Target validation (reject suspicious paths / URLs depending on threat model).
