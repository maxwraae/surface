// App discovery. Surface has a viewer ecosystem — each viewer is a folder
// with a `surface-app.json` manifest and an entry HTML page. This module
// scans three locations at startup, reads every manifest, and exposes the
// merged registry.
//
// Install dirs, user wins over built-in:
//
//   1. ~/.surface/apps/<key>/                                   (user, XDG-style)
//   2. ~/Library/Application Support/surface/apps/<key>/        (user, macOS)
//   3. <surface-repo>/apps/<key>/                               (built-in)
//
// A folder is "an app" iff it contains `surface-app.json`. Anything else is
// skipped.
//
// Manifest schema (validated lightly):
//
//   {
//     "name":          "sheet",                     // app key (must match folder name)
//     "description":   "Spreadsheet viewer",
//     "version":       "0.1.0",
//     "entryPoint":    "index.html",
//     "extensions":    [".xlsx", ".csv"],           // what it can handle
//     "preferredFor":  [".xlsx", ".csv"],           // what it's the default for
//     "capabilities":  { "view": true, "edit": true }
//   }
//
// `name` must match the folder name; mismatches are skipped with a warning.
// `entryPoint` defaults to "index.html".
//
// Reserved keys: `raw` is not a real app — it's the magic --app=raw CLI
// override that means "bypass viewer routing, raw render in Chromium."
// Don't create an app named `raw`.

const fs = require('fs');
const os = require('os');
const path = require('path');

const RESERVED_KEYS = new Set(['raw']);

function installDirs() {
  // Built-in dir lives at <repo>/apps relative to the running app/ dir.
  const builtinDir = path.resolve(__dirname, '..', 'apps');
  return [
    { dir: path.join(os.homedir(), '.surface', 'apps'), tier: 'user' },
    { dir: path.join(os.homedir(), 'Library', 'Application Support', 'surface', 'apps'), tier: 'user' },
    { dir: builtinDir, tier: 'builtin' },
  ];
}

function readManifest(appDir) {
  const manifestPath = path.join(appDir, 'surface-app.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const m = JSON.parse(raw);
    if (typeof m.name !== 'string' || !m.name) return null;
    if (RESERVED_KEYS.has(m.name)) {
      console.error(`[surface apps] skipping app at ${appDir}: name '${m.name}' is reserved`);
      return null;
    }
    if (m.name !== path.basename(appDir)) {
      console.error(`[surface apps] skipping app at ${appDir}: manifest name '${m.name}' must match folder name '${path.basename(appDir)}'`);
      return null;
    }
    return {
      name: m.name,
      description: m.description || '',
      version: m.version || '0.0.0',
      entryPoint: m.entryPoint || 'index.html',
      extensions: Array.isArray(m.extensions) ? m.extensions.map(normalizeExt) : [],
      preferredFor: Array.isArray(m.preferredFor) ? m.preferredFor.map(normalizeExt) : [],
      capabilities: m.capabilities || { view: true, edit: false },
      author: m.author || '',
    };
  } catch (err) {
    console.error(`[surface apps] bad manifest at ${manifestPath}: ${err.message}`);
    return null;
  }
}

function normalizeExt(ext) {
  if (typeof ext !== 'string') return '';
  return ext.startsWith('.') ? ext.toLowerCase() : '.' + ext.toLowerCase();
}

let cache = null;

function scan() {
  const registry = new Map();
  for (const { dir, tier } of installDirs()) {
    if (!fs.existsSync(dir)) continue;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const appDir = path.join(dir, entry.name);
      const manifest = readManifest(appDir);
      if (!manifest) continue;
      // User tier wins over built-in — only set if not already there.
      if (registry.has(manifest.name)) continue;
      registry.set(manifest.name, {
        key: manifest.name,
        path: appDir,
        entryPath: path.join(appDir, manifest.entryPoint),
        tier,
        manifest,
      });
    }
  }
  cache = registry;
  return registry;
}

function ensureLoaded() {
  if (!cache) scan();
  return cache;
}

function refresh() {
  scan();
}

function list() {
  return Array.from(ensureLoaded().values());
}

function byKey(key) {
  return ensureLoaded().get(key) || null;
}

function byExt(ext) {
  const normalized = normalizeExt(ext);
  if (!normalized) return null;
  // Walk registry; user-tier entries were inserted first so they take precedence
  // among apps claiming the same preferredFor extension.
  for (const app of ensureLoaded().values()) {
    if (app.manifest.preferredFor.includes(normalized)) return app;
  }
  return null;
}

function appDirs() {
  return list().map((a) => a.path);
}

module.exports = { list, byKey, byExt, refresh, appDirs };
