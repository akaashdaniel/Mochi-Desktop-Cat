const { app, BrowserWindow, screen, systemPreferences, ipcMain } = require('electron');
const { uIOhook } = require('uiohook-napi');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

let win;

if (process.platform === 'darwin') {
  if (!systemPreferences.isTrustedAccessibilityClient(false))
    systemPreferences.isTrustedAccessibilityClient(true);
}

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 120,
    height: 120,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');

  if (process.platform === 'darwin')
    win.setAlwaysOnTop(true, 'screen-saver');

  // Place cat at bottom-center of screen on startup
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  win.setPosition(Math.round(width / 2 - 60), height - 140);

  win.once('ready-to-show', () => {
    win.show();
    startHooks();
  });
});

function startHooks() {

  // ── Send cursor pos relative to cat window every 16ms ──
  setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const pos = screen.getCursorScreenPoint();
    const [wx, wy] = win.getPosition();
    win.webContents.send('cursor-pos', {
      x: pos.x - wx - 60,  // relative to cat center
      y: pos.y - wy - 60
    });
  }, 16);

  // ── Drag IPC ──
  ipcMain.on('move-win', (_, { x, y }) => {
    if (!win || win.isDestroyed()) return;
    win.setPosition(Math.round(x), Math.round(y));
  });

  ipcMain.on('set-clickthrough', (_, val) => {
    if (!win || win.isDestroyed()) return;
    win.setIgnoreMouseEvents(val, { forward: true });
  });
  ipcMain.on('get-win-pos', (event) => {
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  event.reply('win-pos', { x, y });
});

  // ── Keyboard hook ──
  let typingTimeout;
  let idleTimeout;

  uIOhook.on('keydown', () => {
    if (!win || win.isDestroyed()) return;
    win.webContents.send('cat-state', 'typing');
    clearTimeout(typingTimeout);
    clearTimeout(idleTimeout);

    typingTimeout = setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      win.webContents.send('cat-state', 'idle');
      idleTimeout = setTimeout(() => {
        if (!win || win.isDestroyed()) return;
        win.webContents.send('cat-state', 'sleep');
      }, 10000);
    }, 2000);
  });

  uIOhook.start();
}

app.on('before-quit', () => uIOhook.stop());
app.on('window-all-closed', () => app.quit());