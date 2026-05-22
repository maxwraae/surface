// Surface bridge — preload.
//
// Runs in every BrowserWindow before the page loads. Has access to Electron's
// ipcRenderer and contextBridge but no other Node APIs. Exposes two surfaces:
//
//   window.surface              — Surface-native API. Persistent grants,
//                                 push-based watch with byMe flag, conflict-
//                                 detected writes.
//   window.showOpenFilePicker   — File System Access API subset. Apps already
//   window.showDirectoryPicker    written for FSA-API work in Surface unchanged.
//
// Both forward to IPC handlers in the main process. The renderer never touches
// the filesystem directly.

const { contextBridge, ipcRenderer } = require('electron');

function uid() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function makeError(message, name) {
  const err = new Error(message);
  err.name = name;
  return err;
}

// ---------------------------------------------------------------------------
// window.surface — Surface-native API
// ---------------------------------------------------------------------------

function makeFileHandle(meta) {
  let lastMtime = meta.mtime;
  let currentPath = meta.path;
  let currentName = meta.name;
  let invalid = false;
  function ensureValid(op) {
    if (invalid) {
      const err = new Error(`ENOENT: handle invalidated by previous ${op === 'use' ? 'op' : op}`);
      err.code = 'ENOENT';
      throw err;
    }
  }
  const h = {
    get path() { return currentPath; },
    get name() { return currentName; },
    size: meta.size,
    isFile: true,
    isDirectory: false,
    get mtime() { return lastMtime; },
    async read(opts = {}) {
      ensureValid('use');
      const r = await ipcRenderer.invoke('surface:read', {
        path: currentPath,
        as: opts?.as ?? 'text',
      });
      lastMtime = r.mtime;
      return r.content;
    },
    async write(content, opts = {}) {
      ensureValid('use');
      const r = await ipcRenderer.invoke('surface:write', {
        path: currentPath,
        content,
        baseMtime: opts?.baseMtime ?? lastMtime,
        force: opts?.force ?? false,
      });
      lastMtime = r.mtime;
      return r;
    },
    async stat() {
      ensureValid('use');
      const st = await ipcRenderer.invoke('surface:stat', { path: currentPath });
      lastMtime = st.mtime;
      return st;
    },
    async rename(newName) {
      ensureValid('use');
      const r = await ipcRenderer.invoke('surface:rename', {
        oldPath: currentPath,
        newName,
      });
      // Invalidate this handle and return a fresh one for the new path.
      invalid = true;
      const st = await ipcRenderer.invoke('surface:stat', { path: r.newPath });
      return makeFileHandle({
        path: r.newPath,
        name: newName,
        mtime: st.mtime,
        size: st.size,
      });
    },
    async delete() {
      ensureValid('use');
      await ipcRenderer.invoke('surface:delete', { path: currentPath });
      invalid = true;
    },
    async openExternal() {
      ensureValid('use');
      return ipcRenderer.invoke('surface:openExternal', { path: currentPath });
    },
    watch(callback) {
      const id = uid();
      const listener = (_e, payload) => {
        if (payload.subscriptionId !== id) return;
        if (payload.mtime != null) lastMtime = payload.mtime;
        callback(payload);
      };
      ipcRenderer.on('surface:watch-event', listener);
      ipcRenderer.invoke('surface:watch', { path: currentPath, mode: 'file', id });
      return () => {
        ipcRenderer.removeListener('surface:watch-event', listener);
        ipcRenderer.invoke('surface:unwatch', { id });
      };
    },
  };
  return h;
}

function makeFolderHandle(meta) {
  let currentPath = meta.path;
  let currentName = meta.name;
  let invalid = false;
  function ensureValid() {
    if (invalid) {
      const err = new Error('ENOENT: handle invalidated by previous op');
      err.code = 'ENOENT';
      throw err;
    }
  }
  return {
    get path() { return currentPath; },
    get name() { return currentName; },
    isFile: false,
    isDirectory: true,
    async list() {
      ensureValid();
      return ipcRenderer.invoke('surface:list', { path: currentPath });
    },
    watch(callback) {
      const id = uid();
      const listener = (_e, payload) => {
        if (payload.subscriptionId === id) callback(payload);
      };
      ipcRenderer.on('surface:watch-event', listener);
      ipcRenderer.invoke('surface:watch', { path: currentPath, mode: 'folder', id });
      return () => {
        ipcRenderer.removeListener('surface:watch-event', listener);
        ipcRenderer.invoke('surface:unwatch', { id });
      };
    },
    async pickFile(opts = {}) {
      ensureValid();
      const r = await ipcRenderer.invoke('surface:pickFile', {
        ...opts,
        startIn: currentPath,
      });
      return r ? makeFileHandle(r) : null;
    },
    async openChild(name, opts = {}) {
      // Open a known child by name (path-grant must already cover it,
      // typically because this folder was granted via pickFolder).
      // With { create: true }, create the file if it doesn't exist.
      ensureValid();
      const childPath = `${currentPath}/${name}`;
      try {
        const st = await ipcRenderer.invoke('surface:stat', { path: childPath });
        return st.isFile
          ? makeFileHandle({ path: childPath, name, mtime: st.mtime, size: st.size })
          : makeFolderHandle({ path: childPath, name });
      } catch (err) {
        if (opts?.create) {
          const r = await ipcRenderer.invoke('surface:createFile', {
            folderPath: currentPath,
            name,
          });
          return makeFileHandle({ path: r.path, name, mtime: r.mtime, size: 0 });
        }
        throw err;
      }
    },
    async createFile(name, content, opts = {}) {
      ensureValid();
      const r = await ipcRenderer.invoke('surface:createFile', {
        folderPath: currentPath,
        name,
        content,
        overwrite: opts?.overwrite ?? false,
      });
      const size = content == null
        ? 0
        : typeof content === 'string'
          ? content.length
          : content.byteLength ?? 0;
      return makeFileHandle({ path: r.path, name, mtime: r.mtime, size });
    },
    async createSubfolder(name) {
      ensureValid();
      const r = await ipcRenderer.invoke('surface:createSubfolder', {
        folderPath: currentPath,
        name,
      });
      return makeFolderHandle({ path: r.path, name });
    },
    async rename(newName) {
      ensureValid();
      const r = await ipcRenderer.invoke('surface:rename', {
        oldPath: currentPath,
        newName,
      });
      // Invalidate this handle; future ops throw ENOENT. Return a fresh handle
      // bound to the new path.
      invalid = true;
      return makeFolderHandle({ path: r.newPath, name: newName });
    },
    async delete(opts = {}) {
      ensureValid();
      await ipcRenderer.invoke('surface:delete', {
        path: currentPath,
        recursive: opts?.recursive ?? false,
      });
      invalid = true;
    },
  };
}

const surface = {
  isSurface: true,
  version: '0.2.0',

  permissions: {
    async has() {
      return (await ipcRenderer.invoke('surface:check')) === 'granted';
    },
    async request() {
      return (await ipcRenderer.invoke('surface:request')) === 'granted';
    },
  },

  async pickFile(opts = {}) {
    const r = await ipcRenderer.invoke('surface:pickFile', opts);
    if (!r) return null;
    return Array.isArray(r) ? r.map(makeFileHandle) : makeFileHandle(r);
  },

  async pickFolder(opts = {}) {
    const r = await ipcRenderer.invoke('surface:pickFolder', opts);
    return r ? makeFolderHandle(r) : null;
  },

  async open(filePath) {
    // Direct path access — only works if the calling origin already has a grant
    // for this path (typically because user picked it earlier, OR because Surface
    // main process pre-granted it for a trusted demo window).
    const r = await ipcRenderer.invoke('surface:open', { path: filePath });
    return r.isDirectory ? makeFolderHandle(r) : makeFileHandle(r);
  },

  async openExternal(filePath) {
    // Ask the OS to open `filePath` in its default app via Launch Services.
    // Requires a read path-grant for the calling origin. No per-call prompt;
    // the path-grant model is the gate.
    return ipcRenderer.invoke('surface:openExternal', { path: filePath });
  },

  async openWindow(opts) {
    // Summon another Surface window. opts: { url }, or { file, app? }.
    // File without app -> user default for that extension, else built-in default,
    // else plain Chromium rendering. Requires bridge access.
    return ipcRenderer.invoke('surface:openWindow', opts ?? {});
  },

  defaults: {
    // Per-extension default-app map. get() returns all (user + built-ins),
    // set(ext, app) writes one — pass null to clear.
    async get() {
      return ipcRenderer.invoke('surface:getDefaults');
    },
    async set(ext, appName) {
      return ipcRenderer.invoke('surface:setDefault', { ext, app: appName });
    },
  },
};

contextBridge.exposeInMainWorld('surface', surface);

// ---------------------------------------------------------------------------
// File System Access API subset
// ---------------------------------------------------------------------------

function makeFSAFileHandle(meta) {
  return {
    kind: 'file',
    name: meta.name,
    _surfacePath: meta.path,
    async getFile() {
      const r = await ipcRenderer.invoke('surface:read', { path: meta.path, as: 'bytes' });
      const bytes = r.content instanceof Uint8Array ? r.content : new Uint8Array(r.content);
      return new File([bytes], meta.name, { lastModified: r.mtime });
    },
    async createWritable() {
      let buf = new Uint8Array(0);
      return {
        async write(data) {
          let chunk;
          if (typeof data === 'string') {
            chunk = new TextEncoder().encode(data);
          } else if (data instanceof Blob) {
            chunk = new Uint8Array(await data.arrayBuffer());
          } else if (data instanceof ArrayBuffer) {
            chunk = new Uint8Array(data);
          } else if (data instanceof Uint8Array) {
            chunk = data;
          } else if (data && typeof data === 'object' && 'type' in data && 'data' in data) {
            return this.write(data.data);
          } else {
            throw makeError('Unsupported write data', 'TypeError');
          }
          const merged = new Uint8Array(buf.length + chunk.length);
          merged.set(buf);
          merged.set(chunk, buf.length);
          buf = merged;
        },
        async close() {
          await ipcRenderer.invoke('surface:write', { path: meta.path, content: buf });
        },
        async abort() {
          buf = new Uint8Array(0);
        },
      };
    },
    async isSameEntry(other) {
      return other?.kind === 'file' && other?._surfacePath === meta.path;
    },
  };
}

function makeFSADirectoryHandle(meta) {
  return {
    kind: 'directory',
    name: meta.name,
    _surfacePath: meta.path,
    async values() {
      const entries = await ipcRenderer.invoke('surface:list', { path: meta.path });
      return entries
        .map((e) => {
          if (e.type === 'file') return makeFSAFileHandle(e);
          if (e.type === 'folder') return makeFSADirectoryHandle(e);
          return null;
        })
        .filter(Boolean);
    },
    async entries() {
      const handles = await this.values();
      return handles.map((h) => [h.name, h]);
    },
    async getFileHandle(name, opts = {}) {
      const entryPath = `${meta.path}/${name}`;
      try {
        const st = await ipcRenderer.invoke('surface:stat', { path: entryPath });
        if (!st.isFile) throw makeError(`${entryPath} is not a file`, 'TypeMismatchError');
        return makeFSAFileHandle({ path: entryPath, name, mtime: st.mtime, size: st.size });
      } catch (err) {
        if (opts.create) {
          await ipcRenderer.invoke('surface:write', { path: entryPath, content: '' });
          return makeFSAFileHandle({ path: entryPath, name, mtime: Date.now() });
        }
        throw makeError(`File not found: ${entryPath}`, 'NotFoundError');
      }
    },
    async getDirectoryHandle(name) {
      const entryPath = `${meta.path}/${name}`;
      const st = await ipcRenderer.invoke('surface:stat', { path: entryPath });
      if (!st.isDirectory) throw makeError(`${entryPath} is not a directory`, 'TypeMismatchError');
      return makeFSADirectoryHandle({ path: entryPath, name, mtime: st.mtime });
    },
    async isSameEntry(other) {
      return other?.kind === 'directory' && other?._surfacePath === meta.path;
    },
  };
}

contextBridge.exposeInMainWorld('showOpenFilePicker', async (opts = {}) => {
  const r = await ipcRenderer.invoke('surface:pickFile', {
    multiple: opts.multiple ?? false,
    types: opts.types,
  });
  if (!r) throw makeError('User canceled', 'AbortError');
  const arr = Array.isArray(r) ? r : [r];
  return arr.map(makeFSAFileHandle);
});

contextBridge.exposeInMainWorld('showDirectoryPicker', async (opts = {}) => {
  const r = await ipcRenderer.invoke('surface:pickFolder', opts);
  if (!r) throw makeError('User canceled', 'AbortError');
  return makeFSADirectoryHandle(r);
});

contextBridge.exposeInMainWorld('showSaveFilePicker', async (opts = {}) => {
  const r = await ipcRenderer.invoke('surface:pickSaveFile', {
    suggestedName: opts.suggestedName,
    types: opts.types,
  });
  if (!r) throw makeError('User canceled', 'AbortError');
  return makeFSAFileHandle(r);
});
