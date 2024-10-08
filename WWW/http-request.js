const log = require('electron-log');
const HR = {
  request(url, options, retry = 1) {
    return fetch(url, options).catch(async () => {
      if (retry > 1) {
        log.debug('Failed to load :' + url, 'Retrying:', retry - 1);
        await new Promise(resolve => setTimeout(resolve, 5000));
        return this.request(url, options, retry - 1);
      }
    });
  },
  getJSON(url, options, retry) {
    return this.request(url, options, retry)
      .then(rawResponse => {
        if (rawResponse.status == 200) {
          return rawResponse.json();
        }
      })
      .catch(e => {
        log.debug('Failed to get JSON from:', url, e);
        return {};
      });
  },
  getHtml(url, options, retry) {
    return this.request(url, options, retry).then(rawResponse => {
      if (rawResponse.status == 200) {
        return rawResponse.text();
      }
    });
  },
  toUrlParams(params) {
    return Object.entries(params)
      .map(([key, value]) => key + '=' + encodeURIComponent(value))
      .join('&');
  },
};

exports.HR = HR;
