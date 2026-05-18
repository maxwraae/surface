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

## Install

1. Download **Surface.app** from the [latest release](https://github.com/maxwraae/surface/releases/latest).
2. Drag to **Applications**. Right-click → **Open** the first time (unsigned build — macOS Gatekeeper blocks unsigned apps on first launch).
3. Connect your AI agent: `npx -y surface-mcp install` — or ask your agent to run it.

That's it. Surface stays running in the background. Your agent opens windows when it wants to show you something.

## Install (dev)

```sh
git clone <this repo>
cd surface/app
npm install
npm start
```

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

The `mcp/` directory ships an MCP server (`surface-mcp`) that exposes one tool, `surface`, to any MCP-capable agent host. Register it once and every agent on your machine has visual hands — Claude Code, Claude Desktop, Cursor, OpenCode, anything that speaks MCP.

```sh
npx -y surface-mcp install
```

Restart your agent host. The agent can now call `surface(content)` and a window appears. The tool dispatches on what you pass:

- **A URL** — `surface("https://linear.app/abc-123")` opens the page.
- **A file path** — `surface("~/Documents/draft.html")` opens the file.
- **Raw HTML** — `surface("<h1>Hello</h1>...")` writes it to a temp file and renders it.

The third case is the magic one: the agent writes HTML, the user sees it. Charts, drafts, dashboards, sequence diagrams, working prototypes — anything renderable in Chromium. Multiple calls open multiple windows in the same Surface process. Temp files persist for 24 hours then auto-clean.

Full registration details for other hosts (Claude Desktop, Cursor, OpenCode) are in [`mcp/README.md`](mcp/README.md).

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

`doc-app/` in this repo is a small example — a generic HTML editor that uses the bridge. It also accepts `?file=http(s)://...` URLs: when the file param is an HTTP URL, doc-app fetches/PUTs it over the network instead of going through the bridge. This lets one machine host the file (and the doc-app itself) while another machine renders the window. The hosting machine is just an HTTP server with GET, PUT, and HEAD; the viewing machine is just Surface pointed at a URL.

```sh
# On host (the machine with the file): serve it however you like, e.g. a
# tiny Python server with PUT support. doc-app expects GET/PUT/HEAD.
# On viewer:
surface "http://host:8765/path/to/doc-app/index.html?file=http://host:8765/path/to/file.html"
```

Live updates work both ways: edits in the doc-app PUT back to the host; changes made to the file on the host (by any tool) are picked up by HEAD-polling and the renderer re-loads.

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

v0.4. Downloadable, MCP-installable, end-to-end working:

- `window.surface` + the FSA-API subset documented in `docs/surface-api.md`.
- Two-gate permissions, persistent across restarts.
- Watch with `byMe` (self-write suppression via SHA-1 ring buffer).
- Conflict detection on writes (`baseMtime` → `ConflictError:`).
- Default-app routing by extension.
- `bin/surface <path-or-url>` CLI with single-instance lock.
- `surface(content)` MCP tool — one universal tool: URL, file path, or raw HTML. Registerable in any MCP-capable agent host.
- Temp-file machinery for agent-generated HTML, with 24-hour GC on launch.

What's still missing for "really works as a browser":

- Signed + notarized DMG (currently shipping unsigned).
- A launch agent — auto-start Surface on login so the agent's first call is instant.
- An in-app permissions UI (revoke, inspect).
- Recursive folder watch, async directory iterators, `removeEntry` / `move`.

See `docs/surface-api.md`'s roadmap section for the full list.
