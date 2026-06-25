const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const os = require('os');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const http = require('http');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

let mainWindow;

function getUpdateStatePath() {
  return path.join(app.getPath('userData'), 'update-state.json');
}

function getUpdateState() {
  try {
    return JSON.parse(fs.readFileSync(getUpdateStatePath(), 'utf-8'));
  } catch {
    return { version: null, dismissCount: 0 };
  }
}

function saveUpdateState(state) {
  fs.writeFileSync(getUpdateStatePath(), JSON.stringify(state, null, 2), 'utf-8');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    title: 'Local Intelligence Vault',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: false
    }
  });

  mainWindow.loadFile('src/index.html');
  Menu.setApplicationMenu(null);
}

ipcMain.handle('open-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Dokumente', extensions: ['pdf', 'txt', 'md'] }
    ]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths.map(filePath => {
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase().replace('.', '');
      const mimeMap = { pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown' };
      return {
        name: path.basename(filePath),
        data: buffer.toString('base64'),
        mimeType: mimeMap[ext] || 'text/plain'
      };
    });
  }
  return [];
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('get-system-stats', () => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = os.cpus();
  return {
    ram: {
      total: Math.round(totalMem / 1024 / 1024 / 1024 * 10) / 10,
      used: Math.round(usedMem / 1024 / 1024 / 1024 * 10) / 10,
      percent: Math.round((usedMem / totalMem) * 100)
    },
    cpu: { model: cpus[0].model.trim(), cores: cpus.length },
    app: { memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) }
  };
});

ipcMain.handle('dismiss-update', (event, version) => {
  const state = getUpdateState();
  if (state.version !== version) {
    state.version = version;
    state.dismissCount = 0;
  }
  state.dismissCount++;
  saveUpdateState(state);
  return { dismissCount: state.dismissCount };
});

ipcMain.handle('start-download', async () => {
  try {
    await autoUpdater.downloadUpdate();
  } catch (e) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-error');
    }
  }
});

ipcMain.handle('check-for-updates', () => {
  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) { settled = true; cleanup(); resolve({ updateAvailable: false, currentVersion: app.getVersion(), timeout: true }); }
    }, 30000);

    const onAvailable = (info) => { if (!settled) { settled = true; clearTimeout(timeout); cleanup(); resolve({ updateAvailable: true, version: info.version, currentVersion: app.getVersion() }); } };
    const onNotAvailable = () => { if (!settled) { settled = true; clearTimeout(timeout); cleanup(); resolve({ updateAvailable: false, currentVersion: app.getVersion() }); } };
    const onError = (err) => { if (!settled) { settled = true; clearTimeout(timeout); cleanup(); resolve({ updateAvailable: false, currentVersion: app.getVersion(), error: err.message }); } };
    const cleanup = () => {
      autoUpdater.removeListener('update-available', onAvailable);
      autoUpdater.removeListener('update-not-available', onNotAvailable);
      autoUpdater.removeListener('error', onError);
    };

    autoUpdater.once('update-available', onAvailable);
    autoUpdater.once('update-not-available', onNotAvailable);
    autoUpdater.once('error', onError);
    autoUpdater.checkForUpdates().catch(() => {});
  });
});

ipcMain.handle('quit-app', () => app.quit());

function setupAutoUpdater() {
  setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 5000);

  autoUpdater.on('update-available', (info) => {
    const state = getUpdateState();
    if (state.version !== info.version) { state.version = info.version; state.dismissCount = 0; saveUpdateState(state); }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', { version: info.version, dismissCount: state.dismissCount });
    }
  });

  autoUpdater.on('download-progress', (p) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('download-progress', Math.round(p.percent));
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-downloaded', info.version);
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 2000);
  });

  autoUpdater.on('error', (err) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('download-error');
  });
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
