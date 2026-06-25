const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFiles:       () => ipcRenderer.invoke('open-files'),
  getAppVersion:   () => ipcRenderer.invoke('get-app-version'),
  getSystemStats:  () => ipcRenderer.invoke('get-system-stats'),
  dismissUpdate:   (v) => ipcRenderer.invoke('dismiss-update', v),
  startDownload:   () => ipcRenderer.invoke('start-download'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  quitApp:         () => ipcRenderer.invoke('quit-app'),
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_, d) => cb(d)),
  onDownloadProgress: (cb) => ipcRenderer.on('download-progress', (_, p) => cb(p)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_, v) => cb(v)),
  onDownloadError:    (cb) => ipcRenderer.on('download-error',    () => cb()),
  platform: process.platform
});
