const { ConfigManager } = require('./config-manager');

const ConnectionManager = {
  isOnline() {
    return navigator.onLine;
  },
  onOnline(callback) {
    return window.addEventListener('online', callback);
  },
  onOffline(callback) {
    return window.addEventListener('offline', callback);
  },
  async isNetworkConnected() {
    try {
      const online = await fetch(
        'https://lemmadigital.com/?_ts=' + new Date().getTime(),
        { method: 'HEAD' }
      )
        .then(resp => {
          return resp.status;
        })
        .catch(err => {
          return 0;
        });
      return online >= 200 && online <= 400 ? true : false;
    } catch (error) {
      return false;
    }
  },
};

exports.ConnectionManager = ConnectionManager;
