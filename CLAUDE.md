# CLAUDE.md

Guidance for Claude Code (and any other agent) working in this repository.

## What this is

Surface is an AI-native browser: Chromium with a bridge that gives local-file access to whatever page is loaded inside it. The product is the runtime and the bridge. Nothing else.

The user-facing pitch and usage live in `README.md`. The public bridge contract is `docs/surface-api.md` — treat that as the spec; if you change the bridge, update the spec.

## Scope of this repo

- **`app/`** — the Surface binary. Electron main process, preload, bridge. This is the product.
- **`doc-app/`** — a small example web app (generic HTML editor) that uses the bridge. Kept in-repo as a reference consumer and a useful default for opening `.html` files.
- **`chat-app/`** — a prototype from an earlier direction. Not part of the runtime. Will move out; until then, don't build on it.
- **`docs/surface-api.md`** — public bridge spec.
- **`vision.md`, `individual.md`** — Max's own working docs. Much of their content describes a separate cockpit project, not Surface itself. Don't edit unless explicitly told to.

## Running

```sh
cd app && npm start
```

No tests, no linter, no build step. Edits land directly; restart Electron to see them. Today `npm start` loads `chat-app/` as a stand-in entry point — that's a holdover, not the target shape.

`app/playground.html` and `app/hello.html` are dev pages for exercising the bridge by hand.

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

## Working in this repo

- **Surface is engine-agnostic.** The browser doesn't know or care which AI agent is talking to it. Don't bake in assumptions about specific models, hosts, or chat shapes.
- **No new files unless needed.** Edit existing modules. The bridge is small on purpose.
- **No new docs unless asked.** `README.md`, `CLAUDE.md`, and `docs/surface-api.md` are the canonical surfaces; don't sprinkle markdown.
- **Surface-native language.** Avoid inherited terms from other paradigms (filesystem, family tree, chat thread, PKM) unless they're load-bearing. Flag imports rather than smuggle them in.
- **Personal docs are Max's.** `vision.md` and `individual.md` are not delegable. Other code changes can go through agents normally.
