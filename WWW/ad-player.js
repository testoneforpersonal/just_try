const { CacheManager, CACHE_PATHS } = require('./cache-manager');
const { Config, ConfigManager } = require('./config-manager');
const { ConnectionManager } = require('./connection-manager');
const log = require('electron-log');
const { getMD5, splitArray } = require('./util');
const { WeatherManager } = require('./weather-manager');
const { HR } = require('./http-request');
const { info } = require('electron-log');
const { ipcRenderer, webFrame } = require('electron');
const { GetDeviceInfo, GETDeviceUID } = require('./device-info');
const { ScheduleManager } = require('./schedule-manager');

const fs = require('fs');
const path = require('path');
const deviceInfo = GetDeviceInfo();
const checkOnline = require('check-internet-connected');
const localConfigFound = ConfigManager.updateConfigFromLocal();

const DEVICE_IP =
  deviceInfo.network && deviceInfo.network.ip ? deviceInfo.network.ip : '';
const USER_AGENT = navigator.userAgent.replace(
  /com.lemmadigital.app\/\d+.\d+.\d+/,
  'com.lemma.digital/'
);
const IFA =
  deviceInfo.network && deviceInfo.network.mac
    ? getMD5(deviceInfo.network.mac)
    : '';
const SITE_ID =
  (deviceInfo && deviceInfo.network && getMD5(deviceInfo.network.mac)) ||
  GETDeviceUID();

log.info('Device IP: ', DEVICE_IP);
log.info('User Agent: ', USER_AGENT);
log.info('IFA: ', IFA);
log.info('Site ID: ', SITE_ID);

const getMSFromDayStart = function (s) {
  let seconds =
    parseInt(s.substr(8, 2)) * 36000 +
    parseInt(s.substr(10, 2)) * 60 +
    parseInt(s.substr(12, 2));
  return seconds * 1000;
};

const padZero = function (str, len) {
  return ('' + str).padStart(len, '0');
};

const getTimestamp = function () {
  const d = new Date();
  const value =
    d.getUTCFullYear() +
    padZero(d.getUTCMonth() + 1, 2) +
    padZero(d.getUTCDate(), 2) +
    padZero(d.getUTCHours(), 2) +
    padZero(d.getUTCMinutes(), 2) +
    padZero(d.getUTCSeconds(), 2);
  return value;
};
const getCurrentTimeInMS = function () {
  const d = new Date();
  // var d = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
  let s = d.getHours() * 36000 + d.getMinutes() * 60 + d.getSeconds();
  return s * 1000 + d.getMilliseconds();
};

//Note: as this causes circular dependency, we need to do it here.
ipcRenderer.on('download-complete', (event, url, finalPath) => {
  const defaultAd = ConfigManager.get('defaultAd');
  if (defaultAd && defaultAd.creative === url) {
    log.info('Default Ad  Creative Downloaded', defaultAd.creative, finalPath);
    AdPlayer.updateDefaultAdTagFromLocal();
  }
});

const AdPlayer = {
  _online: true,
  schedule: null,
  layouts: null,
  intervalId: null,
  defaultLayout: {
    XStart: 0,
    YStart: 0,
    XEnd: 100,
    YEnd: 100,
  },
  currentIndex: 0,
  currentAd: null,
  nextAd: null,
  isPlaying: false,
  nextIndex: -1,
  trackerURL: null,
  failTrackerList: [],
  trackerTimeout: null,
  weatherContainer: document.getElementById('weather'),
  weatherTempContainers: {
    middle: document.getElementById('weather-middle'),
    cleft: document.getElementById('weather-cleft'),
    cright: document.getElementById('weather-cright'),
    bleft: document.getElementById('weather-bleft'),
    bright: document.getElementById('weather-bright'),
  },
  init(scheduleData) {
    // log.debug("[Init] Schedule Data: ", scheduleData);
    scheduleData =
      scheduleData && scheduleData.data ? scheduleData.data : scheduleData;
    ipcRenderer.send('resize-me-please', {
      width: ConfigManager.get('width'),
      height: ConfigManager.get('height'),
    });
    let domain = ConfigManager.get('domain');
    this.rtbEndpoint =
      'https://' + domain.prod + ConfigManager.get('adServdAPI');
    this.rawScheduleData = scheduleData;
    this.trackerURL = scheduleData && scheduleData.trk;
    this.parseTrackerParams();
    this.layouts = scheduleData
      ? this.getLayouts(scheduleData.custom_layout)
      : {};
    this.schedule =
      scheduleData && scheduleData.schedule ? scheduleData.schedule : [];
    this.prepareSchedule();
    this.currentIndex = this.findIndexToPlay();
    if (
      this.schedule.length > 0 &&
      this.currentIndex >= 0 &&
      this.currentIndex < this.schedule.length
    ) {
      this.startDownload(this.currentIndex);
      setTimeout(() => {
        this.beginPlay(this.currentIndex);
      }, 50);
    } else {
      this.playDefaultAd();
    }
  },

  updateSchedule(scheduleData) {
    log.debug('RAW SCHEDULE CHK: ', this.rawScheduleData.chk_Sum);
    log.debug('NEW SCHEDULE CHK: ', scheduleData.chk_Sum);
    if (scheduleData && this.rawScheduleData.chk_Sum !== scheduleData.chk_Sum) {
      this.trackerURL = scheduleData.trk;
      this.parseTrackerParams();

      if (this.prepareNextTimer) {
        clearTimeout(this.prepareNextTimer);
      }
      if (this.currentAdEndTimer) {
        clearTimeout(this.currentAdEndTimer);
      }
      this.rawScheduleData = scheduleData;
      this.layouts = this.getLayouts(scheduleData.custom_layout);
      this.schedule =
        scheduleData && scheduleData.schedule ? scheduleData.schedule : [];
      this.prepareSchedule();
      this.nextIndex = this.findNextIndexToPlay();
      this.startDownload(this.nextIndex);
      if (this.nextAd) {
        if (document.body.contains(this.nextAd.container)) {
          document.body.removeChild(this.nextAd.container);
        }
      }
      this.prepareNextAd(this.nextIndex);
    } else {
      log.debug('Schedule is null or not changed');
    }
  },
  isRTBCreative(creative) {
    return creative.cr_type == 3 || creative.cr_type == 4;
  },
  startDownload(startPosition) {
    const maxIndex = this.schedule.length;
    for (let i = startPosition; i < maxIndex; i++) {
      const item = this.schedule[i];
      if (!this.isRTBCreative(item)) {
        const url = item.Creative;
        if (url.startsWith('http')) {
          CacheManager.get(url, item.cksum);
        }
      }
    }
    for (let i = 0; i < startPosition; i++) {
      const item = this.schedule[i];
      if (!this.isRTBCreative(item)) {
        const url = item.Creative;
        if (url.startsWith('http')) {
          CacheManager.get(url, item.cksum);
        }
      }
    }
  },
  playNextAd() {
    this.playAdAt(this.nextIndex);
  },
  onAdFinish() {
    this.hideWeather();
    this.removeDefaultAd();
    this.fireEvent('complete');
    this.playNextAd();
  },
  onTick() {
    //incase any other timer fails this will make sure that loop will continue
    var currentAd = this.currentAd;
    if (currentAd) {
      const currentTime = getCurrentTimeInMS();
      const playedMS = currentTime - currentAd.startTime;
      if (
        currentAd.info &&
        currentAd.info.isRTB &&
        !currentAd.info.isDefaultAd
      ) {
        const info = currentAd.info;
        if (info.startFired == false) {
          info.startFired = true;
          this.fireEvent('start');
        }
        const percentagePlayed = (playedMS / currentAd.duration) * 100;
        if (
          info.firstQuartileFired == false &&
          percentagePlayed >= 25 &&
          percentagePlayed < 50
        ) {
          info.firstQuartileFired = true;
          this.fireEvent('firstQuartile');
        }
        if (
          info.midpointFired == false &&
          percentagePlayed >= 50 &&
          percentagePlayed < 75
        ) {
          info.midpointFired = true;
          this.fireEvent('midpoint');
        }
        if (
          info.thirdQuartileFired == false &&
          percentagePlayed >= 75 &&
          percentagePlayed < 100
        ) {
          info.thirdQuartileFired = true;
          this.fireEvent('thirdQuartile');
        }
      }
      if (playedMS >= currentAd.duration) {
        this.hideWeather();
        this.playNextAd();
      }
    }
  },
  prepareSchedule() {
    if (this.schedule) {
      for (var i = 0; i < this.schedule.length; i++) {
        const item = this.schedule[i];
        item.startTime = getMSFromDayStart(item.sdate);
        item.duration = item.Duration * 1000;
      }
    } else {
      this.schedule = [];
    }
  },
  findIndexToPlay() {
    var indexToPlay = -1;
    const currentTime = getCurrentTimeInMS();
    for (var i = 0; i < this.schedule.length; i++) {
      const item = this.schedule[i];
      if (item.startTime + item.duration >= currentTime) {
        indexToPlay = i;
        break;
      }
    }
    return indexToPlay;
  },
  findNextIndexToPlay() {
    var indexToPlay = 0;
    const currentTime = getCurrentTimeInMS();
    for (var i = 0; i < this.schedule.length; i++) {
      const item = this.schedule[i];
      if (item.startTime >= currentTime) {
        indexToPlay = i;
        break;
      }
    }
    return indexToPlay;
  },
  beginPlay(startPosition) {
    if (this.canPlayAtIndex(startPosition)) {
      this.removeDefaultAd();
      this.prepareNextAd(startPosition);
      this.playAdAt(startPosition);
      if (this.intervalId) {
        clearInterval(this.intervalId);
      }
      this.intervalId = setInterval(() => {
        this.onTick();
      }, 50);
      this.isPlaying = true;
    } else {
      setTimeout(() => {
        this.beginPlay(startPosition);
      }, 100);
    }
  },
  canPlayAtIndex(index) {
    let creatives = this.getCreativesByIndex(index);
    let allDownloaded = true;
    for (let i = 0; i < creatives.length; i++) {
      const creative = creatives[i];
      if (!this.isRTBCreative(creative)) {
        const type = creative.Type.split('/')[0];
        if (type == 'image' || type == 'video') {
          if (!CacheManager.getLocalPath(creative.Creative)) {
            // log.warn("Creative not downloaded yet");
            allDownloaded = false;
            break;
          }
        }
      }
    }
    log.debug('[canPlayAtIndex] All Downloaded: ', allDownloaded);
    return allDownloaded;
  },
  playAdAt(index) {
    if (this.nextAd == null) {
      if (this.schedule.length) {
        this.currentIndex = this.findIndexToPlay();
        this.removeDefaultAd();
        log.debug('Next not available, restarting index: ', this.currentIndex);
        this.beginPlay(this.currentIndex);
      } else {
        // log.debug("Schedule is empty");
        AdPlayer.playDefaultAd();
      }
    } else {
      this.currentIndex = index;

      const previousAd = this.currentAd;
      // log.info("previousAd: ", this.currentAd);
      this.currentAd = this.nextAd;
      // log.info("currentAd: ", this.nextAd);
      this.nextAd = null;

      if (previousAd) {
        if (document.body.contains(previousAd.container)) {
          document.body.removeChild(previousAd.container);
        }
        this.removePreviousAd(previousAd);
      }

      const container = this.currentAd.container;
      const info = this.currentAd.info;
      const currentTime = getCurrentTimeInMS();
      const creative = this.currentAd.creatives[0];
      const msElapsed = currentTime - creative.startTime;
      const msToPlay = this.currentAd.duration - msElapsed;

      this.playVideo(container, msElapsed);

      let nextIndex = this.currentIndex + this.currentAd.creatives.length;
      if (nextIndex >= this.schedule.length) {
        nextIndex = 0;
      }
      this.nextIndex = nextIndex;
      if (info && info.isRTB && !info.isDefaultAd) {
        this.fireTrackers(info.trackers);
      } else if (!info.isDefaultAd) {
        if (this.currentAd.creatives) {
          const trackers = this.currentAd.creatives.map(creative =>
            this.buildTrackerURL(creative)
          );
          //The logic to handle third party tracker if added at creative level
          const creativesFromCurrentAd = JSON.stringify(
            this.currentAd.creatives
          );
          const parsedCreativeAdsObj = JSON.parse(creativesFromCurrentAd);
          const trackersObj = parsedCreativeAdsObj[0].trackers;
          if (trackersObj) {
            log.debug('[AD-P] Thirdparty trakers present');
            if (Array.isArray(trackersObj) && trackersObj.length > 0) {
              //concat lemma tracker and thirdparty tracker
              //log.debug("Thirdpart tracker",trackers);
              var thirdPartyTracker = trackersObj.concat(trackers);
              log.debug('[AD-P]THIRD PARTY TRACKER FOUND');
              //let fire trackers
              this.fireTrackers(thirdPartyTracker);
            } else {
              log.debug('[AD-P]Empty tracker object found');
              this.fireTrackers(trackers);
            }
          } else {
            //thirdparty trakers not present in to the objects
            //let fire the lemma tracker only
            // log.debug("[AD-P] Thirdparty trakers not present in to the objects,let fire the lemma tracker only.");
            this.fireTrackers(trackers);
          }
        }
      }

      //Note: let it render and load next add once rendering is done
      clearTimeout(this.prepareNextTimer);
      let duration =
        creative.Duration > 7
          ? (creative.Duration / 2) * 1000
          : creative.Duration * 1000;
      this.prepareNextTimer = setTimeout(() => {
        const info = this.currentAd.info;
        if (info && !info.isRTB && !info.isDefaultAd) {
          this.displayWeatherIfRequired();
        }
        webFrame.clearCache();
        this.prepareNextAd(nextIndex);
      }, duration);

      clearTimeout(this.currentAdEndTimer);
      this.currentAdEndTimer = setTimeout(() => {
        this.onAdFinish();
      }, msToPlay);
    }
  },
  hideWeather() {
    if (this.weatherContainer) {
      this.weatherContainer.style.display = 'none';
      this.weatherTempContainers.middle.parentNode.style.display = 'none';
      this.weatherTempContainers.cleft.parentNode.style.display = 'none';
      this.weatherTempContainers.cright.parentNode.style.display = 'none';
      this.weatherTempContainers.bleft.parentNode.style.display = 'none';
      this.weatherTempContainers.bright.parentNode.style.display = 'none';
    }
  },
  displayWeatherIfRequired() {
    //Note: weather must have only one creative, we display overlay over weather video
    const creative = this.currentAd.creatives[0];
    if (creative.weather) {
      const positions = Object.keys(creative.weather);
      if (positions.length > 0) {
        positions.forEach(position => {
          const city = creative.weather[position].toLowerCase();
          const temperature = WeatherManager.getCityTemperature(city);
          let tempText = '';
          if (position == 'middle') {
            tempText = temperature;
          } else {
            tempText = city + ' ' + temperature;
          }
          const container = this.weatherTempContainers[position];
          if (container) {
            container.innerHTML = tempText;
            container.parentNode.style.display = 'block';
          }
        });
        this.weatherContainer.style.display = 'block';
      }
    }
  },
  fireEvent(eventName) {
    if (this.currentAd && this.currentAd.info && this.currentAd.info.events) {
      const eventsToFire = this.currentAd.info.events
        .filter(item => item.EventName == eventName)
        .map(item => item.EventUrl);
      this.fireTrackers(eventsToFire);
    }
  },
  fireTrackers(trackers) {
    if (this._online && trackers && trackers.map) {
      trackers.forEach(async tracker => {
        try {
          const resp = await fetch(tracker);
          log.info(
            '[FIRE TRACKER] RESPONSE: ',
            resp.status,
            resp.statusText,
            tracker
          );
          if (!resp.ok) {
            creteOfflineTrackerFile(trackers);
          }
        } catch (e) {
          log.info('[FIRE TRACKER] TRY ERROR: ', e);
          creteOfflineTrackerFile(trackers);
        }
      });
      // log.debug("[AD-P] Checkeing and excuting offline tracker");
      this.fireOfflineTrackers();
    } else {
      //If, unit not connected to internet then save the trackers into file.
      creteOfflineTrackerFile(trackers);
    }
  },

  fireOfflineTrackers() {
    let offline_tracker_file =
      CACHE_PATHS.OFFLINE_TRACKER_DIR + 'offline-tracker.txt';
    if (fs.existsSync(offline_tracker_file)) {
      if (this._online) {
        this.callTracker();
      } else if (!this._online && this.failTrackerList.length) {
        saveFile(this.failTrackerList);
      }
    }
  },
  callTracker() {
    try {
      let that = this;
      let offline_tracker_file =
        CACHE_PATHS.OFFLINE_TRACKER_DIR + 'offline-tracker.txt';
      that.trackerTimeout = setTimeout(function () {
        if (that.trackerTimeout) {
          clearTimeout(that.trackerTimeout);
        }
        let trackerList = [];
        let theFile = [];
        let failTracker = [];
        if (fs.existsSync(offline_tracker_file)) {
          fs.readFile(offline_tracker_file, function (err, data) {
            theFile = data.toString().split('\n');
            trackerList = splitArray(theFile, 10);

            let trackers = trackerList.pop();
            that.failTrackerList = trackerList.flat(1);
            if (that.failTrackerList.length) {
              saveFile(that.failTrackerList);
            } else {
              fs.unlinkSync(offline_tracker_file);
            }
            if (trackers && trackers.length) {
              trackers.map(tracker => {
                try {
                  fetch(tracker)
                    .then(result => {
                      if (result && result.status !== 200) {
                        failTracker.push(tracker);
                      }
                    })
                    .catch(err => {
                      failTracker.push(tracker);
                    });
                } catch (e) {
                  failTracker = failTracker.concat(trackers);
                }
              });
            }
            if (failTracker.length) {
              that.failTrackerList = that.failTrackerList.concat(failTracker);
              saveFile(that.failTrackerList);
            }
            if (that._online && that.failTrackerList.length) {
              that.callTracker();
            }
          });
        }
      }, 5000);
    } catch (error) {
      log.error(error);
    }
  },
  playVideo(container, position) {
    if (container) {
      var vids = container.getElementsByTagName('video');
      if (vids) {
        for (var i = 0; i < vids.length; i++) {
          let obj = vids[i];
          // log.info("[playVideo] Is Video Loaded State: ", obj.readyState);
          if (obj) {
            obj.addEventListener('ended', function () {
              this.pause();
            });
            obj.muted = true;
            obj.currentTime = Math.round(position / 1000);
            obj.play();
          }
        }
      }
      // for (let i = 0; i < container.childNodes.length; i++) {
      //     const node = container.childNodes[i];
      //     log.info("[playVideo] Is Video Loaded State: ", node.readyState);
      //     if (node.tagName === 'VIDEO' && node.readyState == 4) {
      //         node.currentTime = Math.round(position / 1000);
      //         node.play();
      //     } else {
      //         this.playVideo(node, position);
      //     }
      // }
    }
  },
  prepareNextAd(index) {
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.height = '100%';
    container.style.width = '100%';
    container.style.backgroundColor = 'black';
    container.id = index;

    const creatives = this.getCreativesByIndex(index);
    if (creatives && creatives.length) {
      const lineItemId = creatives && creatives[0].lid;
      const podSeqId = creatives && creatives[0].pod_sequence_id;
      const layouts = this.layouts[lineItemId + '-' + podSeqId];
      const info = {
        isDefaultAd: false,
      };
      document.body.insertBefore(container, document.body.firstChild);
      this.prepareTagsForLayout(container, creatives, layouts, info);
      const duration = creatives && creatives[0].duration;
      this.nextAd = {
        container,
        index,
        duration,
        startTime: creatives && creatives[0].startTime,
        creatives,
        info,
      };
    }
  },
  prepareTagsForLayout(container, creatives, layouts, info) {
    // log.info("INFO:  ", info);
    // log.info("CREATIVES:  ", creatives);
    // log.info("LAYOUT: ", layouts);
    let layoutCount = 0;
    for (let i = 0; i < creatives.length; i++) {
      const creative = creatives[i];
      let layout = this.defaultLayout;
      if (layouts) {
        if (layoutCount > layouts.length - 1) {
          layoutCount = 0;
        }
        layout =
          layouts.filter(o => {
            return (
              o && o.CreativeId == creative.crid && o.cr_seq == creative.cr_seq
            );
          })[0] || layouts[layoutCount];

        // log.info("prepareTagsForLayout LAYOUT: ", layout);
        // log.info("creative: ", creative);
      }
      const wrapper = document.createElement('div');
      wrapper.style.top = layout.YStart + '%';
      wrapper.style.left = layout.XStart + '%';
      wrapper.style.bottom = 100 - layout.YEnd + '%';
      wrapper.style.right = 100 - layout.XEnd + '%';
      wrapper.style.position = 'absolute';
      wrapper.style.overflow = 'hidden';
      container.appendChild(wrapper);

      if (this.isRTBCreative(creative)) {
        if (this.isOnline()) {
          info.isRTB = true;
          info.startFired = false;
          info.firstQuartileFired = false;
          info.midpointFired = false;
          info.thirdQuartileFired = false;
          info.isDefaultAd = false;
          this.handleRTBCreative(wrapper, layout, info, creative);
        } else {
          info.isDefaultAd = true;
          if (wrapper.firstElementChild) {
            wrapper.removeChild(wrapper.firstElementChild);
          }
          wrapper.append(this.getDefaultTag());
        }
      } else {
        const type = creative.Type.split('/')[0];
        //What: image/jpge ==> image, video/mp4 ==> video

        if (this.isUrl(creative.Creative)) {
          let localMediaPath = CacheManager.getLocalPath(creative.Creative);

          if (fs.existsSync(localMediaPath)) {
            let tag = this.getTagForType(type);
            if (wrapper.firstElementChild) {
              wrapper.removeChild(wrapper.firstElementChild);
            }
            wrapper.append(tag);
            this.assignMediaToTag(
              type,
              tag,
              localMediaPath,
              creative.Type,
              creative.Duration
            );
          } else {
            log.debug('Media not downloaded yet:', creative.Creative);
            CacheManager.get(creative.Creative, creative.cksum);
            info.isDefaultAd = true;
            if (wrapper.firstElementChild) {
              wrapper.removeChild(wrapper.firstElementChild);
            }
            wrapper.append(this.getDefaultTag());
          }
        } else {
          const [htmlCreative, isItLocalIPL] = this.handleSpecialCaseForIPL(
            creative.Creative
          );
          if (isItLocalIPL) {
            let tag = this.getTagForType(type);
            if (wrapper.firstElementChild) {
              wrapper.removeChild(wrapper.firstElementChild);
            }
            wrapper.append(tag);
            this.assignMediaToTag(
              type,
              tag,
              htmlCreative,
              creative.Type,
              creative.Duration
            );
          } else {
            if (this.isOnline()) {
              let tag = this.getTagForType(type);
              if (wrapper.firstElementChild) {
                wrapper.removeChild(wrapper.firstElementChild);
              }
              wrapper.append(tag);
              this.assignMediaToTag(
                type,
                tag,
                htmlCreative,
                creative.Type,
                creative.Duration
              );
            } else {
              info.isDefaultAd = true;
              if (wrapper.firstElementChild) {
                wrapper.removeChild(wrapper.firstElementChild);
              }
              wrapper.append(this.getDefaultTag());
            }
          }
        }
      }
      layoutCount += 1;
    }
  },
  isUrl(path) {
    return path.startsWith('http') || path.startsWith('file:');
  },
  handleRTBCreative(wrapper, layout, info, creative) {
    const defaultParams = ConfigManager.get('params');
    let macAndSysUID = ConfigManager.get('siteId');
    const params = {
      ua: USER_AGENT,
      os: navigator.platform,
      ifa: IFA,
      rtb: 1,
      cb: Date.now(),
      at: 3,
      pid: defaultParams.pid,
      aid: defaultParams.aid,
      sid: macAndSysUID,
      height: ConfigManager.get('height'),
      width: ConfigManager.get('width'),
    };

    if (creative && creative.lid) {
      params.lid = creative.lid;
    }
    const url = this.rtbEndpoint + HR.toUrlParams(params);

    // wrapper.append(this.getDefaultTag());

    HR.getJSON(url).then(response => {
      // log.debug("[handleRTBCreative] Response: ", JSON.stringify(response));
      if (response && response.lmCustResp && response.lmCustResp[0]) {
        const media = this.getRTBMedia(response);
        const type = media.Type.split('/')[0];
        info.trackers = response.lmCustResp[0].trackers;
        info.events = response.lmCustResp[0].events;
        info.media = media;
        if (type) {
          if (type.match('image') !== null || type.match('video') !== null) {
            const localPath = CacheManager.getLocalPath(media.Creative);
            log.debug('[handleRTBCreative] Media RTB creative', localPath);
            if (fs.existsSync(localPath)) {
              const tag = this.getTagForType(type);
              if (wrapper.firstElementChild) {
                wrapper.removeChild(wrapper.firstElementChild);
              }
              wrapper.append(tag);
              this.assignMediaToTag(
                type,
                tag,
                localPath,
                media.Type,
                media.Duration
              );
            } else {
              CacheManager.get(media.Creative, media.cksum);
              // setTimeout(() => {
              if (this.nextAd && this.nextAd.info == info) {
                const localPath = CacheManager.getLocalPath(media.Creative);
                if (fs.existsSync(localPath)) {
                  const tag = this.getTagForType(type);
                  if (wrapper.firstElementChild) {
                    wrapper.removeChild(wrapper.firstElementChild);
                  }
                  wrapper.append(tag);
                  this.assignMediaToTag(
                    type,
                    tag,
                    localPath,
                    media.Type,
                    media.Duration
                  );
                  log.debug(
                    'RTB Media downloaded successfully',
                    media.Creative
                  );
                } else {
                  CacheManager.get(media.Creative, media.cksum);
                  log.debug('RTB Media not downloaded yet', media.Creative);
                  // this.replaceDefaultContent(wrapper);
                  const tag = this.getTagForType(type);
                  if (wrapper.firstElementChild) {
                    wrapper.removeChild(wrapper.firstElementChild);
                  }
                  wrapper.append(tag);
                  this.assignMediaToTag(
                    type,
                    tag,
                    media.Creative,
                    media.Type,
                    media.Duration
                  );
                }
              } else {
                log.debug(
                  'Media changed during download of RTB creative',
                  media.Creative
                );
                // info.isDefaultAd = true;
                // this.replaceDefaultContent(wrapper);
                const tag = this.getTagForType(type);
                if (wrapper.firstElementChild) {
                  wrapper.removeChild(wrapper.firstElementChild);
                }
                wrapper.append(tag);
                this.assignMediaToTag(
                  type,
                  tag,
                  media.Creative,
                  media.Type,
                  media.Duration
                );
              }
              // }, 4000);
            }
          } else if (type.match('script') !== null) {
            let duration = creative.Duration * 0.65 * 1000;
            const tag = this.getTagForType(type);
            setTimeout(() => {
              if (wrapper.firstElementChild) {
                wrapper.removeChild(wrapper.firstElementChild);
              }
              wrapper.append(tag);
              this.assignMediaToTag(
                type,
                tag,
                media.Creative,
                media.Type,
                media.Duration
              );
            }, duration);
          }
        } else {
          if (wrapper.firstElementChild) {
            wrapper.removeChild(wrapper.firstElementChild);
          }
          info.isDefaultAd = true;
          this.replaceDefaultContent(wrapper);
        }
      } else {
        info.isDefaultAd = true;
        this.replaceDefaultContent(wrapper);
      }
      this.playVideo(wrapper, 0);
    });
  },
  replaceDefaultContent(wrapper) {
    const defaultAd = ConfigManager.get('defaultAd');
    if (defaultAd && defaultAd.creative) {
      CacheManager.get(defaultAd.creative);
      const images = ['jpg', 'jpeg', 'gif', 'png'];
      const videos = ['mp4', '3gp', 'ogg', 'mov'];
      let ext = defaultAd.creative
        .split(/[#?]/)[0]
        .split('.')
        .pop()
        .trim()
        .toLowerCase();
      let tagType = images.includes(ext)
        ? 'image'
        : videos.includes(ext)
          ? 'video'
          : '';
      let mediaType = images.includes(ext)
        ? 'image/' + ext
        : videos.includes(ext)
          ? 'video/' + ext
          : '';
      const localPath =
        CacheManager.getLocalPath(defaultAd.creative) || defaultAd.creative;
      const tag = this.getTagForType(tagType);
      this.assignMediaToTag(
        tagType,
        tag,
        localPath,
        mediaType,
        defaultAd.duration
      );
      if (wrapper.firstElementChild) {
        wrapper.removeChild(wrapper.firstElementChild);
      }
      wrapper.append(tag);
    }
  },
  handleSpecialCaseForIPL(creative) {
    var isIPL = creative.match('media/ipl');
    if (isIPL) {
      const rxMatch = creative.match(
        'https://sync.lemmatechnologies.com/media/ipl/([^\'^"])+'
      );
      if (rxMatch && rxMatch[0]) {
        const url = rxMatch[0];
        const localUrl = url.replace(
          'https://sync.lemmatechnologies.com/media/ipl/',
          CACHE_PATHS.DOWNLOAD_COMPLETE_DIR + 'ipl/'
        );
        if (localUrl !== url) {
          if (CacheManager.isLocalPathExist(localUrl.split('?').shift())) {
            //great local url found
            return [
              creative.replace(
                'https://sync.lemmatechnologies.com/media/ipl/',
                'file://' + CACHE_PATHS.DOWNLOAD_COMPLETE_DIR + 'ipl/'
              ),
              true,
            ];
          }
        }
      }
    }
    return [creative, false];
  },
  getIframeContent(iframe, duration) {
    log.debug('[getIframeContent] IFRAME : ', iframe);
    let content = iframe;
    let height = ConfigManager.get('height');
    let width = ConfigManager.get('width');
    // let excludeList = ['lemma', 'google', 'youtu'];
    if (iframe.startsWith('<iframe')) {
      // let url = content.match(/(https?:\/\/[^\s]+)/g)[0].replace("'", '');
      // log.debug('[getIframeContent] URL: ', url);
      // let iframeTag = document.createElement('iframe');
      // iframeTag.width = width;
      // iframeTag.height = height;
      // iframeTag.frameborder = '0';
      // iframeTag.allow =
      //   'accelerometer; autoplay; clipboard-write; encrypted-media;';
      // iframeTag.allowfullscreen = 'true';
      // iframeTag.src = url.replace('http:', 'https:');
      // iframeTag.style.width = width + 'px';
      // iframeTag.style.height = height + 'px';
      // iframeTag.style.margin = '0px';
      // content = iframeTag.outerHTML;
    } else {
      content = `${content} 
                        <script>
                           window.onload=function(){
                                var vids = document.getElementsByTagName("video");
                                if(vids){
                                    for(var i = 0; i < vids.length; i++){
                                        let obj = vids[i];
                                        if(obj){
                                            obj.style.height= screen.height + "px";
                                            obj.style.width= screen.width + "px";
                                            obj.style.objectFit = "fill";
                                        }
                                    }
                                }
                                var imgs = document.getElementsByTagName("img");
                                if(imgs){
                                    for(var i = 0; i < imgs.length; i++){
                                        let obj = imgs[i];
                                        if(obj){
                                            obj.style.height= screen.height + "px";
                                            obj.style.width= screen.width + "px";
                                            obj.style.objectFit = "fill";
                                        }
                                    }
                                }
                            }
                        </script>`;
    }
    log.debug('[getIframeContent] CONTENT: ', content);
    return content;
  },
  addParamsToScriptTag(tag) {
    const params = ConfigManager.get('params');
    if (tag.startsWith('http')) {
      if (tag.indexOf('?') == -1) {
        tag = tag + '?';
      }
      tag = tag.replace('?', '?aid=' + params.aid + '&ts=' + Date.now() + '&');
    } else {
      tag = tag.replace(
        /\.html\??/,
        '.html?aid=' + params.aid + '&ts=' + Date.now() + '&'
      );
    }
    return tag;
  },
  getRTBMedia(response) {
    const lmCustResp = response.lmCustResp[0];
    const medias = lmCustResp.media.sort((a, b) => b.Height - a.Height);
    const media = medias[0];
    return media;
  },

  assignMediaToTag(tagType, tag, mediaPath, mediaType, duration) {
    mediaPath = mediaPath || '';
    switch (tagType) {
      case 'image':
        tag.src = mediaPath;
        break;
      case 'script':
        mediaPath = this.addParamsToScriptTag(mediaPath);
        if (mediaPath.startsWith('http')) {
          tag.src = mediaPath;
        } else {
          mediaPath = this.getIframeContent(mediaPath, duration);
          // log.info("Content: ", mediaPath.toString());
          let iframedoc = tag.contentDocument;
          if (tag.contentDocument) iframedoc = tag.contentDocument;
          else if (tag.contentWindow) iframedoc = tag.contentWindow;
          const url = `<head>
            <base href="https://" >
            <style type='text/css'>
              img, video {
                width: 100vw;
                height: 100vh;
                object-fit: fill;
              }
            </style>
            </head><body style='padding:0;margin:0;overflow:hidden;'>${mediaPath}</body>`;

          log.debug('[assignMediaToTag] URL: ', url);
          iframedoc.open();
          iframedoc.writeln(url);
          iframedoc.close();
        }
        break;
      case 'video':
        tag.src = mediaPath;
        tag.autoplay = false;
        tag.loop = true;
        tag.preload = 'auto';
        tag.style.objectFit = 'fill';
        tag.muted = Config.isMute;
        tag.type = mediaType;
        break;
    }
  },
  getTagForType(type) {
    let tag = null;
    switch (type) {
      case 'image':
        tag = document.createElement('img');
        tag.style.cssText =
          'position:absolute;top:0;left:0;height:100%;width:100%;';
        break;

      case 'script':
        tag = document.createElement('iframe');
        tag.style.cssText =
          'position:absolute;top:0;left:0;height:100%;width:100%;';
        tag.frameBorder = '0';
        tag.className = 'lemmaAdFrame';
        break;
      case 'video':
        tag = document.createElement('video');
        tag.style.cssText =
          'position:absolute;top:0;left:0;height:100%;width:100%;';
        break;
    }

    return tag;
  },
  resizeCreativeInIframe(iframe) {
    const wWidth = screen.height || window.innerWidth;
    const wHeight = screen.width || window.innerHeight;
    let imgTags = [];
    try {
      imgTags =
        iframe.contentWindow &&
        iframe.contentWindow.document &&
        iframe.contentWindow.document.getElementsByTagName('img');
    } catch (e) {}

    if (imgTags && imgTags.length > 0) {
      for (let i = 0; i < imgTags.length; i++) {
        const itag = imgTags[i];
        if (itag.width > 1 && itag.height > 1) {
          itag.width = wWidth;
          itag.height = wHeight;
        }
      }
    }
    let ifmTags = [];
    try {
      ifmTags =
        iframe.contentWindow &&
        iframe.contentWindow.document &&
        iframe.contentWindow.document.getElementsByTagName('iframe');
    } catch (e) {}
    if (ifmTags && ifmTags.length > 0) {
      for (let i = 0; i < ifmTags.length; i++) {
        const itag = ifmTags[i];
        if (itag.offsetWidth > 1 && itag.offsetHeight > 1) {
          itag.width = wWidth;
          itag.height = wHeight;
          itag.frameborder = '0';
          itag.scrolling = 'no';
          itag.style.overflow = 'hidden';
          itag.style.border = '0px none none';
          try {
            itag.contentDocument.body.style.margin = '0px';
            itag.contentDocument.body.style.padding = '0px';
          } catch (e) {}
        }
        this.resizeCreativeInIframe(itag);
      }
    }
  },
  getLayouts(rawLayouts) {
    const layouts = {};
    if (rawLayouts) {
      // log.info("RAW LAYOUT: ", rawLayouts);
      rawLayouts.forEach(layoutData => {
        // log.info("LAYOUT: ", layoutData);
        if (layoutData.length) {
          layoutData.forEach(data => {
            const lineItemId = data.LineItemId;
            const podSeqId = data.pod_sequence_id;
            let key = lineItemId + '-' + podSeqId;
            if (!layouts[key]) {
              layouts[key] = [data];
            } else {
              layouts[key].push(data);
            }
            // if (podSeqId > -2) {
            //     if (layouts[podSeqId] && layouts[podSeqId].length > 0) {
            //         layouts[podSeqId] = [data];
            //     } else {
            //         layouts[podSeqId] = [];
            //         layouts[podSeqId].push(data);
            //     }
            // } else {
            //     if (!layouts[lineItemId]) {
            //         layouts[lineItemId] = [data];
            //     } else {
            //         layouts[lineItemId] = layoutData;
            //     }
            // }
          });
        }
      });
    }
    // log.debug("[getLayouts] FINAL LAYOUT: ", JSON.stringify(layouts));
    return layouts;
  },
  getCreativesByIndex(index) {
    const creatives = [];
    const distCreatives = [];
    if (index < this.schedule.length) {
      const creative = this.schedule[index];
      if (distCreatives.indexOf(creative.Creative) == -1) {
        distCreatives.push(creative.Creative);
        creatives.push(creative);
      }
      for (let i = index + 1; i < this.schedule.length; i++) {
        if (this.schedule[i].sdate === creative.sdate) {
          creatives.push(this.schedule[i]);
        } else {
          break;
        }
      }
    } else {
      log.error(
        'index out of range. Index:',
        index,
        'Schedule length:',
        this.schedule.length
      );
    }

    return creatives;
  },
  parseUrlParams(url) {
    const strParams = url ? url.split('?')[1] : '';
    const params = {};
    strParams.split('&').forEach(pair => {
      const parts = pair.split('=');
      const key = parts[0];
      const value = parts[1];
      if (key) {
        params[key] = value;
      }
    });
    return params;
  },
  parseTrackerParams() {
    this.trackerBase = this.trackerURL ? this.trackerURL.split('?')[0] : '';
    this.trackerParams = this.parseUrlParams(this.trackerURL);
    const adParams = ConfigManager.get('params');

    this.trackerParams.pid = adParams.pid;
    this.trackerParams.aid = adParams.aid;
    this.trackerParams.agid = adParams.gid;
    this.trackerParams.sid = ConfigManager.get('siteId');
  },
  buildTrackerURL(media) {
    if (this.trackerURL) {
      let qParams = Object.assign({}, this.trackerParams);
      qParams.ts = getTimestamp();
      qParams.iid = getMD5(JSON.stringify(media));

      qParams.lid = media.lid;
      qParams.crid = media.crid;
      qParams.did = media.org_id;
      qParams.cid = media.cid;
      qParams.at = media.ad_type;
      qParams.pp = media.pub_fee;
      qParams.cp = media.adv_fee;
      qParams.dur = media.Duration;
      qParams.bt = media.billing_type ? media.billing_type : 1;
      const trackerParams = Object.entries(qParams)
        .map(([key, value]) => key + '=' + value)
        .join('&');
      this.trackerBase = this.trackerBase
        ? this.trackerBase.replace(
            'track.lemmatechnologies.com',
            ConfigManager.get('apiDomain')
          )
        : this.trackerBase;
      return this.trackerBase + '?' + trackerParams;
    }
  },
  playDefaultAd() {
    if (!this.isPlaying) {
      // log.debug("[PlayDefaultAd] defaultAdTag ", this.defaultAdTag);
      // log.debug("[PlayDefaultAd] IsPlaying ", this.isPlaying);
      this.removeDefaultAd();
      const container = this.getTagForType('image');
      this.defaultAdTag = container;
      this.defaultAdTag.className = 'defaultAd';
      this.defaultAdTag.src =
        'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
      document.body.appendChild(container);
      this.updateDefaultAdTag();
    }
  },
  updateDefaultAdTag() {
    // if (ConnectionManager.isOnline()) {
    const defaultAd = ConfigManager.get('defaultAd');
    if (defaultAd && defaultAd.creative) {
      // const images = ["jpg", "jpeg", "gif", "png"];
      // const videos = ["mp4", "3gp", "ogg", "mov"];
      // let ext = defaultAd.creative.split(/[#?]/)[0].split('.').pop().trim().toLowerCase();
      // let tagType = images.includes(ext) ? "image" : videos.includes(ext) ? "video" : "";
      const localPath = CacheManager.getLocalPath(defaultAd.creative);
      if (localPath) {
        this.updateDefaultAdTagFromLocal();
      } else {
        CacheManager.get(defaultAd.creative);
        log.info(
          'default ad is not cached. Downloading. url:',
          defaultAd.creative
        );

        // if (tagType == "video") {
        this.playVideo(this.defaultAdTag.parentNode, 0);
        // }
      }
    } else {
      log.warn('default ad creative is not set', defaultAd);
    }
    // } else {
    //     log.debug('[updateDefaultAdTag] Working offline');
    //     // AdPlayer.init(localSchedule);

    // }
  },
  updateDefaultAdTagFromLocal() {
    const defaultAd = ConfigManager.get('defaultAd');
    if (defaultAd && defaultAd.creative) {
      const images = ['jpg', 'jpeg', 'gif', 'png'];
      const videos = ['mp4', '3gp', 'ogg', 'mov'];
      let ext = defaultAd.creative
        .split(/[#?]/)[0]
        .split('.')
        .pop()
        .trim()
        .toLowerCase();
      let tagType = images.includes(ext)
        ? 'image'
        : videos.includes(ext)
          ? 'video'
          : '';
      let needToChangeTag = false;
      if (tagType === 'image') {
        needToChangeTag = this.defaultAdTag.nodeName != 'IMG';
      } else {
        needToChangeTag = this.defaultAdTag.nodeName != 'VIDEO';
      }
      let parentNode = null;
      if (needToChangeTag) {
        if (this.defaultAdTag && this.defaultAdTag.parentNode) {
          parentNode = this.defaultAdTag.parentNode;
          this.defaultAdTag.parentNode.removeChild(this.defaultAdTag);
        }
        this.defaultAdTag = this.getTagForType(tagType);
        if (parentNode !== null) {
          if (parentNode.firstElementChild) {
            parentNode.removeChild(parentNode.firstElementChild);
          }
          parentNode.append(this.defaultAdTag);
        }
      }
      CacheManager.get(defaultAd.creative);
      const localPath =
        CacheManager.getLocalPath(defaultAd.creative) || defaultAd.creative;
      if (!localPath) {
        log.error(
          'default ad creative not found in cache. creative:',
          defaultAd.creative
        );
      }
      const mediaPath = localPath || defaultAd.creative;
      this.assignMediaToTag(
        tagType,
        this.defaultAdTag,
        mediaPath,
        defaultAd.duration
      );
      if (tagType == 'video') {
        this.playVideo(this.defaultAdTag.parentNode, 0);
      }
      this.isPlaying = true;
    } else {
      log.warn(
        'default ad creative not found in config. defaultAd:',
        defaultAd
      );
    }
  },
  removeDefaultAd() {
    if (this.defaultAdTag && this.defaultAdTag.parentNode) {
      this.defaultAdTag.parentNode.removeChild(this.defaultAdTag);
    }
  },
  removePreviousAd(previousAd) {
    if (previousAd) {
      const idx = previousAd.index;
      const container = document.getElementById(idx);
      log.info('[Ad Player] Found Container: ', !!container);
      if (container) {
        log.info('[Ad Player] Removing Prev Container: ', container.outerHTML);
        container.remove();
      }
    }
  },
  getDefaultTag() {
    return this.defaultAdTag && this.defaultAdTag.cloneNode();
  },
  setOnline(value) {
    this._online = value;
  },
  isOnline() {
    return this._online;
  },
};

ConnectionManager.isNetworkConnected().then(resp => {
  AdPlayer.setOnline(resp);
  if (localConfigFound && !resp) {
    const localSchedule = ScheduleManager.getLocalSchedule();
    log.debug('[isNetworkConnected] Working offline');
    if (localSchedule) {
      AdPlayer.init(localSchedule);
    } else {
      log.info(
        '[isNetworkConnected] localSchedule is not available to work offline'
      );
    }
    // AdPlayer.playDefaultAd();
  }
});

ConnectionManager.onOffline(() => {
  AdPlayer.setOnline(false);
});

ConnectionManager.onOnline(() => {
  AdPlayer.setOnline(true);
});

function creteOfflineTrackerFile(trackers) {
  let basepath = path.join(
    CACHE_PATHS.OFFLINE_TRACKER_DIR,
    'offline-tracker.txt'
  );
  if (trackers) {
    trackers.map(tracker => {
      try {
        if (tracker && tracker.match('&offline=1') == null) {
          tracker = tracker.replace('&offline=1', '') + '&offline=1';
        }
        fs.appendFile(basepath, '\n' + tracker, function (err) {
          if (err) throw err;
          console.log('Saved!');
        });
      } catch (e) {}
    });
  }
}

function saveFile(data) {
  try {
    let filepath = path.join(
      CACHE_PATHS.OFFLINE_TRACKER_DIR,
      'offline-tracker.txt'
    );
    let fileData = (data && data.join('\n')) || '';
    if (fileData) {
      fs.writeFile(filepath, fileData, function (err) {
        if (err) {
          // log.debug("An error occured while writing JSON Object to File.");
          return log.debug(err);
        }
        // log.debug("schedule file has been saved. (" + filepath + ")");
      });
    }
  } catch (error) {
    log.debug(error);
  }
}

setInterval(async () => {
  ConnectionManager.isNetworkConnected().then(resp => {
    AdPlayer._online = resp;
  });
}, 10000);

exports.AdPlayer = AdPlayer;
