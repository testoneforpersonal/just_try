const { ConfigManager } = require('./config-manager');
const log = require('electron-log');
const { HR } = require('./http-request');
const HtmlTableToJson = require('html-table-to-json');
const { ConnectionManager } = require('./connection-manager');

const WEATHER_UPDATE_DURATION = 15 * 60 * 1000;
const WeatherList = [];
const WeatherManager = {
  init() {
    this.onTick();
  },
  cityWeather: {},
  onTick() {
    this.cityWeather = ConfigManager.get('weather') || {};
    if (ConnectionManager.isOnline()) {
      const env = ConfigManager.get('environment');
      if (env) {
        WeatherManager.fetchLemmaWeather();
      } else {
        WeatherManager.fetchAmssdelhiWeather();
      }
    }
  },
  fetchAmssdelhiWeather() {
    log.info('[fetchAmssdelhiWeather] Is local server weather API call: ');
    var apiURL = ConfigManager.get('amssdelhiWeatherAPI');
    if (apiURL) {
      HR.request(apiURL)
        .then(response => response && response.json())
        .then(response => {
          log.info(
            '[fetchAmssdelhiWeather] Weather data: ' + JSON.stringify(response)
          );
          if (response) {
            const jsonTables = new HtmlTableToJson(`${response}`);
            var len =
              jsonTables && jsonTables.results && jsonTables.results.length;
            WeatherList.length = 0;
            if (len) {
              var tempData = jsonTables.results[len - 1];
              for (let i = 1; i < tempData.length; i++) {
                var item = {
                  id: tempData[i]['1'],
                  name: tempData[i]['2'],
                  temp: tempData[i]['3'],
                };
                WeatherList.push(item);
              }
            } else if (response) {
              WeatherList.push(...response);
            }
            WeatherList.forEach(item => {
              this.cityWeather[item.name.toLowerCase()] = Math.round(item.temp);
            });
            ConfigManager.set('weather', this.cityWeather);
            log.info(
              '[fetchAmssdelhiWeather] Weather data: ' +
                JSON.stringify(WeatherList)
            );
          }
        })
        .catch(error => {
          log.error('[fetchAmssdelhiWeather] Error Response: ', error);
        });
    }
  },
  fetchLemmaWeather() {
    var apiURL = ConfigManager.get('lemmaWeatherAPI');
    if (apiURL) {
      HR.request(apiURL)
        .then(response => response && response.json())
        .then(response => {
          WeatherList.length = 0;

          if (response && response.list) {
            response.list.forEach(item => {
              WeatherList.push({
                id: item.id,
                name: item.name,
                temp: Math.round(item.main.temp),
              });
            });
          } else if (response) {
            WeatherList.push(...response);
          }
          WeatherList.forEach(item => {
            this.cityWeather[item.name.toLowerCase()] = Math.round(item.temp);
          });
          ConfigManager.set('weather', this.cityWeather);
          log.info(
            '[fetchLemmaWeather] Weather data: ' + JSON.stringify(WeatherList)
          );
        })
        .catch(error => {
          log.error('[fetchLemmaWeather] Error Response: ', error);
        });
    }
  },
  getCityTemperature(cityName) {
    return this.cityWeather[cityName] || 'N/A';
  },
};

exports.WeatherManager = WeatherManager;
