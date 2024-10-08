var crypto = require('crypto');
var publicIP = require('public-ip');

const getMD5 = str => crypto.createHash('md5').update(str).digest('hex');
var cachedPublicIP = null;
const getPublicIP = () => {
  if (cachedPublicIP) {
    return Promise.resolve(cachedPublicIP);
  } else {
    return publicIP
      .v4()
      .then(ip => (cachedPublicIP = ip))
      .catch(() => null);
  }
};
const getSiteID = () => {
  let siteId = window.localStorage.getItem('siteId');
  if (!siteId) {
    var nav = window.navigator;
    var screen = window.screen;
    var guid = nav.mimeTypes.length;
    guid += nav.userAgent.replace(/\D+/g, '');
    guid += nav.plugins.length;
    guid += screen.height || '';
    guid += screen.width || '';
    guid += screen.pixelDepth || '';
    siteId = getMD5(guid);
    window.localStorage.setItem('siteId', siteId);
  }
  return siteId;
};

const chkForNull = el => {
  return el === undefined || el === null ? '' : el;
};

const splitArray = (arr, n) => {
  var res = [];
  if (chkForNull(arr) != '') {
    while (arr.length) {
      res.push(arr.splice(0, n));
    }
  }
  return res;
};

exports.getPublicIP = getPublicIP;
exports.getMD5 = getMD5;
exports.getSiteID = getSiteID;
exports.splitArray = splitArray;
exports.chkForNull = chkForNull;
