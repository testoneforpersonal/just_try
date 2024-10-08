const { ipcRenderer } = require('electron');
const shutdown = require('electron-shutdown-command');
const { Config, ConfigManager } = require('./config-manager');
const { ConnectionManager } = require('./connection-manager');
const { HR } = require('./http-request');
const { WeatherManager } = require('./weather-manager');
const log = require('electron-log');
// const { AdPlayer } = require("./ad-player");

const ScheduleManager = {
  preScheduleData: null,
  init() {
    return this.fetchSchedule();
  },
  fetchSchedule() {
    const env = ConfigManager.get('environment');
    // log.debug('[App] Config: ', Config);
    this.preScheduleData = this.getLocalSchedule();
    const urlParams = {
      aid: parseInt(Config.params.aid),
      pid: parseInt(Config.params.pid),
      gid: parseInt(Config.params.gid),
      mode: 2,
    };
    if (env == 0) {
      log.debug('[fetchSchedule] Local Server');
      const url = ConfigManager.buildURL(Config.scheduleAPI, urlParams);
      log.debug('[fetchSchedule] Schedule API: ', url);
      return HR.getJSON(url, {}, 3)
        .then(data => {
          let rdata = data && data.data;
          if (rdata && rdata.schedule && rdata.schedule.length) {
            return this.processSchedule(rdata);
          } else if (!this.preScheduleData) {
            log.debug('[fetchSchedule] Response Data: ', rdata);
            if (Config && Config.encryptSchedule) {
              ipcRenderer.sendSync('update-local-schedule-encrypted', rdata);
            } else {
              ipcRenderer.sendSync(
                'update-local-schedule-non-encrypted',
                rdata
              );
            }
            this.setUpdateCallback(null);
          } else {
            this.setUpdateCallback(this.preScheduleData);
          }
          return false;
        })
        .catch(e => {
          return false;
        });
    } else {
      const url = ConfigManager.buildURL(Config.scheduleAPI);
      log.debug('[fetchSchedule] Schedule API: ', url);
      return HR.getJSON(
        url,
        {
          method: 'POST',
          strictSSL: false,
          rejectUnauthorized: false,
          headers: {
            Accept: 'application/json',
          },
          body: JSON.stringify({
            adid: parseInt(Config.params.aid),
            pid: parseInt(Config.params.pid),
            gid: parseInt(Config.params.gid),
            mode: 2,
          }),
        },
        3
      )
        .then(data => {
          let rdata = data && data.data;
          if (rdata && rdata.schedule && rdata.schedule.length) {
            return this.processSchedule(rdata);
          } else if (!this.preScheduleData) {
            log.debug('[fetchSchedule] Response Data: ', rdata);
            if (Config && Config.encryptSchedule) {
              ipcRenderer.sendSync('update-local-schedule-encrypted', rdata);
            } else {
              ipcRenderer.sendSync(
                'update-local-schedule-non-encrypted',
                rdata
              );
            }
            this.setUpdateCallback(null);
          } else {
            this.setUpdateCallback(this.preScheduleData);
          }
          return false;
        })
        .catch(e => {
          return false;
        });
    }
  },
  processSchedule(data) {
    const scheduleData = data;
    // log.debug("[processSchedule] Data: ", data);
    if (Config && Config.encryptSchedule) {
      ipcRenderer.sendSync('update-local-schedule-encrypted', scheduleData);
    } else {
      ipcRenderer.sendSync('update-local-schedule-non-encrypted', scheduleData);
    }
    AdPlayer.setOnline(!!ConnectionManager.isOnline());
    log.debug('[processSchedule] Is Playing: ', AdPlayer.isPlaying);
    // log.debug("[processSchedule] Schedule: ", scheduleData);
    if (AdPlayer.isPlaying && this.preScheduleData) {
      AdPlayer.updateSchedule(scheduleData);
    } else {
      AdPlayer.init(scheduleData);
    }
    const appSettings = ConfigManager.get('appSettings');
    appSettings.schedule_interval =
      scheduleData.refresh_interval && scheduleData.refresh_interval > 0
        ? scheduleData.refresh_interval
        : appSettings.schedule_interval;
    ConfigManager.set('appSettings', appSettings);

    const defaultAd = ConfigManager.get('defaultAd');
    if (scheduleData.pub_crtv && defaultAd.Creative !== scheduleData.pub_crtv) {
      defaultAd.Creative = data.pub_crtv;
      ConfigManager.set('defaultAd', defaultAd);
    }

    if (scheduleData.end_time) {
      let sdTime = scheduleData.end_time.split(':');
      shutdownHour = parseInt(sdTime[0]);
      shutdownMin = parseInt(sdTime[1]);
      ConfigManager.set('shutdownHour', shutdownHour);
      ConfigManager.set('shutdownMin', shutdownMin);
    }

    if (scheduleData.restart_time) {
      let rsTime = scheduleData.restart_time.split(':');
      restartHour = parseInt(rsTime[0]);
      restartMin = parseInt(rsTime[1]);
      ConfigManager.set('restartHour', restartHour);
      ConfigManager.set('restartMin', restartMin);
    }
    ConfigManager.writeConfigLocally();
    this.setUpdateCallback(data);

    return true;
  },
  setUpdateCallback(data) {
    let that = this;
    if (this.scheduleFetchTimer) {
      clearTimeout(this.scheduleFetchTimer);
    }
    // log.debug("[setUpdateCallback] Response Data: ", data);
    if (!data || (data && (!data.schedule || !data.schedule.length))) {
      AdPlayer.schedule = [];
      AdPlayer.isPlaying = false;
    }
    const appSettings = ConfigManager.get('appSettings');
    // log.debug("[setUpdateCallback] appSettings: ", appSettings);
    if (appSettings && appSettings.schedule_interval) {
      const scheduleInterval = appSettings.schedule_interval;
      this.scheduleFetchTimer = setTimeout(() => {
        that.updateIntervalCallback(data);
      }, scheduleInterval * 1000);
    }
  },
  updateIntervalCallback(data) {
    if (!!ConnectionManager.isOnline()) {
      ConfigManager.updateConfigFromRemote()
        .then(() => {
          AdPlayer.updateDefaultAdTag();
        })
        .finally(() => {
          // log.debug("[updateIntervalCallback] Ad Sync: ", ConfigManager.get('adSync'));
          if (!!ConnectionManager.isOnline()) {
            this.fetchSchedule();
          }
        });
    }
  },
  initLocal() {
    const localSchedule = this.getLocalSchedule();
    // log.debug("[initLocal] localSechdule: ", localSchedule);
    if (AdPlayer && AdPlayer.init) {
      AdPlayer.init(localSchedule);
    }
    this.setUpdateCallback(localSchedule);
  },
  getLocalSchedule() {
    if (Config && Config.encryptSchedule) {
      return ipcRenderer.sendSync('read-local-schedule-encrypted');
    }
    return ipcRenderer.sendSync('read-local-schedule-non-encrypted');
  },
  setupMinuteTick() {
    setInterval(() => {
      this.onMinuteTick();
    }, 60 * 1000);
  },
  onMinuteTick() {
    const currentTime = new Date();

    const shutdownHour = ConfigManager.get('shutdownHour');
    const shutdownMin = ConfigManager.get('shutdownMin');
    if (shutdownHour !== undefined && shutdownMin !== undefined) {
      if (
        currentTime.getHours() == shutdownHour &&
        currentTime.getMinutes() == shutdownMin
      ) {
        shutdown.shutdown({
          force: true,
          timerseconds: 20,
        });
      }
    }

    const restartHour = ConfigManager.get('restartHour');
    const restartMin = ConfigManager.get('restartMin');
    if (restartHour !== undefined && restartMin !== undefined) {
      if (
        currentTime.getHours() == restartHour &&
        currentTime.getMinutes() == restartMin
      ) {
        shutdown.reboot({
          force: true,
        });
      }
    }
    if (currentTime.getMinutes() % 30 == 0) {
      this.updateIntervalCallback();
    }

    if (currentTime.getMinutes() % 15 === 0) {
      WeatherManager.onTick();
    }
  },
};

exports.ScheduleManager = ScheduleManager;
