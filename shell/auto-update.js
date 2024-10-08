const { app } = require('electron');
const {autoUpdater} = require("electron-updater");

const log = require('electron-log');

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.allowDowngrade = true;

log.info('[AutoUpdate] Auto-update initialized. Version:', autoUpdater.currentVersion.raw);

let updateCheckIntervalId = null;

exports.changeUpdateServerUrl = function(serverUrl) {
    log.info('[AutoUpdate] changed update serverUrl:', serverUrl);
    autoUpdater.setFeedURL( { provider: "generic", url: serverUrl, } )
    autoUpdater.checkForUpdates()
};
exports.initAutoUpdate = function(serverUrl) {
    log.info('[AutoUpdate] serverUrl:', serverUrl);
    if(typeof serverUrl !== 'string') {
        throw new Error('serverUrl must be a string');
    }
    autoUpdater.on('checking-for-update', () => {
        log.info('[AutoUpdate] Checking for update...')
    });
    
    autoUpdater.on('update-available', () => {
        log.info('[AutoUpdate] Update available.')
    });
    
    
    autoUpdater.on('update-not-available', () => {
        log.info('[AutoUpdate] Update not available.')
    });
    
    autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
        log.info('[AutoUpdate] Update-downloaded', event, releaseNotes, releaseName)
        autoUpdater.quitAndInstall(true, true);
    });
    
    autoUpdater.on('error', message => {
        log.error('[AutoUpdate] There was a problem updating the application')
        log.error(message)
    });
   

    log.info('[AutoUpdate] Initializing auto-update...');
    log.info('[AutoUpdate] Checking for update...', serverUrl);

    autoUpdater.setFeedURL( { provider: "generic", url: serverUrl, } )
    autoUpdater.checkForUpdates()
    log.info('[AutoUpdate] Auto-update initialized.');
    log.info('[AutoUpdate] Auto-update url: ' + autoUpdater.getFeedURL());
    if(updateCheckIntervalId) {
        clearInterval(updateCheckIntervalId);
    }
    updateCheckIntervalId = setInterval(() => { autoUpdater.checkForUpdates() }, 1000 * 60 * 60 * 3);
}