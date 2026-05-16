# Surface

An AI-native browser. Agents drive. Humans look.

Surface is Chromium with one extra capability: it gives the web page running inside it a real local filesystem. It's built to be opened *by* an agent, not browsed *by* a human — you talk to your agent in whatever tool you use (Claude Code, OpenCode, ChatGPT, voice, anything), and the agent uses Surface to put windows on your screen: drafts, dashboards, files, references — pulled from disk or from the web.

You don't navigate Surface. There's no URL bar, no tab strip, no bookmarks, no history. Each window is one rendered thing. Your agent opens them; you read them.

## What Surface ships

- **The runtime** — Chromium, framed by Electron, with no chrome.
- **The bridge** — `window.surface` plus the standard File System Access API, so any web page running inside Surface can read, write, and watch local files.
- **The CLI** — `bin/surface <path-or-url>` so any shell (and any agent's shell tool) can drive Surface. One invocation = one window. Single-instance lock means subsequent invocations join the running process.
- **The MCP server** (`mcp/`) — gives any MCP-capable AI agent the `surface_open` tool. Register once, your agent has visual hands forever.

## What Surface does not ship

- A chat UI.
- An agent.
- A model.
- An opinion about which agent or model you use.

Bring your own.

## Install (dev)

```sh
git clone <this repo>
cd surface/app
npm install
npm start
```

A packaged `.dmg` is on the roadmap. macOS first.

## Using Surface

The intended usage is from a shell — typically your agent's shell tool:

```sh
surface open ~/Documents/draft.html         # open a local file in a window
surface open https://linear.app/abc-123     # open a URL in a window
surface grant ~/Documents/project/          # pre-authorize a folder
```

One `surface open` = one window. One file or one URL = one rendered thing. No tabs.

Symlink the shim onto your PATH once and `surface anything` works everywhere:

```sh
ln -s ~/Documents/surface/bin/surface ~/bin/surface          # if ~/bin is on PATH
# or
sudo ln -s ~/Documents/surface/bin/surface /usr/local/bin/   # system-wide
```

## Using Surface from an AI agent

The `mcp/` directory ships an MCP server (`surface-mcp`) that exposes one tool, `surface_open(target)`, to any MCP-capable agent host. Register once and your agent has the ability to put windows on your screen.

```sh
cd mcp && npm install
claude mcp add surface node "$(pwd)/index.js"
```

Restart your agent host. The agent can now call `surface_open("~/Documents/draft.html")` and a window appears. Multiple calls open multiple windows in the same Surface process. Full registration details for Claude Code, Claude Desktop, Cursor, and OpenCode are in [`mcp/README.md`](mcp/README.md).

## For web app authors

Any web app can detect Surface and use it for local files. The full contract is in [`docs/surface-api.md`](docs/surface-api.md). The 10-second version:

```js
if (window.surface?.isSurface) {
  // Running in Surface — persistent grants, push-based watch, conflict-detected writes.
  const handle = await window.surface.pickFile();
  await handle.write('hello');
} else if (window.showOpenFilePicker) {
  // Stock Chromium — works too, but the user picks each time.
}
```

Apps already written against the File System Access API run in Surface unchanged. Surface-aware apps get the extras: persistent grants, `byMe` flag on watch events, mtime-based conflict detection.

`doc-app/` in this repo is a small example — a generic HTML editor that uses the bridge.

## Permission model

Two independent gates, both required for every file operation:

1. **Origin grant** — does this origin (or, for `file://`, this exact document path) have the bridge at all?
2. **Path grant** — has the user picked this specific path for this origin? Only a picker (`pickFile` / `pickFolder` / `showOpenFilePicker` / `showDirectoryPicker`) can record one.

Folder grants are recursive; file grants are exact-match. Grants persist across restarts in `~/Library/Application Support/surface/permissions.json` (a proper UI is on the roadmap).

## Repo layout

```
app/                  the Surface binary — Electron main, bridge, preload
  bridge/             permissions, handlers, watch, default-app routing
  preload.js          the renderer-facing window.surface + FSA-API
  main.js             window management, IPC handlers, app lifecycle
  hello.html          dev page — renders a static HTML file
  playground.html     dev page — exercise the bridge by hand
bin/surface           the CLI shim — execs Electron with your target
mcp/                  the MCP server — agent-facing tool (surface_open)
doc-app/              example app — a generic HTML editor using the bridge
docs/surface-api.md   the public bridge contract
archive/              earlier prototype and personal vision drafts
pitch.html            the pitch — what Surface is, for users and devs
```

## Status

v0.2. The bridge, CLI, and MCP server work end-to-end:

- `window.surface` + the FSA-API subset documented in `docs/surface-api.md`.
- Two-gate permissions, persistent across restarts.
- Watch with `byMe` (self-write suppression via SHA-1 ring buffer).
- Conflict detection on writes (`baseMtime` → `ConflictError:`).
- Default-app routing by extension.
- `bin/surface <path-or-url>` CLI with single-instance lock.
- `surface_open(target)` MCP tool, registerable in any MCP-capable agent host.

What's still missing for "really works as a browser":

- A bare-invocation behavior that isn't "open chat-app."
- A packaged `.dmg`.
- A launch agent — auto-start Surface on login so the agent's first call is instant.
- An in-app permissions UI (revoke, inspect).
- Recursive folder watch, async directory iterators, `removeEntry` / `move`.

See `docs/surface-api.md`'s roadmap section for the full list.
