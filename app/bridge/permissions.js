// Per-origin grant store for the Surface bridge.
//
// Two independent gates that every IPC handler must clear:
//
//   1. Capability — does this origin have the bridge at all? Granted/denied/prompt.
//   2. Path grant — has the user picked this specific file or folder for this origin?
//
// Both are persisted to permissions.json in the app's userData directory.
// Files served from the Surface app bundle (the .app's resources) bypass the
// capability prompt — they're shipped by us, so they're trusted to call the
// bridge. They still need explicit path grants via the picker like everyone else.

const { app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

const PERMISSIONS_FILE = path.join(app.getPath('userData'), 'permissions.json');
const BUNDLE_ROOT = path.resolve(app.getAppPath());

// Surface ships with example/dev web apps living next to the app folder.
// They're trusted like the bundle itself. The archived chat-app stays
// trusted while it's still the bare-invocation fallback.
const TRUSTED_ROOTS = [
  BUNDLE_ROOT,
  path.resolve(BUNDLE_ROOT, '../doc-app'),
  path.resolve(BUNDLE_ROOT, '../archive/chat-app'),
];

let state = { origins: {} };
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    if (fs.existsSync(PERMISSIONS_FILE)) {
      const raw = fs.readFileSync(PERMISSIONS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.origins) state = parsed;
    }
  } catch (err) {
    console.error('[surface] failed to load permissions:', err);
  }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(PERMISSIONS_FILE), { recursive: true });
    fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('[surface] failed to save permissions:', err);
  }
}

function getEntry(origin) {
  load();
  if (!state.origins[origin]) {
    state.origins[origin] = { capability: 'prompt', paths: [] };
  }
  return state.origins[origin];
}

function check(origin) {
  return getEntry(origin).capability;
}

async function prompt(origin, senderUrl, parentWindow) {
  const entry = getEntry(origin);
  if (entry.capability === 'granted' || entry.capability === 'denied') {
    return entry.capability;
  }

  const { response } = await dialog.showMessageBox(parentWindow ?? undefined, {
    type: 'question',
    buttons: ['Allow', 'Deny'],
    defaultId: 0,
    cancelId: 1,
    title: 'Surface — File access',
    message: `Allow ${origin} to read and edit local files?`,
    detail:
      `Requesting page: ${senderUrl}\n\n` +
      'Surface will only expose files you explicitly choose via the picker. ' +
      'You can revoke access later by editing permissions.json.',
  });

  entry.capability = response === 0 ? 'granted' : 'denied';
  save();
  return entry.capability;
}

function grantOrigin(origin) {
  // Pre-grant an origin's capability (used by Surface main process when
  // launching a trusted demo window — bypasses the user-facing prompt).
  const entry = getEntry(origin);
  entry.capability = 'granted';
  save();
}

function recordPathGrant(origin, filePath, mode) {
  const entry = getEntry(origin);
  const abs = path.resolve(filePath);
  const existing = entry.paths.find((g) => g.path === abs);
  if (existing) {
    existing.mode = mode;
    existing.grantedAt = Date.now();
  } else {
    entry.paths.push({ path: abs, mode, grantedAt: Date.now() });
  }
  save();
}

function pathGranted(origin, filePath) {
  const abs = path.resolve(filePath);
  const entry = getEntry(origin);
  return entry.paths.some((g) => {
    if (g.path === abs) return true;
    if (g.mode === 'folder' && abs.startsWith(g.path + path.sep)) return true;
    return false;
  });
}

function isTrustedBundleUrl(senderUrl) {
  if (!senderUrl || !senderUrl.startsWith('file://')) return false;
  try {
    const url = new URL(senderUrl);
    const filePath = decodeURIComponent(url.pathname);
    const abs = path.resolve(filePath);
    return TRUSTED_ROOTS.some(root => abs === root || abs.startsWith(root + path.sep));
  } catch {
    return false;
  }
}

module.exports = {
  check,
  prompt,
  grantOrigin,
  recordPathGrant,
  pathGranted,
  isTrustedBundleUrl,
  PERMISSIONS_FILE,
};
