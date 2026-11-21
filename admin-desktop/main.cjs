// BachatHub Pakistan - Super Admin Windows app.
// Runs the admin server INSIDE the app (only on 127.0.0.1, never on the network),
// keeps data in the Windows user folder, syncs with the public GitHub repo, and shows
// Windows notifications for scraper alerts. Closing the window keeps it in the tray
// so alerts still arrive; use the tray menu "Quit" to exit.
const path = require('path');
const fs = require('fs');
const http = require('http');
const { app, BrowserWindow, shell, Notification, Tray, Menu, nativeImage, dialog } = require('electron');

const PORT = Number(process.env.BACHATHUB_ADMIN_PORT || 37321);
const ADMIN_URL = `http://127.0.0.1:${PORT}/admin-command`;
let win = null;
let tray = null;
let quitting = false;

// Only one copy may run. A second launch just brings the existing window to the front.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.exit(0);
}

// If the admin server port is already taken (e.g. an older copy still closing), reuse it instead of crashing.
let portBusy = false;
process.on('uncaughtException', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    portBusy = true;
    console.warn('Admin server port already in use - connecting to the running server.');
    return;
  }
  console.error(err);
  try {
    dialog.showErrorBox('BachatHub Admin', String(err && err.stack ? err.stack : err));
  } catch (_) {}
});
app.setAppUserModelId('pk.bachathub.superadmin.desktop');

function startEmbeddedServer() {
  const dataDir = path.join(app.getPath('userData'), 'server-data');
  fs.mkdirSync(dataDir, { recursive: true });
  process.chdir(dataDir); // server keeps its encrypted local files here
  Object.assign(process.env, {
    NODE_ENV: 'production',
    PORT: String(PORT),
    HOST: '127.0.0.1',
    BACHATHUB_DESKTOP: '1',
    BACHATHUB_NO_DEMO: '1',
    BACHATHUB_DIST_DIR: path.join(__dirname, 'web'),
    GITHUB_REPO_OWNER: process.env.GITHUB_REPO_OWNER || 'TheZer0Point',
    GITHUB_REPO_NAME: process.env.GITHUB_REPO_NAME || 'bachathub-pakistan',
    GITHUB_BRANCH: process.env.GITHUB_BRANCH || 'main',
  });
  globalThis.__bachathubNotify = (title, body) => {
    try {
      if (Notification.isSupported()) {
        const n = new Notification({ title, body, icon: path.join(__dirname, 'tray.png') });
        n.on('click', showWindow);
        n.show();
      }
    } catch (e) {
      console.error('notify failed', e);
    }
  };
  require('./server.cjs');
}

function waitForServer(tries = 80) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      http
        .get(`http://127.0.0.1:${PORT}/api/bootstrap`, (res) => {
          res.resume();
          resolve();
        })
        .on('error', () => (n <= 0 ? reject(new Error('Admin server did not start')) : setTimeout(() => attempt(n - 1), 250)));
    };
    attempt(tries);
  });
}

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'BachatHub Pakistan — Super Admin',
    icon: path.join(__dirname, 'tray.png'),
    backgroundColor: '#0F172A',
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  win.loadURL(ADMIN_URL);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
      if (tray && process.platform === 'win32') {
        tray.displayBalloon?.({ title: 'BachatHub Admin', content: 'Still running in the tray for scraper alerts.' });
      }
    }
  });
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'tray.png'));
  tray = new Tray(img);
  tray.setToolTip('BachatHub Super Admin');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Admin', click: showWindow },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } },
    ]),
  );
  tray.on('click', showWindow);
}

app.on('second-instance', showWindow);
app.on('before-quit', () => { quitting = true; });

app.whenReady().then(async () => {
  if (!gotLock) return;
  try {
    startEmbeddedServer();
    await waitForServer();
  } catch (e) {
    dialog.showErrorBox('BachatHub Admin', `Could not start the admin server:\n${e && e.message ? e.message : e}`);
    app.quit();
    return;
  }
  createTray();
  createWindow();
});

app.on('window-all-closed', (e) => {
  // keep running in tray
  if (process.platform !== 'win32' && process.platform !== 'darwin') app.quit();
});
