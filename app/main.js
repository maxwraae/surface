const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const handlers = require('./bridge/handlers');
const perms = require('./bridge/permissions');
const defaults = require('./bridge/defaults');

// Registry of Surface-shipped web apps. Keys are stable identifiers used by
// callers (and by user defaults); values are file paths relative to app/.
const APPS = {
  doc: '../doc-app/index.html',
};

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

function openCliTarget(target) {
  if (isURL(target)) {
    return openWindow(target);
  }
  if (!fs.existsSync(target)) {
    console.error(`surface: file not found: ${target}`);
    return null;
  }
  // Route by extension through the default-app registry — same path as
  // surface:openWindow uses for in-app navigation.
  const chosen = defaults.get(path.extname(target));
  if (chosen && APPS[chosen]) {
    return openWindow(APPS[chosen], { openFile: target });
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

function openChat() {
  // Dev-fallback only. Bare `surface` (no args) opens the archived chat-app
  // prototype so devs aren't staring at a blank Surface. Real bare-invocation
  // behavior (status window? launcher? nothing?) is a backlog item; once that
  // lands, this whole function and its caller go away.
  const chatPath = path.resolve(__dirname, '../archive/chat-app/index.html');
  const chatOrigin = `file:${chatPath}`;
  perms.grantOrigin(chatOrigin);
  const samplePath = path.resolve(__dirname, '../doc-app/sample.doc.html');
  perms.recordPathGrant(chatOrigin, samplePath, 'file');

  const win = new BrowserWindow({
    width: 1000,
    height: 680,
    minWidth: 720,
    minHeight: 460,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 18 },
    backgroundColor: '#ffffff',
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(chatPath);
  win.setTitle('Chat');
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
    const target = getCliTarget(process.argv);
    if (target) {
      openCliTarget(resolveTarget(target, process.cwd()));
    } else {
      // No arg = dev fallback to the chat-app stand-in. The target shape for
      // bare `surface` (empty window? launcher? nothing?) is still TBD.
      openChat();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openChat();
  });
}
