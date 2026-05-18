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

module.exports = { get, set, list, DEFAULTS_FILE };
