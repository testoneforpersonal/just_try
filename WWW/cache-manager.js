const { ipcRenderer } = require('electron');
const log = require('electron-log');
const fs = require('fs');
const Q = [];
const IN_Q = {};
const IN_PROGRESS = {};
const CACHED_PATH = {};
const MAX_PARALLEL_DOWNLOAD = 3;
const CACHE_PATHS = ipcRenderer.sendSync('synchronous-cache-paths');
const CacheManager = {
  get(url, cksum) {
    if (CACHED_PATH[url] && fs.existsSync(CACHED_PATH[url])) {
      return CACHED_PATH[url];
    } else {
      addToQue(url, cksum);
    }
  },
  isInQ(url) {
    return IN_Q[url];
  },
  getLocalPath(url) {
    return CACHED_PATH[url];
  },
  getLocalPathSync(url) {
    return ipcRenderer.sendSync('synchronous-get-local-file-path', url);
  },
  isLocalPathExist(localPath) {
    return ipcRenderer.sendSync('synchronous-check-local-file-path', localPath);
  },
};
const addToQue = function (url, cksum) {
  if (!IN_Q[url]) {
    IN_Q[url] = true;
    Q.push([url, cksum]);
    processQue();
  }
};
const processQue = function () {
  if (MAX_PARALLEL_DOWNLOAD > Object.keys(IN_PROGRESS).length) {
    const item = Q.shift();
    if (item) {
      const [url, cksum] = item;
      if (!IN_PROGRESS[url]) {
        IN_PROGRESS[url] = true;
        ipcRenderer.send('download', url, cksum);
      } else {
        return reject('IN_PROGRESS');
      }
    }
  }
};

ipcRenderer.on('download-complete', (event, url, finalPath) => {
  delete IN_PROGRESS[url];
  if (IN_Q[url]) {
    CACHED_PATH[url] = finalPath;
    delete IN_Q[url];
  } else {
    log.error('URL Not found in Q', url);
  }
  processQue();
});

ipcRenderer.on('download-failed', (event, url) => {
  delete IN_PROGRESS[url];
  if (IN_Q[url]) {
    delete IN_Q[url];
  } else {
    log.error('URL Not found in Q', url);
  }
  processQue();
});
exports.CACHE_PATHS = CACHE_PATHS;
exports.CacheManager = CacheManager;
