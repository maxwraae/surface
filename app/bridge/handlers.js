// Main-process IPC handlers for the Surface bridge.
//
// Every handler enforces two gates: the origin must have bridge access (granted
// in permissions.json, or be from inside the trusted app bundle) AND the path
// being touched must be in the origin's path-grant store (i.e. the user picked
// it via the dialog at some point). Direct path access without a prior pick is
// rejected — there is no way to read /etc/passwd without the user explicitly
// granting it.
//
// For file:// origins each document is its own origin key (the URL pathname),
// so two unrelated local HTML files do not share grants.

const { ipcMain, dialog, BrowserWindow } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const perms = require('./permissions');
const watch = require('./watch');

function originKey(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'file:') return `file:${u.pathname}`;
    return u.origin;
  } catch {
    return null;
  }
}

function senderInfo(event) {
  const url = event.senderFrame?.url ?? '';
  return { url, origin: originKey(url) };
}

async function gateOrigin(event) {
  const { origin, url } = senderInfo(event);
  if (!origin) throw new Error('cannot determine sender origin');
  if (perms.isTrustedBundleUrl(url)) return { origin, url };
  let state = perms.check(origin);
  if (state === 'prompt') {
    const parent = BrowserWindow.fromWebContents(event.sender);
    state = await perms.prompt(origin, url, parent);
  }
  if (state !== 'granted') throw new Error('permission denied');
  return { origin, url };
}

function ensurePathGrant(origin, filePath) {
  if (!perms.pathGranted(origin, filePath)) {
    throw new Error(`path not granted: ${filePath}`);
  }
}

function statOf(filePath) {
  const st = fs.statSync(filePath, { bigint: true });
  return {
    mtime: Number(st.mtimeNs / 1_000_000n),
    mtimeNs: st.mtimeNs.toString(),
    size: Number(st.size),
    isFile: st.isFile(),
    isDirectory: st.isDirectory(),
  };
}

function describeFile(filePath) {
  const abs = path.resolve(filePath);
  const st = statOf(abs);
  return { path: abs, name: path.basename(abs), ...st };
}

// Sanitize a child name for filesystem-mutation methods. Rejects path
// separators, parent-dir refs, dotfiles, and whitespace-padded names so
// renderers can't escape the parent dir or shadow hidden files via these APIs.
// Callers who genuinely need a dotfile can use surface:write directly.
function validateChildName(name, op) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`${op}: name must be a non-empty string`);
  }
  if (name !== name.trim()) {
    throw new Error(`${op}: name must not have leading/trailing whitespace`);
  }
  if (name === '.' || name === '..') {
    throw new Error(`${op}: invalid name "${name}"`);
  }
  if (name.includes('/') || name.includes('\\')) {
    throw new Error(`${op}: invalid name (no separators allowed): ${name}`);
  }
  if (name.startsWith('.')) {
    throw new Error(`${op}: dotfiles are not allowed via this API (use surface:write directly if you need one)`);
  }
}

function register() {
  ipcMain.handle('surface:check', async (event) => {
    const { origin, url } = senderInfo(event);
    if (perms.isTrustedBundleUrl(url)) return 'granted';
    return perms.check(origin);
  });

  ipcMain.handle('surface:request', async (event) => {
    const { origin, url } = senderInfo(event);
    if (perms.isTrustedBundleUrl(url)) return 'granted';
    const parent = BrowserWindow.fromWebContents(event.sender);
    return perms.prompt(origin, url, parent);
  });

  ipcMain.handle('surface:pickFile', async (event, opts = {}) => {
    const { origin } = await gateOrigin(event);
    const parent = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(parent, {
      properties: opts.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
      defaultPath: opts.startIn,
      filters: opts.types,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const paths = result.filePaths;
    paths.forEach((p) => perms.recordPathGrant(origin, p, 'file'));
    return opts.multiple ? paths.map(describeFile) : describeFile(paths[0]);
  });

  ipcMain.handle('surface:pickSaveFile', async (event, opts = {}) => {
    const { origin } = await gateOrigin(event);
    const parent = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(parent, {
      defaultPath: opts.suggestedName,
      filters: opts.types,
    });
    if (result.canceled || !result.filePath) return null;
    const abs = path.resolve(result.filePath);
    perms.recordPathGrant(origin, abs, 'file');
    // Target may not exist yet — return a minimal descriptor; first write creates it.
    let st = null;
    try { st = statOf(abs); } catch { /* nonexistent */ }
    return {
      path: abs,
      name: path.basename(abs),
      mtime: st?.mtime ?? 0,
      size: st?.size ?? 0,
      isFile: true,
      isDirectory: false,
    };
  });

  ipcMain.handle('surface:pickFolder', async (event, opts = {}) => {
    const { origin } = await gateOrigin(event);
    const parent = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(parent, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: opts.startIn,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const folderPath = result.filePaths[0];
    perms.recordPathGrant(origin, folderPath, 'folder');
    return describeFile(folderPath);
  });

  ipcMain.handle('surface:read', async (event, { path: filePath, as = 'text' } = {}) => {
    const { origin } = await gateOrigin(event);
    const abs = path.resolve(filePath);
    ensurePathGrant(origin, abs);
    const st = statOf(abs);
    if (as === 'bytes') {
      const buf = fs.readFileSync(abs);
      return { content: buf, mtime: st.mtime };
    }
    const content = fs.readFileSync(abs, 'utf8');
    return { content, mtime: st.mtime };
  });

  ipcMain.handle('surface:write', async (event, { path: filePath, content, baseMtime, force } = {}) => {
    const { origin } = await gateOrigin(event);
    const abs = path.resolve(filePath);
    ensurePathGrant(origin, abs);

    let currentMtime = null;
    if (fs.existsSync(abs)) currentMtime = statOf(abs).mtime;

    if (!force && baseMtime != null && currentMtime != null && currentMtime !== baseMtime) {
      const err = new Error(`ConflictError: ${abs} changed on disk since read (base=${baseMtime}, current=${currentMtime})`);
      err.code = 'CONFLICT';
      err.currentMtime = currentMtime;
      err.baseMtime = baseMtime;
      throw err;
    }

    const buf = Buffer.isBuffer(content)
      ? content
      : content instanceof Uint8Array
        ? Buffer.from(content)
        : Buffer.from(String(content ?? ''), 'utf8');

    watch.noteSelfWrite(abs, buf);
    fs.writeFileSync(abs, buf);
    return { mtime: statOf(abs).mtime };
  });

  ipcMain.handle('surface:createFile', async (event, { folderPath, name, content, overwrite } = {}) => {
    const { origin } = await gateOrigin(event);
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('createFile: name must be a non-empty string');
    }
    if (name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
      throw new Error(`createFile: invalid name (single-level only, no separators): ${name}`);
    }
    const absFolder = path.resolve(folderPath);
    const target = path.join(absFolder, name);
    ensurePathGrant(origin, target);

    if (fs.existsSync(target) && overwrite !== true) {
      throw new Error(`EEXIST: file already exists at ${target}`);
    }

    const buf = Buffer.isBuffer(content)
      ? content
      : content instanceof Uint8Array
        ? Buffer.from(content)
        : Buffer.from(String(content ?? ''), 'utf8');

    const tmp = `${target}.tmp.${crypto.randomUUID()}`;
    watch.noteSelfWrite(target, buf);
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, target);
    return { path: target, mtime: statOf(target).mtime };
  });

  ipcMain.handle('surface:createSubfolder', async (event, { folderPath, name } = {}) => {
    const { origin } = await gateOrigin(event);
    validateChildName(name, 'createSubfolder');
    const absFolder = path.resolve(folderPath);
    const target = path.join(absFolder, name);
    ensurePathGrant(origin, target);
    if (fs.existsSync(target)) {
      throw new Error(`EEXIST: path already exists at ${target}`);
    }
    fs.mkdirSync(target);
    return { path: target };
  });

  ipcMain.handle('surface:rename', async (event, { oldPath, newName } = {}) => {
    const { origin } = await gateOrigin(event);
    validateChildName(newName, 'rename');
    const absOld = path.resolve(oldPath);
    ensurePathGrant(origin, absOld);
    if (!fs.existsSync(absOld)) {
      const err = new Error(`ENOENT: no such file or directory at ${absOld}`);
      err.code = 'ENOENT';
      throw err;
    }
    const parent = path.dirname(absOld);
    const absNew = path.join(parent, newName);
    ensurePathGrant(origin, absNew);
    if (absNew === absOld) return { newPath: absNew };
    if (fs.existsSync(absNew)) {
      throw new Error(`EEXIST: path already exists at ${absNew}`);
    }
    fs.renameSync(absOld, absNew);
    return { newPath: absNew };
  });

  ipcMain.handle('surface:delete', async (event, { path: targetPath, recursive } = {}) => {
    const { origin } = await gateOrigin(event);
    const abs = path.resolve(targetPath);
    ensurePathGrant(origin, abs);
    if (!fs.existsSync(abs)) {
      const err = new Error(`ENOENT: no such file or directory at ${abs}`);
      err.code = 'ENOENT';
      throw err;
    }
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      const entries = fs.readdirSync(abs);
      if (entries.length > 0 && recursive !== true) {
        throw new Error(`ENOTEMPTY: directory not empty at ${abs} (pass { recursive: true } to delete anyway)`);
      }
      fs.rmSync(abs, { recursive: true, force: true });
    } else {
      fs.unlinkSync(abs);
    }
    return { ok: true };
  });

  ipcMain.handle('surface:list', async (event, { path: folderPath } = {}) => {
    const { origin } = await gateOrigin(event);
    const abs = path.resolve(folderPath);
    ensurePathGrant(origin, abs);
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    return entries.map((e) => {
      const full = path.join(abs, e.name);
      let st = null;
      try { st = statOf(full); } catch { /* unreadable */ }
      return {
        name: e.name,
        path: full,
        type: e.isDirectory() ? 'folder' : e.isFile() ? 'file' : 'other',
        mtime: st?.mtime ?? null,
        size: st?.size ?? null,
      };
    });
  });

  ipcMain.handle('surface:open', async (event, { path: filePath } = {}) => {
    const { origin } = await gateOrigin(event);
    const abs = path.resolve(filePath);
    ensurePathGrant(origin, abs);
    return describeFile(abs);
  });

  ipcMain.handle('surface:stat', async (event, { path: filePath } = {}) => {
    const { origin } = await gateOrigin(event);
    const abs = path.resolve(filePath);
    ensurePathGrant(origin, abs);
    return statOf(abs);
  });

  ipcMain.handle('surface:watch', async (event, { path: target, mode, id } = {}) => {
    const { origin } = await gateOrigin(event);
    const abs = path.resolve(target);
    ensurePathGrant(origin, abs);
    watch.subscribe({ path: abs, mode, webContents: event.sender, id });
    return { ok: true };
  });

  ipcMain.handle('surface:unwatch', async (event, { id } = {}) => {
    watch.unsubscribe({ webContents: event.sender, id });
    return { ok: true };
  });
}

function attachCleanup(webContents) {
  webContents.on('destroyed', () => watch.unsubscribeAll(webContents));
}

module.exports = { register, attachCleanup };
