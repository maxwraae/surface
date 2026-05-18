const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const handlers = require('./bridge/handlers');
const perms = require('./bridge/permissions');
const defaults = require('./bridge/defaults');
const apps = require('./apps');
const server = require('./server');
const configLoader = require('./config');

const isDaemon = process.argv.includes('--daemon');

function isURL(s) {
  return /^(https?|file):\/\//.test(s);
}

function pathToFileUrl(p) {
  return 'file://' + p.split('/').map(encodeURIComponent).join('/');
}

// CLI argv shape:
//   dev (electron .):  [electronBin, '.', userArg, ...]
//   packaged:          [appBin, userArg, ...]
// First non-flag positional wins. Flags (anything starting with '-') skipped.
function getCliTarget(argv) {
  const start = app.isPackaged ? 1 : 2;
  for (let i = start; i < argv.length; i++) {
    const a = argv[i];
    if (typeof a !== 'string' || a.startsWith('-')) continue;
    return a;
  }
  return null;
}

function resolveTarget(target, cwd) {
  return isURL(target) ? target : path.resolve(cwd, target);
}

// Garbage-collect HTML written by the MCP server's `surface(html)` path.
// The MCP server writes to userData/temp/ when the agent passes raw HTML.
// We delete anything older than 24 hours on every Surface launch. The first
// `surface` call after a long idle period runs this exactly once because of
// the single-instance lock; subsequent calls hit second-instance and skip.
function gcTempDir() {
  const tempDir = path.join(app.getPath('userData'), 'temp');
  if (!fs.existsSync(tempDir)) return;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const entry of fs.readdirSync(tempDir)) {
    const fullPath = path.join(tempDir, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.mtimeMs < cutoff) fs.unlinkSync(fullPath);
    } catch {}
  }
}

function openCliTarget(target) {
  if (isURL(target)) {
    return openWindow(target);
  }
  if (!fs.existsSync(target)) {
    console.error(`surface: file not found: ${target}`);
    return null;
  }
  // Route by extension through the default-app registry — same path as
  // surface:openWindow uses for in-app navigation. The key is resolved
  // via the apps discovery module, which scans user + built-in install dirs.
  const chosen = defaults.get(path.extname(target));
  if (chosen) {
    const appEntry = apps.byKey(chosen);
    if (appEntry) {
      return openWindow(appEntry.entryPath, { openFile: target });
    }
    console.error(`surface: configured app '${chosen}' not found; falling back to raw render`);
  }
  const win = openWindow(pathToFileUrl(target));
  win.setTitle(path.basename(target));
  win.setRepresentedFilename(target);
  return win;
}

function openWindow(target, opts = {}) {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    titleBarStyle: 'default',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isURL(target)) {
    win.loadURL(target);
    win.setTitle(target);
  } else {
    const abs = path.resolve(__dirname, target);
    const loadOpts = {};

    if (opts.openFile) {
      // Pre-grant the target origin + the file path so the page can call
      // window.surface.open(path) without a permission prompt or picker.
      const origin = `file:${abs}`;
      perms.grantOrigin(origin);
      perms.recordPathGrant(origin, path.resolve(opts.openFile), 'file');
      loadOpts.search = `file=${encodeURIComponent(opts.openFile)}`;
    }

    win.loadFile(abs, loadOpts);
    win.setRepresentedFilename(abs);
    win.setTitle(path.basename(abs));
  }

  handlers.attachCleanup(win.webContents);
  return win;
}

function openWelcome() {
  // Bare-launch fallback. `surface` with no target (or double-clicking
  // Surface.app from Finder) shows a small "Surface is running" page.
  // welcome.html ships inside the app bundle, so it works in dev and packaged.
  const welcomePath = path.join(__dirname, 'welcome.html');

  const win = new BrowserWindow({
    width: 720,
    height: 520,
    minWidth: 480,
    minHeight: 360,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 18 },
    backgroundColor: '#fafaf7',
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(welcomePath);
  win.setTitle('Surface');
  handlers.attachCleanup(win.webContents);
  return win;
}

// Allow trusted Surface web apps to summon new windows.
ipcMain.handle('surface:openWindow', async (event, opts = {}) => {
  const senderUrl = event.senderFrame?.url ?? '';
  let originKey = null;
  try {
    const u = new URL(senderUrl);
    originKey = u.protocol === 'file:' ? `file:${u.pathname}` : u.origin;
  } catch {}
  const trusted = perms.isTrustedBundleUrl(senderUrl)
    || (originKey && perms.check(originKey) === 'granted');
  if (!trusted) throw new Error('surface:openWindow requires bridge access');

  if (opts.url) return { ok: true, id: openWindow(opts.url).id };
  if (opts.file) {
    const abs = path.resolve(opts.file);

    // Resolution order: explicit opts.app  >  user default for ext  >
    // built-in default for ext  >  Chromium (the substrate).
    let chosen = opts.app;
    if (chosen === undefined || chosen === null) chosen = defaults.get(path.extname(abs));

    if (chosen && APPS[chosen]) {
      return { ok: true, id: openWindow(APPS[chosen], { openFile: abs }).id };
    }

    const win = openWindow(pathToFileUrl(abs));
    win.setTitle(path.basename(abs));
    win.setRepresentedFilename(abs);
    return { ok: true, id: win.id };
  }
  throw new Error('surface:openWindow requires url or file');
});

// Defaults — read by anyone with bridge access; only the trusted bundle can
// mutate (defaults are a user-preferences concern, not an app concern).
ipcMain.handle('surface:getDefaults', async () => defaults.list());

ipcMain.handle('surface:setDefault', async (event, { ext, app: appName } = {}) => {
  const senderUrl = event.senderFrame?.url ?? '';
  if (!perms.isTrustedBundleUrl(senderUrl)) {
    throw new Error('surface:setDefault restricted to trusted bundle');
  }
  defaults.set(ext, appName);
  return defaults.list();
});

// macOS sends 'open-file' / 'open-url' when:
//  - The user double-clicks a file Surface is registered to handle (.html/.htm).
//  - The user picks Open With → Surface in Finder.
//  - A file is dragged onto the Surface dock icon.
// These events can fire BEFORE whenReady on cold launch — buffer them.
const pendingOpens = [];
let appReady = false;

function handleOpen(target) {
  if (!target) return;
  if (appReady) openCliTarget(target);
  else pendingOpens.push(target);
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  handleOpen(filePath);
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleOpen(url);
});

// Single instance: subsequent `surface <thing>` invocations route through the
// already-running process via the 'second-instance' event, so we get one
// process and many windows instead of one Electron per invocation.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (event, argv, cwd) => {
    const target = getCliTarget(argv);
    if (target) openCliTarget(resolveTarget(target, cwd));
  });

  app.whenReady().then(() => {
    handlers.register();
    gcTempDir();
    appReady = true;

    // Bootstrap the embedded HTTP server so peers (and remote agents) can
    // open windows here via POST /_/open, and remote renderers can fetch
    // files from this machine. See app/server.js for the protocol.
    server.start({ config: configLoader.load(), openCliTarget });

    // Replay any open-file/open-url events that arrived before we were ready.
    const buffered = pendingOpens.splice(0);
    for (const t of buffered) openCliTarget(t);

    const target = getCliTarget(process.argv);
    if (target) {
      openCliTarget(resolveTarget(target, process.cwd()));
    } else if (buffered.length === 0 && !isDaemon) {
      // Bare launch (double-click Surface.app, or `surface` with no args):
      // show the welcome page. Useful as a "Surface is running" indicator;
      // also acts as the visible signal that the app launched successfully.
      // Skipped in --daemon mode so the LaunchAgent boot is silent.
      openWelcome();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWelcome();
  });
}
