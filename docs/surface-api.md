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
  openChild(name: string): Promise<FileHandle | FolderHandle>,
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

`openChild(name)` is a convenience to open a file or folder by name when the parent folder is already granted. No new picker required.

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
