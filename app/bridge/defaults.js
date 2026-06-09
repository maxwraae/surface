// Per-extension default app mapping.
//
// When the user opens a file without specifying an app, Surface looks the
// extension up here to pick a default. The "floor" comes from the installed
// apps themselves — each app's manifest declares `preferredFor: [...]` and
// is registered automatically at discovery time. User overrides (via
// `set()`) shadow the floor and are persisted to defaults.json in the
// userData directory. When nothing matches at any layer, the file renders
// in plain Chromium.

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const apps = require('../apps');

const DEFAULTS_FILE = path.join(app.getPath('userData'), 'defaults.json');

// `BUILTIN` used to be a hand-written table. It now derives from the apps
// registry — every installed app contributes its `preferredFor` extensions.
// `apps.list()` is internally cached so calling this on every `get()` is
// cheap; if new apps are installed at runtime, call `apps.refresh()` and
// `get()` will see them on next call.
function builtin() {
  const map = {};
  for (const app of apps.list()) {
    for (const ext of app.manifest.preferredFor || []) {
      // First app to claim an extension wins. apps.list() walks user dirs
      // first, so user-installed apps take precedence over built-ins.
      if (!(ext in map)) map[ext] = app.key;
    }
  }
  return map;
}

let state = { extensions: {} };
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    if (fs.existsSync(DEFAULTS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DEFAULTS_FILE, 'utf8'));
      if (parsed && parsed.extensions) state = parsed;
    }
  } catch (err) {
    console.error('[surface] failed to load defaults:', err);
  }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(DEFAULTS_FILE), { recursive: true });
    fs.writeFileSync(DEFAULTS_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('[surface] failed to save defaults:', err);
  }
}

function normalizeExt(ext) {
  if (!ext) return '';
  return (ext.startsWith('.') ? ext : '.' + ext).toLowerCase();
}

function get(ext) {
  load();
  const k = normalizeExt(ext);
  return state.extensions[k] ?? builtin()[k] ?? null;
}

function set(ext, appName) {
  load();
  const k = normalizeExt(ext);
  if (!k) return;
  if (appName === null || appName === undefined || appName === '') {
    delete state.extensions[k];
  } else {
    state.extensions[k] = String(appName);
  }
  save();
}

function list() {
  load();
  // User overrides win over built-ins.
  return { ...builtin(), ...state.extensions };
}

// Resolve which app (if any) should render a given file.
//
// For HTML files: peeks the first 4 KB and honors a self-declared marker
// (`<meta name="surface" content="<app-key>">`), with the legacy `<doc>` body
// element as an implicit fallback for files written by the old doc app.
//
// For everything else: falls through to extension-based routing (user
// override → app-registry floor).
//
// Returns:
//   { app: '<key>', source: 'meta' | 'doc-element' | 'override' | 'ext' }
//   { app: null,    source: 'raw' | 'marker-raw' | 'unknown-app' }
//
// `source: 'unknown-app'` means the file asked for an app that isn't
// installed; caller should render raw. `source: 'marker-raw'` means the
// file explicitly asked for raw (empty `content` or `content="raw"`).
const PEEK_BYTES = 4096;
const META_RE = /<meta\b[^>]*\bname\s*=\s*["']surface["'][^>]*>/i;
const META_CONTENT_RE = /\bcontent\s*=\s*["']([^"']*)["']/i;
const DOC_RE = /<doc\b/i;

function resolveAppForFile(absPath) {
  const ext = path.extname(absPath || '').toLowerCase();

  if (ext === '.html' || ext === '.htm') {
    let head = '';
    try {
      const fd = fs.openSync(absPath, 'r');
      try {
        const buf = Buffer.alloc(PEEK_BYTES);
        const n = fs.readSync(fd, buf, 0, PEEK_BYTES, 0);
        head = buf.slice(0, n).toString('utf8');
      } finally {
        fs.closeSync(fd);
      }
    } catch (err) {
      // File unreadable — fall through to extension-based routing.
      head = '';
    }

    const metaMatch = head.match(META_RE);
    if (metaMatch) {
      const cm = metaMatch[0].match(META_CONTENT_RE);
      const content = cm ? cm[1].trim().toLowerCase() : '';
      if (!content || content === 'raw') {
        return { app: null, source: 'marker-raw' };
      }
      // Verify the requested app actually exists.
      if (apps.byKey(content)) {
        return { app: content, source: 'meta' };
      }
      return { app: null, source: 'unknown-app' };
    }

    if (DOC_RE.test(head)) {
      // Legacy: files written by the old doc app wrap content in `<doc>`.
      // Only honor if the doc app is actually installed.
      if (apps.byKey('doc')) return { app: 'doc', source: 'doc-element' };
    }

    // No marker — fall through to extension-based routing below.
  }

  const appKey = get(ext);
  if (appKey) {
    const src = state.extensions[ext] ? 'override' : 'ext';
    return { app: appKey, source: src };
  }
  return { app: null, source: 'raw' };
}

module.exports = { get, set, list, resolveAppForFile, DEFAULTS_FILE };
