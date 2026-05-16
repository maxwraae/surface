# Surface

An AI-native browser. Agents drive. Humans look.

Surface is Chromium with one extra capability: it gives the web page running inside it a real local filesystem. It's built to be opened *by* an agent, not browsed *by* a human — you talk to your agent in whatever tool you use (Claude Code, OpenCode, ChatGPT, voice, anything), and the agent uses Surface to put windows on your screen: drafts, dashboards, files, references — pulled from disk or from the web.

You don't navigate Surface. There's no URL bar, no tab strip, no bookmarks, no history. Each window is one rendered thing. Your agent opens them; you read them.

## What Surface ships

- **The runtime** — Chromium, framed by Electron, with no chrome.
- **The bridge** — `window.surface` plus the standard File System Access API, so any web page running inside Surface can read, write, and watch local files.
- **The CLI** *(planned)* — `surface open <path-or-url>` and friends, so an agent can drive Surface from any shell.

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

**Current state:** the CLI doesn't exist yet. Today, `npm start` boots Electron, which loads `chat-app/` as a stand-in entry point. The CLI is the next thing to build — see *Status* below.

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
doc-app/              example app — a generic HTML editor using the bridge
chat-app/             prototype, not part of the runtime (will move)
docs/surface-api.md   the public bridge contract
```

## Status

v0.2. The bridge works end-to-end:

- `window.surface` + the FSA-API subset documented in `docs/surface-api.md`.
- Two-gate permissions, persistent across restarts.
- Watch with `byMe` (self-write suppression via SHA-1 ring buffer).
- Conflict detection on writes (`baseMtime` → `ConflictError:`).
- Default-app routing by extension.

What's still missing for "really works as a browser":

- The CLI (`surface open`, `surface grant`).
- A bare-invocation behavior that isn't "open chat-app."
- A packaged `.dmg`.
- An in-app permissions UI (revoke, inspect).
- Recursive folder watch, async directory iterators, `removeEntry` / `move`.

See `docs/surface-api.md`'s roadmap section for the full list.
