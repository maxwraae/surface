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
surface ~/Documents/draft.html            # render a local file in a window
surface https://linear.app/abc-123        # open a URL in a window
surface --edit ~/notes/draft.html         # open .html in doc-app (edits saved back)
echo '<h1>hi</h1>' | surface              # pipe HTML in — auto-saved + rendered
```

One call = one window. No tabs. The CLI prints the URL it opened to stdout, so an agent can quote it back in chat.

Symlink the shim onto your PATH once:

```sh
ln -s ~/surface/bin/surface ~/.local/bin/surface
```

## Daemon mode + cross-host mesh

Surface runs as a background daemon — one Electron process per machine, started by a LaunchAgent at login, with an embedded HTTP server on port 7878. Two Surface daemons on the same tailnet (Tailscale, plain LAN, anything that lets them reach each other) become a mesh. `surface X` on one machine opens a window on the *other* machine, with the file streamed live over HTTP — no copies, no sync.

`~/.config/surface/config.json`:

```json
{
  "port": 7878,
  "bind": "0.0.0.0",
  "self": "http://this-host:7878",
  "target": "http://that-host:7878",
  "rootsExposed": ["/Users/you", "/tmp"],
  "peers": ["http://that-host:7878"]
}
```

- `target` — where this Surface sends windows by default. `"self"` opens locally; a peer URL sends windows there.
- `rootsExposed` — paths the embedded HTTP server will serve. Anything outside is `403`. Defaults: `~`, `/tmp`.
- `self` — this machine's reachable URL, used when constructing the URL the target's renderer will fetch.

LaunchAgent at `~/Library/LaunchAgents/com.maxwraae.surface.plist` runs `surface --daemon` at login with `KeepAlive=true`. Logs land in `~/Library/Logs/surface/`. The endpoints are: `GET/HEAD/PUT /<abs-path>` for files, `POST /_/open {url}` for cross-Surface RPC, `GET /_/health` for liveness, `GET /_/peers` to list the mesh.

Auth model is "trust the tailnet" — the embedded server only serves paths under `rootsExposed`, but it serves them to any peer that can reach the port. If your tailnet is shared with untrusted users, this is not for you yet.

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

`doc-app/` in this repo is a small example — a generic HTML editor that uses the bridge. It also accepts `?file=http(s)://...` URLs: when the file param is an HTTP URL, doc-app fetches/PUTs/HEAD-polls over the network instead of going through the bridge. Combined with the daemon's embedded server, `surface --edit foo.html` on host A pops a doc-app window on host B; edits land back in `foo.html` on A within a second.

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
  server.js           the embedded HTTP server — file serving, /_/open RPC
  config.js           ~/.config/surface/config.json loader
  hello.html          dev page — renders a static HTML file
  playground.html     dev page — exercise the bridge by hand
bin/surface           the CLI — daemon launcher and HTTP dispatcher
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
- `bin/surface <path-or-url>` CLI with single-instance lock and HTTP dispatch.
- `surface(content)` MCP tool — one universal tool: URL, file path, or raw HTML. Registerable in any MCP-capable agent host.
- Daemon mode (`surface --daemon`) with embedded HTTP server + LaunchAgent template — Surface always-on per machine, instant first call.
- Cross-host mesh: two daemons on a tailnet form a one-verb surface where `surface X` on host A puts a window on host B.
- Temp-file machinery for agent-generated HTML, with 24-hour GC on launch.

What's still missing for "really works as a browser":

- Signed + notarized DMG (currently shipping unsigned).
- An in-app permissions UI (revoke, inspect).
- Recursive folder watch, async directory iterators, `removeEntry` / `move`.
- Per-peer auth tokens on the embedded server (today: trust the tailnet).
- Auto-discovery of peers (today: explicit `peers` in config).

See `docs/surface-api.md`'s roadmap section for the full list.
