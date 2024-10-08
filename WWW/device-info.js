const os = require('os');
const log = require('electron-log');
const systemInfo = require('systeminformation');
const { ipcMain, ipcRenderer } = require('electron');
const { resolve } = require('path');
const { exec } = require('child_process');
const { error } = require('console');
const { stdout, stderr } = require('process');
let deviceId = null;
const { SendEmail } = require('./notification');
const OpsEmail = 'ops-support@lemmatechnologies.com';

// const {
//     version
// } = require('package.json');

const getIPMacAddress = function () {
  try {
    let ifaces = os.networkInterfaces();
    let ipAdresse = '';
    let macAdresse = '';
    Object.keys(ifaces).forEach(function (ifname) {
      let alias = 0;
      ifaces[ifname].forEach(function (iface) {
        if ('IPv4' !== iface.family || iface.internal !== false) {
          return;
        }
        if (alias >= 1) {
          log.debug(ifname + ':' + alias, iface.address);
        } else {
          ipAdresse = iface.address;
          macAdresse = iface.mac;
        }
        ++alias;
      });
    });
    return {
      ip: ipAdresse,
      mac: macAdresse,
      pip: 'N/A',
    };
  } catch (error) {
    log.error(error);
  }
};

function displayLocationInfo(position) {
  log.debug(position);
  const lng = position.coords.longitude;
  const lat = position.coords.latitude;

  log.debug(`longitude: ${lng} | latitude: ${lat}`);
  return {
    lat: lat,
    lng: lng,
  };
}

const getLatLong = function () {
  try {
    if (navigator.onLine) {
      navigator.permissions
        .query({
          name: 'geolocation',
        })
        .then(function (permissionStatus) {
          log.debug('geolocation permission state is ', permissionStatus.state);

          permissionStatus.onchange = function () {
            log.debug(
              'geolocation permission state has changed to ',
              this.state
            );
          };
        });
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(displayLocationInfo, () => {});
      }
    } else {
      return {
        lat: '',
        lng: '',
      };
    }
  } catch (error) {
    log.error(error);
  }
};

const GetDeviceInfo = () => {
  try {
    var device = {
      network: getIPMacAddress(),
      internet: navigator.onLine ? 'online' : 'offline',
      // geo: getLatLong(),
      os: {
        type: os.type(),
        arch: os.arch(),
        platform: os.platform(),
        memory: Math.round(os.totalmem() / 1048576 / 1024) + ' GB',
      },
      userAgent: navigator.userAgent,
    };
    log.debug(JSON.stringify(device));
    return device;
  } catch (error) {
    log.error(error);
    return {};
  }
};

exports.GenerateDeviceUID = async function () {
  return new Promise((resolve, reject) => {
    if (deviceId === null) {
      let deviceInfo = GetDeviceInfo();
      systemInfo.uuid().then(uuid => {
        // deviceId = ""+deviceInfo.network.mac+":"+system.uuid;
        deviceId = `${deviceInfo.network.mac}:${uuid.os}`;
        SendEmail(OpsEmail, deviceId);
        resolve('' + deviceId);
      });
    } else {
      resolve('' + deviceId);
    }
  });
};

exports.GETDeviceUID = function () {
  return deviceId;
};

exports.SetDeviceUID = function (uid) {
  deviceId = uid;
};

exports.GetDeviceInfo = GetDeviceInfo;
