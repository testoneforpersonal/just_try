const {ipcMain} = require('electron');
const log = require('electron-log');
const { IpcStoreDeviceUid, GetStoredDeviceUid } = require('./store.js');
const { IPC_KEYS } = require('./constants.js')

ipcMain.on(IPC_KEYS.storeDeviceUid, async (event, uidJson)  => {
    IpcStoreDeviceUid(uidJson)
});

ipcMain.handle(IPC_KEYS.getStoredDeviceUid, GetStoredDeviceUid);