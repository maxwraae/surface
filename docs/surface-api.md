# The Surface API

**Status:** v0.2 — local-file bridge for web apps. Spec for app authors.

Surface is a Chromium browser, in a window, with one additional capability: it gives the web page running inside it a real local filesystem. Every web app — Notion-clone, Excel-clone, GenBank web app, anything you build — can detect Surface and use it to read and write files on disk. Same web app in a regular browser falls back to whatever storage it already supports (cloud, IndexedDB, in-memory). In Surface, it gets local files for free.

This document is the spec. Anyone building a Surface-compatible web app codes against it.

## Detecting Surface

```js
if (window.surface?.isSurface) {
  // Running inside Surface. Local files are available.
} else if (window.showOpenFilePicker) {
  // Running inside a modern Chromium (Chrome 86+, Edge, Brave) with the
  // File System Access API. Local files via per-pick permission grants.
} else {
  // Falling back: cloud storage, IndexedDB, in-memory.
}
```

Surface implements **both** namespaces. Apps already written for the File System Access API work in Surface unchanged. Apps that want Surface-specific extras (persistent grants, push-based watch, conflict-detected writes) use `window.surface` directly.

## window.surface — the native API

```ts
window.surface: {
  isSurface: true,
  version: string,                                  // "0.2.0"

  permissions: {
    has(): Promise<boolean>,
    request(): Promise<boolean>,
  },

  pickFile(opts?: PickFileOptions): Promise<FileHandle | FileHandle[] | null>,
  pickFolder(opts?: PickFolderOptions): Promise<FolderHandle | null>,

  openExternal(path: string): Promise<void>,        // open in OS default app
};

interface PickFileOptions {
  multiple?: boolean,                               // default false
  types?: Array<{ name: string, extensions: string[] }>,  // filter
  startIn?: string,                                 // suggested folder
}

interface PickFolderOptions {
  startIn?: string,
}
```

A successful `pickFile` or `pickFolder` records a **persistent grant** for the calling origin. The user does not need to pick again on the next page load — the origin retains read/write access to that exact path (or folder subtree) until they revoke it.

### FileHandle

```ts
interface FileHandle {
  path: string,        // absolute
  name: string,        // basename
  mtime: number,       // last-known mtime in ms (live: updated by read/write/watch)
  size: number,
  isFile: true,
  isDirectory: false,

  read(opts?: { as?: 'text' | 'bytes' }): Promise<string | Uint8Array>,
  write(content: string | Uint8Array, opts?: WriteOptions): Promise<{ mtime: number }>,
  stat(): Promise<{ mtime: number, mtimeNs: string, size: number, isFile, isDirectory }>,
  watch(callback: (event: WatchEvent) => void): () => void,

  rename(newName: string): Promise<FileHandle>,    // same parent only; old handle invalidated
  delete(): Promise<void>,                          // invalidates this handle
  openExternal(): Promise<void>,                    // open in OS default app
}

interface WriteOptions {
  baseMtime?: number,   // defaults to the handle's last-known mtime
  force?: boolean,      // defaults to false; override the conflict check
}

interface WatchEvent {
  subscriptionId: string,
  type: 'change' | 'add' | 'unlink',
  path: string,
  name: string,
  mtime: number | null,    // null on 'unlink'
  byMe: boolean,           // true if this event reflects a write made by this handle
}
```

Conflict detection: every `write` carries a `baseMtime`. If the file on disk has a newer mtime when the write lands, the write throws an error whose message starts with `ConflictError:`. Apps catch this and either re-read or retry with `force: true`.

The `byMe` flag is computed by SHA-1 of the new file content against a ring buffer of recent self-write hashes. It survives rapid edits, delayed disk flushes, and writes that race the agent. Use it to suppress reload loops:

```js
const unwatch = handle.watch((ev) => {
  if (ev.byMe) return;             // our own write; ignore
  reloadEditor(handle);
});
```

### FolderHandle

```ts
interface FolderHandle {
  path: string,
  name: string,
  isFile: false,
  isDirectory: true,

  list(): Promise<DirEntry[]>,
  watch(callback: (event: WatchEvent) => void): () => void,
  pickFile(opts?): Promise<FileHandle | null>,     // picker scoped to this folder
  openChild(name: string, opts?: { create?: boolean }): Promise<FileHandle | FolderHandle>,
  createFile(name: string, content?: string | Uint8Array, opts?: { overwrite?: boolean }): Promise<FileHandle>,

  createSubfolder(name: string): Promise<FolderHandle>,
  rename(newName: string): Promise<FolderHandle>,             // same parent only; old handle invalidated
  delete(opts?: { recursive?: boolean }): Promise<void>,      // refuses non-empty unless recursive:true; invalidates this handle
}

interface DirEntry {
  name: string,
  path: string,
  type: 'file' | 'folder' | 'other',
  mtime: number | null,
  size: number | null,
}
```

`watch` on a folder fires for any direct child added/removed/changed. v0.2 watches direct children only — recursive watch is v0.3.

`openChild(name)` is a convenience to open a file or folder by name when the parent folder is already granted. No new picker required. Pass `{create: true}` to create the file if it doesn't exist (single-level only — for nested paths, create the subfolder first).

`createFile(name, content?, opts?)` creates a new file in this folder and returns a `FileHandle`. `name` must be a single path segment (no `/` or `\`). Default content is empty. Throws `EEXIST: file already exists at <path>` if the file exists, unless `opts.overwrite === true`. Writes atomically (tmp + rename) and registers the write with the watcher so concurrent watchers receive `byMe: true`.

### Filesystem mutation

`createSubfolder`, `rename`, and `delete` mutate the filesystem within the current path grant. Names are sanitized: no `..`, no `/` or `\`, no leading/trailing whitespace, no leading `.` (no dotfiles via this API — use `surface:write` directly if you really need one), and no empty strings.

`rename(newName)` is single-level only — it renames within the same parent directory. Cross-directory moves are a different API (not in v0.2). Both the old path and the new path must be covered by a path grant; for folder grants, both are covered automatically because they share the parent. Rename is atomic on the same filesystem (`fs.renameSync`). The call returns a fresh handle bound to the new path; the original handle is invalidated and any further op on it throws `ENOENT`.

`delete()` on a `FileHandle` unlinks the file. `delete({ recursive })` on a `FolderHandle` refuses to delete a non-empty folder unless `recursive: true` is passed (throws `ENOTEMPTY:`). Either way, the handle is invalidated after a successful delete.

### Opening files in their default app

```ts
window.surface.openExternal(path: string): Promise<void>
fileHandle.openExternal(): Promise<void>            // sugar for the above
```

Asks the OS to open `path` in whatever app the user has registered as the default for that file type — `.numbers` in Numbers, `.docx` in Word, `.key` in Keynote, etc. Useful for file types Surface can't render natively. Internally calls Electron's `shell.openPath`, which routes through Launch Services on macOS.

The path must be covered by an existing path grant for the calling origin. There is **no per-call user confirmation** in v0.2 — the origin grant + path grant are the security boundary. If a renderer has been granted a folder, it can ask the OS to open any file inside that folder in its default app without a fresh prompt. Apps that hand untrusted paths to `openExternal` are giving up that boundary; don't do that.

macOS Launch Services still does its own gatekeeping. Surface doesn't elevate; it asks the OS to perform the open. If a Surface app passes a path to a `.app` bundle the user has never run, the OS handles the Gatekeeper prompt itself. Benign document types open straight away. Rejects with `ENOENT` if the file doesn't exist, or with the Launch Services error message if the OS refuses the open.

## File System Access API subset

Surface implements `window.showOpenFilePicker`, `window.showDirectoryPicker`, and the handle shape that the spec defines, sufficient for the 95% case of file editors:

```js
// Open a file
const [handle] = await window.showOpenFilePicker();
const file = await handle.getFile();
const text = await file.text();

// Save a file
const writable = await handle.createWritable();
await writable.write(newText);
await writable.close();

// Open a folder
const dir = await window.showDirectoryPicker();
const handles = await dir.values();         // array (see note)
for (const h of handles) {
  console.log(h.kind, h.name);
}
```

### Supported

- `window.showOpenFilePicker(opts)` — returns `[FileSystemFileHandle]`
- `window.showSaveFilePicker(opts)` — returns `FileSystemFileHandle` for a path the user chose as a save target (may not exist yet; first `createWritable().write()/close()` creates it)
- `window.showDirectoryPicker(opts)` — returns `FileSystemDirectoryHandle`
- `FileSystemFileHandle.kind`, `.name`, `.getFile()`, `.createWritable()`, `.isSameEntry()`
- `FileSystemWritableFileStream.write(data)`, `.close()`, `.abort()` — `write` accepts string, Blob, ArrayBuffer, Uint8Array, and `{type:'write', data}` chunks
- `FileSystemDirectoryHandle.kind`, `.name`, `.values()`, `.entries()`, `.getFileHandle(name, {create})`, `.getDirectoryHandle(name)`, `.isSameEntry()`

### Not in v0.2

- Async iteration on directory handles. `dir.values()` and `dir.entries()` return arrays, not async iterators. Await once, then loop normally.
- `FileSystemWritableFileStream.seek()` and `.truncate()` — writes are full-content.
- `FileSystemDirectoryHandle.removeEntry()` and `.move()` and `.keys()`.
- `queryPermission()` / `requestPermission()` — use `window.surface.permissions` instead.

Apps that need the missing pieces: drop into `window.surface` for equivalents. Those are coming to the FSA-API surface in v0.3.

## Errors

All errors propagate as `Error` instances. Inspect `err.message`:

- `permission denied` — origin lacks bridge access (user denied or hasn't been prompted).
- `path not granted: /some/path` — origin has bridge access but hasn't picked this path. Use `pickFile`/`pickFolder` first.
- `ConflictError: <path> changed on disk since read (base=…, current=…)` — write would overwrite an external change. Re-read or retry with `force: true`.
- `User canceled` (name `AbortError`) — user dismissed the FSA-API picker without choosing.
- `File not found` (name `NotFoundError`) — `getFileHandle(name)` for a path that doesn't exist (use `{create: true}` to create).
- `Path is not a file` / `Path is not a directory` (name `TypeMismatchError`) — handle kind mismatch.

## Permission model

Two independent gates. Both must pass for any file operation.

1. **Origin grant.** Each origin (or, for `file://` URLs, each document path) has a state: `granted`, `denied`, or `prompt`. New origins start at `prompt` and pop a native dialog on first bridge use. Files served from inside the Surface app bundle skip the prompt (they're shipped by Surface).

2. **Path grant.** `pickFile` and `pickFolder` are the only way an origin obtains access to a specific path. Subsequent `read`/`write`/`list`/`watch` operations are allowed only for paths covered by a recorded grant. There is no API to access an arbitrary path without going through a picker first.

Folder grants are *recursive* — granting `/Users/me/Documents` covers every file under it. File grants are exact-match.

Grants persist across Surface restarts. Users edit `~/Library/Application Support/surface/permissions.json` to revoke (a proper UI is v0.3).

### App identity

Path grants are keyed by **origin** by default. For a `file://` document, that origin is the document path itself. This is fine in development, but it breaks the moment the consuming app is packaged: the dev path (`file:/Users/me/foo/out/renderer/index.html`) becomes the bundle path (`file:/Applications/Foo.app/Contents/Resources/app/out/renderer/index.html`), the renderer's origin changes, and every grant the user made in dev is orphaned. The user lands in the packaged build to a wall of "path not granted" errors despite the dev build having full access.

The fix is to let a host declare an **app identity** that spans multiple origins. From the host's main process, after loading the bridge module, call `perms.registerApp({ appId, origins })`. From then on, any of the listed origins resolves to the same `appId`, and path grants are stored per-appId rather than per-origin. Two different renderer URLs that belong to the same packaged app share a single grant set.

`registerApp` is **host-process-only.** It is intentionally not exposed via IPC: a renderer must not be able to claim it belongs to the host's app and gain access to that app's previously granted folders. The host calls it once at boot before opening any windows.

**Backward compatible.** Origins that never register an `appId` continue to use the legacy origin-keyed table exactly as before. Existing `permissions.json` files keep working — the new `apps` key is purely additive alongside the existing `origins` key. There is no silent migration of legacy grants into an app entry; if a consumer wants to lift previously persisted dev-path grants into their `appId`, they can call `perms.addOriginGrantsToApp(appId, origins)` once on first run of the packaged build.

```js
// In the host's main.js, just after requiring the bridge:
const path = require('path');
const perms = require('surface/app/bridge/permissions');

perms.registerApp({
  appId: 'io.maxwraae.workspace',
  origins: [
    // dev build
    `file:${path.join(__dirname, '..', 'renderer', 'index.html')}`,
    // packaged bundle
    `file:${path.join(process.resourcesPath, 'app/out/renderer/index.html')}`,
    // add more origins (e.g. iframe content paths) as they become known
  ],
});
```

Lookup precedence inside `pathGranted(origin, path)`:

1. If `origin` is mapped to an `appId`, check the app's recorded paths.
2. Otherwise (or if no app grant matched), check the legacy origin-keyed paths.
3. Otherwise deny.

Persistence schema (after this change):

```json
{
  "origins": { "...": "...legacy origin-keyed grants, unchanged..." },
  "apps": {
    "io.maxwraae.workspace": {
      "origins": ["file:/Users/...", "file:/Applications/..."],
      "paths": [
        { "path": "/Users/maxwraae/Workspace", "mode": "folder", "grantedAt": 1747000000000 }
      ]
    }
  }
}
```

## Embedding Surface in iframes

A Surface-aware app can host other content via `<iframe>`. By default that doesn't work the way you'd expect: subframes run in their own web context, and `window.surface` is undefined inside them. The preload that exposes the bridge only runs in the top-level renderer.

**Make the preload run in subframes.** Surface's host BrowserWindow needs `webPreferences.nodeIntegrationInSubFrames: true`. With that flag set, the same preload runs in every nested frame, and `window.surface` is present at every depth.

**Each iframe is its own origin.** For `file://` documents, the origin Surface checks is the document path itself — `file:/path/to/host/index.html` and `file:/path/to/iframe-content.html` are distinct, each needs its own grants. The trusted-bundle bypass works only if the iframe's path lives inside a registered app dir; anything else hits the origin-prompt gate on first bridge use, and then needs its own path grants.

**Pre-granting from a trusted host.** A trusted host that has already obtained folder grants from the user can hand them off to an iframe at load time by calling a main-process IPC that records the same path grants under the iframe's document origin. Workspace does exactly this — see `workspace:grantIframeOrigin` in its main process for a working example. The shape: host receives an `iframe.onload`, asks main to mirror specific path grants from `file:/host/index.html` to `file:/iframe/app.html`. After that, the iframe's `window.surface.*` calls succeed without re-prompting.

**Minimal example.** From inside a top-level Surface page:

```html
<iframe src="file:///path/to/app/index.html?file=/Users/me/notes/today.md"></iframe>
```

The iframe's app code uses `window.surface.pickFile`, `handle.read`, `handle.watch` exactly like a standalone Surface window. No bridge differences inside vs. outside an iframe — only the origin and the grants differ.

**`<webview>` is a different beast.** The `<webview>` tag spins up separate web contents with its own process, and does *not* inherit the host's preload. It needs `webPreferences.webviewTag: true` on the host, and the `<webview>` element needs its own `preload` attribute pointing at a preload script that re-establishes the bridge surface. Use `<iframe>` by default. Reach for `<webview>` only when the embedded site sets a restrictive `frame-ancestors` CSP that forbids `<iframe>` embedding — `<webview>` isn't subject to that policy.

## Content-aware routing for HTML

Surface treats HTML as the universal carrier. Any HTML file can declare which viewer app should render it, with a `<meta>` in the head:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="surface" content="doc">
  <title>...</title>
</head>
<body>...</body>
</html>
```

`content` is an app key — one of the apps installed under `apps/<key>/` (see `surface-app.json` manifests). `content="doc"` opens the file in the doc editor; `content="code"` opens it in the code viewer; anything else likewise. `content="raw"` (or empty `content`) explicitly forces plain Chromium rendering even if extension routing would otherwise pick a viewer. A `content` value pointing at an app that isn't installed falls through to raw — no error.

**Legacy fallback.** Files written by older versions of the doc app wrap the body in `<doc class="...">` instead of using the meta tag. Surface detects that element and treats it as implicit `content="doc"`, so already-saved files keep opening in the doc editor without retroactive migration. New writes from the doc app emit both the meta tag and the wrapper.

**Routing precedence**, highest to lowest:

1. CLI `--app=<key>` (`surface --app=doc foo.html`) — per-call override.
2. `<meta name="surface" content="<key>">` in the head — file self-declares.
3. Legacy `<doc>` body element — implicit `doc`.
4. User override in `~/Library/Application Support/surface/defaults.json` — per-extension preference.
5. App-registry floor (each app's `preferredFor` extensions).
6. Raw render.

For non-HTML files, only rules 1, 4, 5, 6 apply.

### The `/_/resolve` endpoint

Tools that need to know what app to load for a file — the `surface` CLI, Workspace cards, anything else driving Surface from outside — call the daemon's HTTP `/_/resolve`:

```
GET http://localhost:7878/_/resolve?path=<URL-encoded-abs-path>

→ { "raw": true,  "source": "raw"|"marker-raw"|"unknown-app", "app": null }
  // render the file URL directly in Chromium

→ { "raw": false, "source": "meta"|"doc-element"|"ext"|"override",
    "app": { "key": "doc", "entryPath": "...", "tier": "builtin", "manifest": {...} } }
  // load the app and pass ?file=<file-url>
```

`source` tells you why this routing decision was made:
- `meta` — file declared via `<meta name="surface" content="...">`.
- `doc-element` — legacy `<doc>` body element.
- `ext` — app-registry extension floor.
- `override` — user's `defaults.json`.
- `raw` — nothing matched.
- `marker-raw` — file explicitly requested raw render.
- `unknown-app` — file asked for an app that isn't installed.

The peek budget for marker detection is the first 4 KB of the file. Markers further in are ignored.

## End-to-end example

A minimal markdown viewer/editor that opens a folder, lets you pick a file, edits with autosave, reloads on external change:

```js
async function openVault() {
  if (!window.surface) return alert('Open this in Surface to enable local files.');

  const folder = await window.surface.pickFolder();
  if (!folder) return;

  const files = (await folder.list()).filter((e) => e.type === 'file' && e.name.endsWith('.md'));
  renderSidebar(files);

  folder.watch(() => renderSidebar(files));   // refresh list on folder changes
}

async function openFile(entry) {
  const handle = await folder.openChild(entry.name);
  let content = await handle.read();
  renderEditor(content);

  const unwatch = handle.watch(async (ev) => {
    if (ev.byMe) return;
    content = await handle.read();
    renderEditor(content);
  });

  onEdit(async (newContent) => {
    try {
      await handle.write(newContent);
    } catch (err) {
      if (err.message.startsWith('ConflictError')) {
        const fresh = await handle.read();
        renderEditor(fresh);
        toast('Reloaded — file changed externally.');
      }
    }
  });
}
```

## Roadmap

v0.3 will add: async iterators on directory handles, recursive folder watch, in-app permissions UI, removeEntry/move/seek/truncate, atomic writes (write-temp + rename), file-streaming (large files).

v0.4+ will explore: bidirectional CRDT sync at the file layer (Y.js bindings as an opt-in), structural ops (in addition to full-content writes), multi-window file coordination, capability tokens for sandboxed workers.
