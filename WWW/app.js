const { CacheManager } = require('./cache-manager');
const { AdPlayer } = require('./ad-player');
const { ScheduleManager } = require('./schedule-manager');
const { ConfigManager } = require('./config-manager');
const { WeatherManager } = require('./weather-manager');
const { ConnectionManager } = require('./connection-manager');
const { SerialPortManager } = require('./serialport');
const { getSiteID } = require('./util');
const log = require('electron-log');
const { ipcRenderer, app } = require('electron');
const {
  GetDeviceInfo,
  getDeviceUUID,
  GetDeviceUID,
  SetDeviceUID,
  GenerateDeviceUID,
} = require('./device-info');
const localConfigFound = ConfigManager.updateConfigFromLocal();
AdPlayer.playDefaultAd();
ConfigManager.set('siteId', getSiteID());
WeatherManager.init();
SerialPortManager.init();
ConnectionManager.isNetworkConnected().then(resp => {
  AdPlayer.setOnline(resp);
});
// Read device stored device Id
ipcRenderer
  .invoke('GetStoredDeviceUid')
  .then(deviceUid => {
    log.info('Device UID 1 - ', deviceUid);
    if (deviceUid === null) {
      // If device id is not aleardy stored (i.e this is a new device)
      log.info('Device UID 1 - ', deviceUid);
      // Generate a new device Id
      GenerateDeviceUID().then(uid => {
        log.info('Device UID - ', uid);
        SetDeviceUID(uid);
        log.info('Device UID - ', GetDeviceUID());
        startApp();
        // Store the generated device id on device
        ipcRenderer.send('storeDeviceUid', { SiteId: uid });
      });
    } else {
      // Remember the device id for further use
      log.info('Device UID 2 - ', deviceUid);
      SetDeviceUID(deviceUid);
      startApp();
    }
  })
  .catch(() => {
    GenerateDeviceUID().then(uid => {
      log.info('Device UID - ', uid);
      // Store the generated device id on device
      ipcRenderer.send('storeDeviceUid', { SiteId: uid });
      SetDeviceUID(uid);
      startApp();
    });
  });

const runOffline = function () {
  AdPlayer.setOnline(false);
  // log.debug('[App] localConfigFound', localConfigFound);
  if (!localConfigFound) {
    openConfig();
  } else {
    log.debug('[App] Working offline');
    ScheduleManager.initLocal();
  }
};

function startApp() {
  if (!!ConnectionManager.isOnline()) {
    ConfigManager.updateConfigFromRemote()
      .catch(e => {
        log.debug('[App] Can not download config from remote looks offline');
      })
      .finally(() => {
        AdPlayer.updateDefaultAdTag();
        log.info('[App] isAutoUpdate', ConfigManager.get('isAutoUpdate'));
        if (ConfigManager.get('isAutoUpdate')) {
          log.info('[App] Auto update is enabled');
          let domain = ConfigManager.get('domain')
            ? ConfigManager.get('domain')
            : { prod: 'lemmadigital.com' };
          ipcRenderer.send('init-auto-update', domain);
        }
        ScheduleManager.init()
          .then(scheduleSuccess => {
            if (!scheduleSuccess) {
              log.debug('[App] Schedule failed to load');
              runOffline();
            } else {
              const params = ConfigManager.get('params');
              if (params && params.pid == 0) {
                openConfig();
              }
            }
          })
          .catch(e => {
            log.debug('[App] Schedule failed to load ex:', e);
            runOffline();
          });
      });
  }
}

ScheduleManager.setupMinuteTick();

window.openConfig = function () {
  if (location.assign) {
    location.assign('./app/app.html');
  } else {
    setTimeout(function () {
      location.assign('./app/app.html');
    }, 2000);
  }
};

document.addEventListener(
  'keypress',
  function (event) {
    if (event && event.code == 'KeyE') {
      openConfig();
    }
  },
  true
);
