// Per-extension default app mapping.
//
// When the user opens a file without specifying an app, Surface looks the
// extension up here to pick a default. The built-in mapping ships with the
// app (currently .html → doc). User overrides are persisted to defaults.json
// in the userData directory. The fallback when nothing matches is Chromium
// rendering the file natively.

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS_FILE = path.join(app.getPath('userData'), 'defaults.json');

// No built-in extension defaults. .html opens in plain Chromium (the
// renderer it was designed for) — the doc-app is an EXAMPLE app, not the
// default editor. Users can opt in via surface:setDefault if they want
// .html → doc routing back. Future: editing is a deliberate action, not
// implicit on open.
const BUILTIN = {};

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
  return state.extensions[k] ?? BUILTIN[k] ?? null;
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
  return { ...BUILTIN, ...state.extensions };
}

module.exports = { get, set, list, DEFAULTS_FILE };
