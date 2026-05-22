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
//
// App identity (app-scoped grants)
// --------------------------------
// A renderer URL is brittle: when an app is packaged, the dev path
// (file:/Users/me/foo/out/renderer/index.html) becomes the bundle path
// (file:/Applications/Foo.app/Contents/Resources/app/out/renderer/index.html),
// and any persisted origin-keyed grants are orphaned. To fix that without
// breaking the legacy origin-keyed model, a host can call `registerApp` at
// boot to declare an `appId` and the set of origins that belong to it. Path
// grants are then stored per-appId and looked up via origin → appId. Origins
// that never register an appId continue to use the legacy origin table
// exactly as before.

const { app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const apps = require('../apps');

const PERMISSIONS_FILE = path.join(app.getPath('userData'), 'permissions.json');
const BUNDLE_ROOT = path.resolve(app.getAppPath());

// Trusted roots = the app bundle + every installed Surface app (built-in
// and user). Computed lazily because apps.list() depends on filesystem
// state that may change at runtime; the cost of a fresh call is negligible.
function trustedRoots() {
  return [BUNDLE_ROOT, ...apps.appDirs()];
}

// Persisted state. Two top-level keys:
//   - origins: legacy origin-keyed grants. Untouched by app identity.
//   - apps:    app-keyed grants, added by registerApp. Purely additive.
let state = { origins: {}, apps: {} };
let loaded = false;

// In-memory origin → appId index, rebuilt from `state.apps` on load and on
// every registerApp call. Not persisted (it's derivable from state.apps).
const originToAppId = new Map();

function rebuildOriginIndex() {
  originToAppId.clear();
  for (const [appId, entry] of Object.entries(state.apps || {})) {
    for (const origin of entry.origins || []) {
      originToAppId.set(origin, appId);
    }
  }
}

function load() {
  if (loaded) return;
  loaded = true;
  try {
    if (fs.existsSync(PERMISSIONS_FILE)) {
      const raw = fs.readFileSync(PERMISSIONS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        state = {
          origins: parsed.origins && typeof parsed.origins === 'object' ? parsed.origins : {},
          apps: parsed.apps && typeof parsed.apps === 'object' ? parsed.apps : {},
        };
      }
    }
  } catch (err) {
    console.error('[surface] failed to load permissions:', err);
  }
  rebuildOriginIndex();
}

function save() {
  // Atomic save: write to a sibling .tmp file then rename. Avoids
  // half-written JSON if the process dies mid-write.
  try {
    fs.mkdirSync(path.dirname(PERMISSIONS_FILE), { recursive: true });
    const tmp = `${PERMISSIONS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, PERMISSIONS_FILE);
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

function getAppEntry(appId) {
  load();
  if (!state.apps[appId]) {
    state.apps[appId] = { origins: [], paths: [] };
  }
  return state.apps[appId];
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
  // If the origin is already part of a registered app, the app identity
  // itself serves as the grant; this becomes a no-op so we don't
  // accidentally seed legacy origin-keyed state for a registered origin.
  load();
  if (originToAppId.has(origin)) return;
  const entry = getEntry(origin);
  entry.capability = 'granted';
  save();
}

function recordPathGrant(origin, filePath, mode) {
  load();
  const abs = path.resolve(filePath);
  const appId = originToAppId.get(origin);
  if (appId) {
    const appEntry = getAppEntry(appId);
    const existing = appEntry.paths.find((g) => g.path === abs);
    if (existing) {
      existing.mode = mode;
      existing.grantedAt = Date.now();
    } else {
      appEntry.paths.push({ path: abs, mode, grantedAt: Date.now() });
    }
    save();
    return;
  }
  const entry = getEntry(origin);
  const existing = entry.paths.find((g) => g.path === abs);
  if (existing) {
    existing.mode = mode;
    existing.grantedAt = Date.now();
  } else {
    entry.paths.push({ path: abs, mode, grantedAt: Date.now() });
  }
  save();
}

function pathInPaths(paths, abs) {
  return paths.some((g) => {
    if (g.path === abs) return true;
    if (g.mode === 'folder' && abs.startsWith(g.path + path.sep)) return true;
    return false;
  });
}

function pathGranted(origin, filePath) {
  load();
  const abs = path.resolve(filePath);

  // 1. App-scoped grant: if the origin is mapped to an appId, the path
  //    counts as granted if any of the app's recorded paths covers it.
  const appId = originToAppId.get(origin);
  if (appId) {
    const appEntry = state.apps[appId];
    if (appEntry && pathInPaths(appEntry.paths || [], abs)) return true;
  }

  // 2. Legacy origin-keyed grant. Always consulted as a fallback so an
  //    origin that has registered an appId can still honor previously
  //    recorded origin-keyed grants. (No silent migration — origin-keyed
  //    grants stay where they were recorded.)
  const entry = getEntry(origin);
  if (pathInPaths(entry.paths, abs)) return true;

  return false;
}

function isTrustedBundleUrl(senderUrl) {
  if (!senderUrl || !senderUrl.startsWith('file://')) return false;
  try {
    const url = new URL(senderUrl);
    const filePath = decodeURIComponent(url.pathname);
    const abs = path.resolve(filePath);
    return trustedRoots().some(root => abs === root || abs.startsWith(root + path.sep));
  } catch {
    return false;
  }
}

// registerApp({ appId, origins })
//
// Declare an app identity. After this call, any of the listed origins is
// mapped to `appId` for permission lookups; path grants recorded by those
// origins go into the app's grant store, and lookups consult the app's
// stored paths before falling back to legacy origin-keyed grants.
//
// Host-process-only. There is intentionally no IPC variant — an arbitrary
// renderer must not be able to claim it belongs to the host's app and
// gain access to that app's previously granted folders.
//
// Idempotent: calling with the same appId merges origins (the union). The
// existing path list is preserved across calls.
function registerApp({ appId, origins } = {}) {
  if (typeof appId !== 'string' || appId.length === 0) {
    throw new Error('registerApp: appId must be a non-empty string');
  }
  if (!Array.isArray(origins)) {
    throw new Error('registerApp: origins must be an array');
  }
  load();
  const entry = getAppEntry(appId);
  const merged = new Set(entry.origins);
  for (const o of origins) {
    if (typeof o === 'string' && o.length > 0) merged.add(o);
  }
  entry.origins = Array.from(merged);
  if (!Array.isArray(entry.paths)) entry.paths = [];
  rebuildOriginIndex();
  save();
}

// Optional helper for consumers who want to bring previously persisted
// origin-keyed grants under an appId (e.g. one-shot migration on first run
// of a packaged build). Copies every path grant from each named origin's
// legacy entry into the app's path list, deduplicated by absolute path.
// Leaves the legacy entries in place — caller can prune later if desired.
function addOriginGrantsToApp(appId, origins) {
  if (typeof appId !== 'string' || appId.length === 0) {
    throw new Error('addOriginGrantsToApp: appId must be a non-empty string');
  }
  if (!Array.isArray(origins)) {
    throw new Error('addOriginGrantsToApp: origins must be an array');
  }
  load();
  const appEntry = getAppEntry(appId);
  const seen = new Set(appEntry.paths.map((p) => p.path));
  let added = 0;
  for (const origin of origins) {
    const legacy = state.origins[origin];
    if (!legacy || !Array.isArray(legacy.paths)) continue;
    for (const g of legacy.paths) {
      if (seen.has(g.path)) continue;
      appEntry.paths.push({ path: g.path, mode: g.mode, grantedAt: g.grantedAt ?? Date.now() });
      seen.add(g.path);
      added += 1;
    }
  }
  if (added > 0) save();
  return added;
}

module.exports = {
  check,
  prompt,
  grantOrigin,
  recordPathGrant,
  pathGranted,
  isTrustedBundleUrl,
  registerApp,
  addOriginGrantsToApp,
  PERMISSIONS_FILE,
};
