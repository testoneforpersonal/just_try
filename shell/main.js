const path = require('path');
const log = require('electron-log');
const { session, ipcRenderer } = require('electron');
const {
  app,
  globalShortcut,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  powerSaveBlocker,
  screen,
} = require('electron');
const {
  downloadFile,
  CACHE_PATHS,
  updateLocalScheduleEncrypted,
  readLocalScheduleEncrypted,
  updateLocalScheduleNonEncrypted,
  readLocalScheduleNonEncrypted,
  readLocalConfig,
  saveConfigLocally,
  getLocalFilePath,
} = require('./store');
const { initAutoUpdate, changeUpdateServerUrl } = require('./auto-update');
const fs = require('fs');
const _ = require('./ipc');
var isDev = process.env.ENV ? process.env.ENV.trim() == 'dev' : false;
if (isDev) {
  require('electron-reload')(path.join(__dirname, '..'));
}
const id = powerSaveBlocker.start('prevent-display-sleep');
powerSaveBlocker.isStarted(id);

const gotTheLock = app.requestSingleInstanceLock();

var lemmaAppWin = null;

if (!gotTheLock) {
  console.log('Another instance is already running. Exiting...');
  log.error('Another instance is already running. Exiting...');
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    console.log('Second instance launched');
    log.error('Second instance launched');
    if (lemmaAppWin) {
      if (lemmaAppWin.isMinimized()) lemmaAppWin.restore();
      lemmaAppWin.focus();
    }
  });

  // this will use white background
  nativeTheme.themeSource = 'light';

  const localConfig = readLocalConfig();
  function createWindow() {
    const kiosk =
      localConfig && localConfig.appSettings && localConfig.appSettings.kiosk;
    log.debug('CreateWindow:Theme:' + nativeTheme.themeSource);
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const win = new BrowserWindow({
      title: 'Lemma',
      icon: `${__dirname}/../resources/icons/logo.png`,
      frame: isDev,
      width: localConfig.width || width,
      height: localConfig.height || height,
      x: 0,
      y: 0,
      webSecurity: false,
      webPreferences: {
        hardwareAcceleration: true,
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true,
        autoplayPolicy: 'no-user-gesture-required',
      },
      backgroundColor: '#000000',
      alwaysOnTop: isDev ? false : kiosk,
      autoHideMenuBar: true,
      focusable: true,
      fullscreen: isDev ? false : kiosk,
      skipTaskbar: true,
      kiosk: isDev ? false : kiosk,
      disableAutoHideCursor: true,
    });
    lemmaAppWin = win;

    const contents = win.webContents;
    if (contents) {
      contents.setAudioMuted(!!localConfig.isMute);
    }
    contents.session.webRequest.onHeadersReceived(
      { urls: ['*://*/*'] },
      (d, c) => {
        if (d.responseHeaders['X-Frame-Options']) {
          delete d.responseHeaders['X-Frame-Options'];
        } else if (d.responseHeaders['x-frame-options']) {
          delete d.responseHeaders['x-frame-options'];
        }
        c({ cancel: false, responseHeaders: d.responseHeaders });
      }
    );
    const filter = {
      urls: [],
    };

    session.defaultSession.webRequest.onBeforeSendHeaders(
      filter,
      (details, callback) => {
        var str = details.requestHeaders['Referer'];
        details.requestHeaders['Origin'] =
          str && str[str.length - 1] == '/' ? str.slice(0, -1) : str; //details.requestHeaders['Referer'];//'https://pubstack.nw18.com'
        callback({ requestHeaders: details.requestHeaders });
      }
    );

    win.loadFile('./www/index.html');
    if (isDev) {
      win.webContents.openDevTools();
    } else {
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setVisibleOnAllWorkspaces(true);
      win.setFullScreenable(true);
      win.setFullScreen(true);
    }

    nativeTheme.themeSource = 'light';

    win.webContents.on('render-process-gone', function (event, details) {
      log.info('[createWindow] Main JS Killed Reason:' + details.reason);
      log.info('[createWindow] Main JS Killed :' + JSON.stringify(details));
      //if (details.reason == 'crashed') {
      log.info('[createWindow] Main JS Crashed');
      app.relaunch({
        args: process.argv.slice(1).concat(['--relaunch']),
      });
      app.exit(0);
      //}
    });

    win.on('unresponsive', function (event, details) {
      log.error('[createWindow] Main JS Unresponsive');
      app.relaunch({
        args: process.argv.slice(1).concat(['--relaunch']),
      });
      app.exit(0);
    });

    // If application crashes, relaunch the app
    win.on('crashed', function (event, details) {
      log.error('[createWindow] Main JS Crashed', details);
      app.relaunch({
        args: process.argv.slice(1).concat(['--relaunch']),
      });
      app.exit(0);
    });

    win.setKiosk(kiosk);
    win.show();
  }

  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  app.commandLine.appendSwitch('ignore-certificate-errors', 'true');
  app.commandLine.appendSwitch('allow-insecure-localhost', 'true');
  app.commandLine.appendSwitch('allow-file-access-from-files', 'true');
  app.commandLine.appendSwitch('disable-web-security', 'true');
  app.commandLine.appendSwitch('disable-renderer-backgrounding', 'true');
  app.commandLine.appendSwitch('disable-features', 'DarkMode');
  app.commandLine.appendSwitch('expose-gc', 'true');
  app.commandLine.appendSwitch('enable-bluetooth-spp-in-serial-api', 'true');

  // const gotTheLock = app.requestSingleInstanceLock();

  process.on('uncaughtException', function (exception) {
    log.error(exception);
  });

  process.on('unhandledRejection', err => {
    log.error(err);
  });

  app.on(
    'certificate-error',
    function (event, webContents, url, error, certificate, callback) {
      event.preventDefault();
      callback(true);
    }
  );

  app.on('ready', function () {
    globalShortcut.register('CommandOrControl+Escape', app.quit);
    globalShortcut.register('CommandOrControl+Shift+I', app.quit);
    globalShortcut.register('CommandOrControl+Shift+W', () => {
      lemmaAppWin.webContents.openDevTools();
    });
    globalShortcut.register('CommandOrControl+E', () => {
      if (lemmaAppWin) {
        lemmaAppWin.loadFile('./www/app/app.html');
      }
    });
  });

  app.whenReady().then(() => {
    createWindow();
  });

  app.on('window-all-closed', function () {
    app.quit();
  });

  ipcMain.on('close-app', function (event) {
    app.quit();
  });

  ipcMain.on('resize-me-please', (event, params) => {
    if (lemmaAppWin != null) {
      var width =
        params && typeof params.width != 'undefined' ? params.width : 300;
      var height =
        params && typeof params.height != 'undefined' ? params.height : 600;
      log.info('Resize event ', height, 'width:', width);
      lemmaAppWin.setSize(parseInt(width), parseInt(height), false);
      const localConfig = readLocalConfig();
      log.info('Resize event config: ', localConfig);
      if (localConfig.appSettings && localConfig.appSettings.kiosk) {
        lemmaAppWin.setKiosk(true);
        lemmaAppWin.setFullScreen(true);
      }
    }
  });

  ipcMain.on('init-auto-update', function (event, params) {
    log.info('[initAutoUpdate] Init Auto Update');
    //log.debug('[initAutoUpdate] Domain: ', params);
    if (!isDev) {
      try {
        let autoUpdateURL = 'https://' + params.prod + '/signage-client/timda/'; // Note: hardcoded for now
        initAutoUpdate(autoUpdateURL);
      } catch (e) {
        log.error('[initAutoUpdate] Error: ' + e);
      }
    } else {
      log.info('[app] Auto update disabled in dev mode');
    }
  });

  ipcMain.on('download', (event, url, cksum) => {
    downloadFile(url, cksum)
      .then(finalPath => {
        lemmaAppWin.webContents.send('download-complete', url, finalPath);
      })
      .catch(() => {
        lemmaAppWin.webContents.send('download-failed', url);
      });
  });

  ipcMain.on('update-local-schedule-encrypted', (event, scheduleData) => {
    event.returnValue = updateLocalScheduleEncrypted(scheduleData);
  });
  ipcMain.on('read-local-schedule-encrypted', event => {
    event.returnValue = readLocalScheduleEncrypted();
  });
  ipcMain.on('update-local-schedule-non-encrypted', (event, scheduleData) => {
    event.returnValue = updateLocalScheduleNonEncrypted(scheduleData);
  });
  ipcMain.on('read-local-schedule-non-encrypted', event => {
    event.returnValue = readLocalScheduleNonEncrypted();
  });
  ipcMain.on('read-local-config', event => {
    event.returnValue = readLocalConfig();
  });
  ipcMain.on('write-local-config', (event, configData) => {
    event.returnValue = saveConfigLocally(configData);
    const config = configData;
    if (config) {
      if (config.appSettings) {
        const appSettings = config.appSettings;
        lemmaAppWin.setKiosk(!!appSettings.kiosk);
        lemmaAppWin.setFullScreen(!!appSettings.kiosk);
      }
      let x = 0,
        y = 0;
      if (config.screenOffset) {
        x = parseInt(config.screenOffset.x) || x;
        y = parseInt(config.screenOffset.y) || y;
      }
      lemmaAppWin.setPosition(x, y);
      let width = parseInt(localConfig.width);
      let height = parseInt(localConfig.height);
      if (config.width && config.height) {
        width = parseInt(config.width) || width;
        height = parseInt(config.height) || height;
      }
      lemmaAppWin.setSize(width, height, false);
      const contents = lemmaAppWin.webContents;
      if (contents) {
        contents.setAudioMuted(!!config.isMute);
      }
    }
  });

  ipcMain.on('update-server-url-changed', (event, updateServerURL) => {
    event.returnValue = updateServerURL;
    if (updateServerURL) {
      changeUpdateServerUrl(updateServerURL);
    }
  });
  ipcMain.on('synchronous-cache-paths', event => {
    event.returnValue = CACHE_PATHS;
  });
  ipcMain.on('synchronous-get-local-file-path', (event, remotePath) => {
    const localPath = getLocalFilePath(remotePath);
    log.debug('Got LocalPath:', localPath, ' for remotePath:', remotePath);
    event.returnValue = localPath;
  });
  ipcMain.on('synchronous-check-local-file-path', (event, localPath) => {
    log.debug('synchronous-check-local-file-path', localPath);
    event.returnValue = fs.existsSync(localPath);
  });
  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,
  });
}
