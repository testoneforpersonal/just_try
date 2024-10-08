const {
  GetDeviceInfo,
  GenerateDeviceUID,
  GETDeviceUID,
} = require('./device-info');
const { HR } = require('./http-request');
const { defaultConfig } = require('./default-config');
const { ConnectionManager } = require('./connection-manager');
const { ipcRenderer } = require('electron');
const log = require('electron-log');
var isDev = process.env.ENV ? process.env.ENV.trim() == 'dev' : false;
defaultConfig.isDev = isDev;
const deviceInfo = GetDeviceInfo();

const processServerConfig = function (data, ConfigManager) {
  updateConfig(data, ConfigManager);
};
const updateConfig = function (data, ConfigManager) {
  //NOTE:following code is copied for previous version
  const params = ConfigManager.get('params');
  const domain = ConfigManager.get('domain');
  const defaultAd = ConfigManager.get('defaultAd');
  const appSettings = ConfigManager.get('appSettings');
  params.pid = data.pid;
  params.aid = data.aid;
  params.gid = data.gid;
  params.w = data.w;
  params.h = data.h;
  ConfigManager.set('params', params);
  ConfigManager.set('siteId', GETDeviceUID());
  if (typeof data.is_resetup != 'undefined') {
    ConfigManager.set('isResetup', data.is_resetup);
  } else {
    ConfigManager.set('isResetup', false);
  }
  if (typeof data.is_screen_edit != 'undefined') {
    ConfigManager.set('isScreenEdit', data.is_screen_edit);
  } else {
    ConfigManager.set('isScreenEdit', false);
  }

  if (typeof data.domain != 'undefined') {
    ConfigManager.set('apiDomain', data.domain);
  }

  if (typeof data.local_domain != 'undefined') {
    domain.local = data.local_domain;
  }
  if (typeof data.prod_domain != 'undefined') {
    domain.prod = data.prod_domain;
  }
  ConfigManager.set('domain', domain);

  if (typeof data.app_url != 'undefined') {
    ConfigManager.set('appURL', data.app_url);
  }

  if (typeof data.ad_servad_api != 'undefined') {
    ConfigManager.set('adServdAPI', data.ad_servad_api);
  }

  if (typeof data.schedule_api != 'undefined') {
    ConfigManager.set('scheduleAPI', data.schedule_api);
  }

  if (typeof data.timezone != 'undefined') {
    ConfigManager.set('timezone', data.timezone);
  }

  if (typeof data.notification_api != 'undefined') {
    ConfigManager.set('notificationAPI', data.notification_api);
  }

  if (typeof data.lemma_Weather_api != 'undefined') {
    ConfigManager.set('lemmaWeatherAPI', data.lemma_Weather_api);
  }

  if (typeof data.thirdparty_Weather_api != 'undefined') {
    ConfigManager.set('amssdelhiWeatherAPI', data.thirdparty_Weather_api);
  }
  //Thus build is only support AdSync=true so to avoid setting false, made below changes.
  if (typeof data.is_adSync != 'undefined') {
    if (data.is_adSync) {
      ConfigManager.set('adSync', data.is_adSync);
    }
  } else {
    ConfigManager.set('adSync', true);
  }

  if (typeof data.is_mute != 'undefined') {
    ConfigManager.set('isMute', data.is_mute);
  } else {
    ConfigManager.set('isMute', false);
  }

  if (typeof data.is_fullscreen != 'undefined' && data.is_fullscreen) {
    ConfigManager.set(
      'width',
      typeof window != 'undefined' && window.innerWidth
        ? window.innerWidth
        : data.w
    );
    ConfigManager.set(
      'height',
      typeof window != 'undefined' && window.innerHeight
        ? window.innerHeight
        : data.h
    );
  } else {
    ConfigManager.set('width', data.w);
    ConfigManager.set('height', data.h);
  }

  if (typeof data.environment != 'undefined') {
    ConfigManager.set('environment', data.environment);
  } else {
    ConfigManager.set('environment', 1);
  }

  if (typeof data.is_auto_update != 'undefined') {
    ConfigManager.set('isAutoUpdate', data.is_auto_update);
  } else if (!ConfigManager.get('isAutoUpdate')) {
    ConfigManager.set('isAutoUpdate', true);
  }

  if (typeof data.auto_update_url != 'undefined') {
    if (ConfigManager.get('autoUpdateURL') != data.auto_update_url) {
      ConfigManager.set('updateServerURL', data.auto_update_url);
      ipcRenderer.send('update-server-url-changed', data.auto_update_url);
    }
  }
  if (data.default_creative) {
    defaultAd.creative = data.default_creative;
    const images = ['jpg', 'jpeg', 'gif', 'png'];
    const videos = ['mp4', '3gp', 'ogg', 'mov'];
    let ext = data.default_creative.split(/[#?]/)[0].split('.').pop().trim();
    defaultAd.ad_type = images.includes(ext) ? 1 : videos.includes(ext) ? 3 : 0;
    defaultAd.tag_id = images.includes(ext)
      ? 'lm_img'
      : videos.includes(ext)
        ? 'lm_video'
        : '';
    defaultAd.duration = data.default_duration ? data.default_duration : 15;
    ConfigManager.set('defaultAd', defaultAd);
  }
  if (data.refresh_interval != 'undefined') {
    appSettings.schedule_interval = data.refresh_interval
      ? data.refresh_interval
      : 900;
  }

  if (typeof data.is_weather != 'undefined') {
    isWeatherAPICall = data.is_weather ? data.is_weather : false;
    ConfigManager.set('isWeather', isWeatherAPICall);
  }
  if (typeof data.end_time != 'undefined') {
    var sdTime = data.end_time.split(':');
    shutdownHour = parseInt(sdTime[0]);
    shutdownMin = parseInt(sdTime[1]);
    ConfigManager.set('shutdownHour', shutdownHour);
    ConfigManager.set('shutdownMin', shutdownMin);
  }

  if (typeof data.restart_time != 'undefined') {
    var rsTime = data.restart_time.split(':');
    restartHour = parseInt(rsTime[0]);
    restartMin = parseInt(rsTime[1]);
    ConfigManager.set('restartHour', restartHour);
    ConfigManager.set('restartMin', restartMin);
  }
  if (data.is_fullscreen != 'undefined') {
    appSettings.kiosk = data.is_fullscreen ? data.is_fullscreen : false;
  }
  ConfigManager.set('appSettings', appSettings);
  if (typeof data.sitemap_api != 'undefined') {
    ConfigManager.set('sitemapAPI', data.sitemap_api);
  }
};

const ConfigManager = {
  persistTimeoutId: null,
  updateConfigFromRemote() {
    if (!!ConnectionManager.isOnline()) {
      log.info('Fetching config from server: ', this.get('sitemapAPI'));
      return HR.request(
        this.get('sitemapAPI'),
        {
          method: 'POST',
          strictSSL: false,
          rejectUnauthorized: false,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            site_id: GETDeviceUID(),
          }),
        },
        3
      ).then(rawResponse => {
        if (rawResponse.status == 200) {
          return rawResponse.json().then(response => {
            if (response) {
              if (
                response &&
                response.data &&
                Object.keys(response.data).length > 0
              ) {
                processServerConfig(response.data, this);
                this.writeConfigLocally();
              }
              return true;
            }
            return false;
          });
        }
        log.debug('Failed to fetch config from server');
        return false;
      });
    }
  },
  writeConfigLocally() {
    ipcRenderer.sendSync('write-local-config', defaultConfig);
  },
  updateConfigFromLocal() {
    const localConfig = ipcRenderer.sendSync('read-local-config');
    console.log('localConfig', localConfig);
    if (localConfig) {
      const entries = Object.entries(localConfig);
      entries.forEach(([key, value]) => {
        ConfigManager.set(key, value);
      });
      return true;
    }
    return false;
  },
  get(key) {
    return defaultConfig[key];
  },
  set(key, value) {
    defaultConfig[key] = value;
    if (this.persistTimeoutId == null) {
      this.persistTimeoutId = setTimeout(() => {
        this.persistTimeoutId = null;
        this.writeConfigLocally();
      }, 500);
    }
  },
  buildURL(path, params) {
    let env = this.get('environment');
    let domain = this.get('domain');
    let apiDomain = domain.prod;
    if (env == 0) {
      apiDomain = domain.local;
    }
    let url = this.get('protocol') + '//' + apiDomain + path;
    if (params) {
      const paramsStr = [];
      for (const [name, value] of Object.entries(params)) {
        paramsStr.push(name + '=' + value);
      }
      if (paramsStr.length > 0) {
        url += '?' + paramsStr.join('&');
      }
    }
    return url;
  },
};
exports.Config = defaultConfig;
exports.ConfigManager = ConfigManager;
