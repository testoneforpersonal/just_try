const { CacheManager } = require('../cache-manager');
const { AdPlayer } = require('../ad-player');
const { ScheduleManager } = require('../schedule-manager');
const { ConfigManager } = require('../config-manager');
const { WeatherManager } = require('../weather-manager');
const { ConnectionManager } = require('../connection-manager');
ConfigManager.updateConfigFromLocal();
const { ipcRenderer } = require('electron');
window.ConfigManager = ConfigManager;
window.closeApp = function () {
  ipcRenderer.send('close-app');
};
