// main.js — Processus principal Electron (LoyerPay Windows)
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const Store = require('./store'); // petit store JSON local (config, gestionnaire_id, licence)

function getDeviceId() {
  // Identifiant stable de la machine, même logique que Devis Pro (device-locked)
  const raw = os.hostname() + os.platform() + (os.cpus()[0]?.model || '');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    autoHideMenuBar: true
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('get-device-id', () => getDeviceId());
ipcMain.handle('open-external', (e, url) => shell.openExternal(url));
ipcMain.handle('store-get', (e, key) => Store.get(key));
ipcMain.handle('store-set', (e, key, value) => Store.set(key, value));
