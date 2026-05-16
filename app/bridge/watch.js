// File/folder watching for the Surface bridge.
//
// One chokidar watcher per directory; subscriptions can be file-level (exact path)
// or folder-level (any direct child). When a watcher fires, we read the new content,
// hash it (SHA-1), and check it against a ring buffer of recent self-write hashes
// to set the byMe flag — robust against rapid edits and slow disks.

const chokidar = require('chokidar');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SELF_WRITE_TTL_MS = 10_000;

const watchers = new Map();         // dir -> { watcher, subs: Set<sub> }
const recentSelfWrites = new Map(); // abs path -> Set<sha1 hex>

function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

function noteSelfWrite(filePath, content) {
  const abs = path.resolve(filePath);
  const hash = sha1(content);
  if (!recentSelfWrites.has(abs)) recentSelfWrites.set(abs, new Set());
  recentSelfWrites.get(abs).add(hash);
  setTimeout(() => {
    const set = recentSelfWrites.get(abs);
    if (set) {
      set.delete(hash);
      if (set.size === 0) recentSelfWrites.delete(abs);
    }
  }, SELF_WRITE_TTL_MS);
}

function isByMe(filePath, content) {
  const set = recentSelfWrites.get(path.resolve(filePath));
  return set ? set.has(sha1(content)) : false;
}

function ensureWatcher(dir) {
  if (watchers.has(dir)) return watchers.get(dir);

  const watcher = chokidar.watch(dir, {
    ignoreInitial: true,
    depth: 0,
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 25 },
  });

  const subs = new Set();
  const entry = { watcher, subs };

  const dispatch = (type) => (filePath) => {
    const abs = path.resolve(filePath);
    let content = null;
    let mtimeMs = null;

    if (type !== 'unlink') {
      try {
        content = fs.readFileSync(abs);
        const st = fs.statSync(abs, { bigint: true });
        mtimeMs = Number(st.mtimeNs / 1_000_000n);
      } catch {
        // Racy with delete; fall through with content=null.
      }
    }

    const byMe = content ? isByMe(abs, content) : false;

    for (const sub of [...subs]) {
      if (sub.webContents.isDestroyed()) {
        subs.delete(sub);
        continue;
      }
      const matchesFile = sub.mode === 'file' && sub.path === abs;
      const matchesFolder = sub.mode === 'folder' && path.dirname(abs) === sub.path;
      if (!matchesFile && !matchesFolder) continue;

      sub.webContents.send('surface:watch-event', {
        subscriptionId: sub.id,
        type,
        path: abs,
        name: path.basename(abs),
        mtime: mtimeMs,
        byMe,
      });
    }
  };

  watcher.on('change', dispatch('change'));
  watcher.on('add', dispatch('add'));
  watcher.on('unlink', dispatch('unlink'));
  watcher.on('error', (err) => console.error('[surface] watch error:', err));

  watchers.set(dir, entry);
  return entry;
}

function subscribe({ path: target, mode, webContents, id }) {
  const abs = path.resolve(target);
  const dir = mode === 'folder' ? abs : path.dirname(abs);
  const entry = ensureWatcher(dir);
  entry.subs.add({ path: abs, mode, webContents, id });
}

function unsubscribe({ webContents, id }) {
  for (const [dir, entry] of watchers.entries()) {
    for (const sub of [...entry.subs]) {
      if (sub.webContents === webContents && sub.id === id) entry.subs.delete(sub);
    }
    if (entry.subs.size === 0) {
      entry.watcher.close().catch(() => {});
      watchers.delete(dir);
    }
  }
}

function unsubscribeAll(webContents) {
  for (const [dir, entry] of watchers.entries()) {
    for (const sub of [...entry.subs]) {
      if (sub.webContents === webContents) entry.subs.delete(sub);
    }
    if (entry.subs.size === 0) {
      entry.watcher.close().catch(() => {});
      watchers.delete(dir);
    }
  }
}

module.exports = { subscribe, unsubscribe, unsubscribeAll, noteSelfWrite, sha1 };
