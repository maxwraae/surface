# CLAUDE.md

Guidance for Claude Code (and any other agent) working in this repository.

## What this is

Surface is an AI-native browser: Chromium with a bridge that gives local-file access to whatever page is loaded inside it. The product is the runtime and the bridge. Nothing else.

The user-facing pitch and usage live in `README.md`. The public bridge contract is `docs/surface-api.md` — treat that as the spec; if you change the bridge, update the spec.

## Scope of this repo

- **`app/`** — the Surface binary. Electron main process, preload, bridge, embedded HTTP server, config loader. This is the product.
- **`bin/surface`** — the CLI. Two modes: `surface --daemon` execs Electron (long-running daemon, managed by LaunchAgent); `surface <thing>` builds a URL and POSTs it to the local daemon's `/_/open` (which the daemon forwards or opens locally, depending on `target` in config). Single-instance lock in `app/main.js` still keeps one Electron per machine.
- **`mcp/`** — the MCP server (`surface-mcp`). One tool exposed: `surface_open(target)`. Spawned as a stdio child by any MCP-capable agent host. Translates tool calls into `bin/surface <target>` (detached + unref, so the call returns immediately while Electron keeps running).
- **`doc-app/`** — a small example web app (generic HTML editor) that uses the bridge. Kept in-repo as a reference consumer and a useful default for opening `.html` files. Also accepts `?file=http(s)://...` URLs — when the file param is an HTTP URL, doc-app synthesizes a handle whose `read`/`write`/`watch` speak plain HTTP (GET / PUT / HEAD-poll) against the URL, bypassing the bridge. Combined with the daemon's embedded server (`app/server.js`), one host can host the file (and the doc-app) while another host renders the window — `surface --edit foo.html` on host A → editable window on host B, edits flow back.
- **`docs/surface-api.md`** — public bridge spec.
- **`pitch.html`** — the user/developer-facing pitch. The "demo doc" — open it in Surface to see what good HTML rendering looks like.
- **`archive/`** — preserved older material (the chat-app prototype, vision.md, individual.md, the canvas archive). Read-only context; don't edit and don't import from.

## Running

```sh
cd app && npm start
```

No tests, no linter, no build step in `app/`. Edits land directly; restart Electron to see them. Today `npm start` with no args still loads the (archived) chat-app stand-in as a fallback — that's a holdover, not the target shape; bare-invocation behavior is on the backlog.

`app/playground.html` and `app/hello.html` are dev pages for exercising the bridge by hand.

The MCP server has its own `package.json` and `node_modules`:

```sh
cd mcp && npm install        # one-time
node mcp/index.js            # smoke-test the server speaks MCP on stdio
```

## Architecture

### The bridge (two layers, one renderer-facing API)

`app/preload.js` exposes two namespaces to every renderer:

1. `window.surface` — the Surface-native API (persistent grants, push-based `watch` with `byMe`, mtime-based conflict detection on writes).
2. `window.showOpenFilePicker` / `showDirectoryPicker` / `showSaveFilePicker` — a subset of the File System Access API, so apps written for stock Chromium work unchanged.

Both forward over IPC to `app/bridge/handlers.js` in the main process. The renderer never touches the filesystem directly.

### Permission model — two independent gates

Every IPC handler enforces both. Don't bypass either.

1. **Origin grant** (`app/bridge/permissions.js`) — does this origin (or, for `file://`, this exact document path) have the bridge at all? States: `granted` / `denied` / `prompt`. Persisted to `permissions.json` in Electron's `userData` dir.
2. **Path grant** — has the user picked this specific path for this origin? Only `pickFile`/`pickFolder` can record one. There is no API to access an arbitrary path without going through a picker.

Folder grants are recursive; file grants are exact-match. Files served from `TRUSTED_ROOTS` skip the origin prompt — currently the app bundle and the in-repo example apps.

For trusted bundle code summoning another window via `window.surface.openWindow({ file })`, the main process can pre-grant a path before loading the target window. See `openWindow` in `app/main.js`.

### Watch and the `byMe` flag

`app/bridge/watch.js` runs one chokidar watcher per directory and fans out to file- and folder-level subscriptions. Every write the bridge performs is hashed (SHA-1) and added to a 10s ring buffer. When a watch event fires, the new content is hashed and compared — matching hashes set `byMe: true` so apps can ignore their own writes without reload loops. Writes carry a `baseMtime` for conflict detection; if disk has moved on, the write throws `ConflictError:` and the app re-reads or retries with `force: true`.

### Default-app routing

`app/bridge/defaults.js` maps file extensions to example-app keys (e.g. `.html` → `doc`). When something calls `window.surface.openWindow({ file })` without an `app`, resolution order is: explicit `opts.app` → user override → built-in default → plain Chromium rendering the file.

### App keys

`APPS` in `app/main.js` is the registry of in-repo example apps (currently `doc`). Add new example apps here and to `TRUSTED_ROOTS` in `permissions.js`. Long-term these become user-installable rather than bundled — see Status in `README.md`.

### Embedded HTTP server (`app/server.js`)

Surface boots an HTTP server inside the Electron main process. Bootstrapped from `app.whenReady()` in `main.js` right after `handlers.register()`. Reads `app/config.js` for port/bind/rootsExposed.

Endpoints:

- `GET / HEAD / PUT /<absolute-path>` — file I/O. Every request is gated through `perms.pathGranted(SERVER_ORIGIN, abs)` against a synthetic origin (`http://surface-server`) that's pre-granted folder access to each entry in `config.rootsExposed`. Anything outside → 403.
- `POST /_/open` with JSON `{url}` — the cross-Surface RPC. Calls `openCliTarget(url)` in the same process. This is how one daemon tells another to open a window.
- `GET /_/health` — liveness probe.
- `GET /_/peers` — diagnostic list of peers from config.

CORS is open and `Cache-Control: no-store` is forced on every response. Auth is "trust the tailnet" — the port is bound to `0.0.0.0` so peers can reach it; the only gate is path-allowlist.

### Daemon mode

`surface --daemon` skips the welcome window and stays alive headless. The standard `app.on('window-all-closed')` no-op on macOS already keeps Electron alive with zero windows, so the only effect of `--daemon` is "don't open the welcome page on cold start."

Intended caller is a LaunchAgent (`~/Library/LaunchAgents/com.maxwraae.surface.plist`) that runs `surface --daemon` at login with `KeepAlive=true` and `PATH=/opt/homebrew/bin:...` in the environment (needed because Electron's `#!/usr/bin/env node` shebang fires before user shell rc runs).

### Cross-machine mesh

Two Surface daemons on the same tailnet, each with a `config.json` pointing `target` at the other (one side typically uses `"target": "self"` to render locally). `bin/surface` reads config, builds a URL pointing at *this* machine's embedded server (using `self`), POSTs to `target/_/open`. The remote Surface's main process opens a window via `openCliTarget(url)`; the BrowserWindow fetches over HTTP from the originating machine. File stays put.

### Config (`app/config.js`)

Loads `~/.config/surface/config.json`, fills DEFAULTS. Fields: `port`, `bind`, `self`, `target`, `rootsExposed`, `peers`. If the file is missing, defaults work for a single-machine `target: "self"` setup. Both `main.js` (server bootstrap) and `bin/surface` (CLI dispatch) read this file independently.

## Working in this repo

- **Surface is engine-agnostic.** The browser doesn't know or care which AI agent is talking to it. Don't bake in assumptions about specific models, hosts, or chat shapes.
- **No new files unless needed.** Edit existing modules. The bridge is small on purpose.
- **No new docs unless asked.** `README.md`, `CLAUDE.md`, and `docs/surface-api.md` are the canonical surfaces; don't sprinkle markdown.
- **Surface-native language.** Avoid inherited terms from other paradigms (filesystem, family tree, chat thread, PKM) unless they're load-bearing. Flag imports rather than smuggle them in.
- **Personal docs are Max's.** `vision.md` and `individual.md` are not delegable. Other code changes can go through agents normally.
