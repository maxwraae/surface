const { app, BrowserWindow, WebContentsView, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const handlers = require('./bridge/handlers');
const perms = require('./bridge/permissions');
const defaults = require('./bridge/defaults');
const apps = require('./apps');
const server = require('./server');
const configLoader = require('./config');

const mcpSetup = require('./mcp-setup');

const INLINE_EDIT_SCRIPT = fs.readFileSync(path.join(__dirname, 'inline-edit.js'), 'utf8');

function isFirstLaunch() {
  return !fs.existsSync(path.join(app.getPath('userData'), '.onboarded'));
}

function markOnboarded() {
  const p = path.join(app.getPath('userData'), '.onboarded');
  if (!fs.existsSync(p)) fs.writeFileSync(p, '', 'utf8');
}

function isURL(s) {
  return /^(https?|file):\/\//.test(s);
}

// The CLI hands us `?file=<file-url>` where the file-url is
// `http://<self>:<port>/<abs-path>` (the daemon's file-serving endpoint).
// To record a path grant we need the bare absolute filesystem path.
function extractAbsPathFromFileParam(fileParam) {
  if (!fileParam) return null;
  try {
    const u = new URL(fileParam);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      return decodeURIComponent(u.pathname);
    }
    if (u.protocol === 'file:') {
      return decodeURIComponent(u.pathname);
    }
  } catch {
    // Not a URL — could be a bare path. Use as-is.
    if (fileParam.startsWith('/')) return fileParam;
  }
  return null;
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

// ---------------------------------------------------------------------------
// Window views: every content window has a toolbar + content WebContentsView.
// ---------------------------------------------------------------------------

const TOOLBAR_HEIGHT = 38;
const windowViews = new Map(); // win.id → { toolbar: WebContentsView, content: WebContentsView }

function parentWindowFor(wc) {
  for (const [winId, views] of windowViews) {
    if (views.content.webContents === wc || views.toolbar.webContents === wc) {
      return BrowserWindow.fromId(winId);
    }
  }
  return BrowserWindow.fromWebContents(wc);
}

function contentOf(win) {
  const v = windowViews.get(win.id);
  return v ? v.content.webContents : win.webContents;
}

function cleanDisplayUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'file:') return decodeURIComponent(u.pathname);
    if (u.hostname === 'localhost') return decodeURIComponent(u.pathname);
    return url;
  } catch {
    return url;
  }
}

function resolveNavInput(input) {
  input = input.trim();
  if (/^https?:\/\//.test(input)) return input;
  if (/^file:\/\//.test(input)) return input;
  if (input.startsWith('/')) return 'file://' + input;
  if (/^[^\s]+\.[^\s]+$/.test(input)) return 'https://' + input;
  return 'https://www.google.com/search?q=' + encodeURIComponent(input);
}

// Look up a hosted Surface app whose URL entryPoint shares this URL's origin.
// Lets `/_/open` (which only sees a URL string) recover the manifest so the
// origin can be auto-registered before loadURL.
function findHostedAppForUrl(target) {
  let originKey;
  try { originKey = new URL(target).origin; } catch { return null; }
  for (const app of apps.list()) {
    if (!app.entry || app.entry.kind !== 'url') continue;
    try {
      if (new URL(app.entry.url).origin === originKey) return app;
    } catch {}
  }
  return null;
}

function openCliTarget(target) {
  if (isURL(target)) {
    // If this URL belongs to a hosted Surface app, route through the app
    // entry so we get manifest-driven registerApp + path-grant wiring. The
    // CLI emits `<entry>?file=<file-url>`; we forward that intact.
    const hostedApp = findHostedAppForUrl(target);
    if (hostedApp) {
      let fileParam = null;
      try { fileParam = new URL(target).searchParams.get('file'); } catch {}
      // Pass the full target as the entry URL so any query the CLI tacked
      // on (i.e. `?file=…`) is preserved verbatim — the hosted page
      // expects the file URL exactly as built.
      return openWindow({ kind: 'url', url: target }, {
        manifest: hostedApp.manifest,
        // Record a path grant for the underlying file so the hosted page
        // can call window.surface APIs on it. We don't want openWindow
        // to rewrite the URL's ?file= — only to record the grant. The
        // `preserveUrl` flag asks for exactly that.
        recordFilePath: extractAbsPathFromFileParam(fileParam),
        preserveUrl: true,
      });
    }
    const rawPath = extractAbsPathFromFileParam(target);
    const win = openWindow(target, rawPath ? { recordFilePath: rawPath } : {});
    if (rawPath && /\.html?$/i.test(rawPath)) {
      const wc = contentOf(win);
      wc.on('did-finish-load', () => {
        wc.executeJavaScript(INLINE_EDIT_SCRIPT).catch(() => {});
      });
    }
    return win;
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
      return openWindow(appEntry.entry || appEntry.entryPath, {
        openFile: target,
        manifest: appEntry.manifest,
      });
    }
    console.error(`surface: configured app '${chosen}' not found; falling back to raw render`);
  }
  const win = openWindow(pathToFileUrl(target), { recordFilePath: target });
  win.setTitle(path.basename(target));
  win.setRepresentedFilename(target);
  if (/\.html?$/i.test(target)) {
    const wc = contentOf(win);
    wc.on('did-finish-load', () => {
      wc.executeJavaScript(INLINE_EDIT_SCRIPT).catch(() => {});
    });
  }
  return win;
}

// openWindow accepts three shapes for `target`:
//   - { kind: 'file', path, url } — the structured form from apps.resolveEntryPoint
//   - { kind: 'url',  url }       — same, for hosted apps
//   - string — legacy: either an absolute URL or a path. Classified here.
function openWindow(target, opts = {}) {
  let entry;
  if (typeof target === 'string') {
    entry = isURL(target)
      ? { kind: 'url', url: target }
      : { kind: 'file', path: path.resolve(__dirname, target) };
  } else {
    entry = target;
  }

  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    titleBarStyle: 'default',
    backgroundColor: '#ffffff',
  });

  const toolbar = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'toolbar-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const content = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const [w, h] = win.getContentSize();
  toolbar.setBounds({ x: 0, y: 0, width: w, height: TOOLBAR_HEIGHT });
  content.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width: w, height: h - TOOLBAR_HEIGHT });
  win.contentView.addChildView(toolbar);
  win.contentView.addChildView(content);

  windowViews.set(win.id, { toolbar, content });
  win.on('closed', () => windowViews.delete(win.id));

  win.on('resize', () => {
    const [rw, rh] = win.getContentSize();
    toolbar.setBounds({ x: 0, y: 0, width: rw, height: TOOLBAR_HEIGHT });
    content.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width: rw, height: rh - TOOLBAR_HEIGHT });
  });

  toolbar.webContents.loadFile(path.join(__dirname, 'toolbar.html'));

  const pushNavState = () => {
    if (toolbar.webContents.isDestroyed()) return;
    toolbar.webContents.send('nav:state', {
      url: content.webContents.getURL(),
      displayUrl: win.representedFilename || cleanDisplayUrl(content.webContents.getURL()),
      canGoBack: content.webContents.canGoBack(),
      canGoForward: content.webContents.canGoForward(),
    });
  };
  content.webContents.on('did-navigate', pushNavState);
  content.webContents.on('did-navigate-in-page', pushNavState);
  toolbar.webContents.on('did-finish-load', pushNavState);

  if (entry.kind === 'url') {
    const url = new URL(entry.url);
    const origin = url.protocol === 'file:' ? `file:${decodeURIComponent(url.pathname)}` : url.origin;

    if (opts.manifest && opts.manifest.name && url.protocol !== 'file:') {
      perms.registerApp({ appId: opts.manifest.name, origins: [origin] });
    }
    perms.grantOrigin(origin);

    const grantedPath = opts.openFile
      ? path.resolve(opts.openFile)
      : (opts.recordFilePath ? path.resolve(opts.recordFilePath) : null);

    if (grantedPath) {
      perms.recordPathGrant(origin, grantedPath, 'file');
    }

    if (opts.preserveUrl) {
      content.webContents.loadURL(entry.url);
    } else if (opts.openFile) {
      const u = new URL(entry.url);
      u.searchParams.set('file', opts.openFile);
      content.webContents.loadURL(u.toString());
    } else {
      content.webContents.loadURL(entry.url);
    }
    win.setTitle(opts.manifest?.name ? `${opts.manifest.name} — ${grantedPath ? path.basename(grantedPath) : entry.url}` : entry.url);
    if (grantedPath) win.setRepresentedFilename(grantedPath);
  } else {
    const abs = entry.path;
    const loadOpts = {};

    if (opts.openFile) {
      const origin = `file:${abs}`;
      perms.grantOrigin(origin);
      perms.recordPathGrant(origin, path.resolve(opts.openFile), 'file');
      loadOpts.search = `file=${encodeURIComponent(opts.openFile)}`;
    }

    content.webContents.loadFile(abs, loadOpts);
    win.setRepresentedFilename(abs);
    win.setTitle(path.basename(abs));
  }

  handlers.attachCleanup(content.webContents);
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

// --- Onboarding IPC ----------------------------------------------------------

ipcMain.handle('surface:detectAgents', async () => mcpSetup.detectHosts());

ipcMain.handle('surface:connectAgent', async (event, { key }) => mcpSetup.applyHost(key));

ipcMain.handle('surface:setLoginItem', async (event, { enabled }) => {
  app.setLoginItemSettings({ openAtLogin: enabled });
  return { openAtLogin: app.getLoginItemSettings().openAtLogin };
});

ipcMain.handle('surface:getLoginItem', async () => {
  return { openAtLogin: app.getLoginItemSettings().openAtLogin };
});

ipcMain.handle('surface:completeOnboarding', async (event) => {
  markOnboarded();
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
  return { ok: true };
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
    handlers.register({ windowLookup: parentWindowFor });
    gcTempDir();
    appReady = true;

    // Navigation IPC — toolbar → main → content
    ipcMain.handle('nav:back', (event) => {
      const win = parentWindowFor(event.sender);
      if (win) contentOf(win).goBack();
    });
    ipcMain.handle('nav:forward', (event) => {
      const win = parentWindowFor(event.sender);
      if (win) contentOf(win).goForward();
    });
    ipcMain.handle('nav:reload', (event) => {
      const win = parentWindowFor(event.sender);
      if (win) contentOf(win).reload();
    });
    ipcMain.handle('nav:go', (event, input) => {
      const win = parentWindowFor(event.sender);
      if (win) contentOf(win).loadURL(resolveNavInput(input));
    });

    // Application menu with standard shortcuts
    const menuTemplate = [
      { role: 'appMenu' },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          {
            label: 'Back',
            accelerator: 'CmdOrCtrl+[',
            click: (_, win) => { if (win) contentOf(win).goBack(); },
          },
          {
            label: 'Forward',
            accelerator: 'CmdOrCtrl+]',
            click: (_, win) => { if (win) contentOf(win).goForward(); },
          },
          { type: 'separator' },
          {
            label: 'Reload',
            accelerator: 'CmdOrCtrl+R',
            click: (_, win) => { if (win) contentOf(win).reload(); },
          },
          {
            label: 'Focus Address Bar',
            accelerator: 'CmdOrCtrl+L',
            click: (_, win) => {
              if (!win) return;
              const views = windowViews.get(win.id);
              if (views) views.toolbar.webContents.send('nav:focus');
            },
          },
          { type: 'separator' },
          {
            label: 'Toggle Developer Tools',
            accelerator: 'CmdOrCtrl+Shift+I',
            click: (_, win) => {
              if (!win) return;
              const wc = contentOf(win);
              if (wc.isDevToolsOpened()) wc.closeDevTools();
              else wc.openDevTools();
            },
          },
        ],
      },
      { role: 'windowMenu' },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

    // Bootstrap the embedded HTTP server so peers (and remote agents) can
    // open windows here via POST /_/open, and remote renderers can fetch
    // files from this machine. See app/server.js for the protocol.
    const cfg = configLoader.load();
    const builtinAppsDir = path.resolve(__dirname, '..', 'apps');
    if (!cfg.rootsExposed.includes(builtinAppsDir)) {
      cfg.rootsExposed.push(builtinAppsDir);
    }
    server.start({ config: cfg, openCliTarget, windowViews });

    // Replay any open-file/open-url events that arrived before we were ready.
    const buffered = pendingOpens.splice(0);
    for (const t of buffered) openCliTarget(t);

    const target = getCliTarget(process.argv);
    if (target) {
      openCliTarget(resolveTarget(target, process.cwd()));
    } else if (buffered.length === 0 && isFirstLaunch()) {
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
