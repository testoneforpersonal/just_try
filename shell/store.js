const { app, ipcMain, ipcRenderer } = require('electron');
const request = require('request');
const fs = require('fs');
const path = require('path');
const checksum = require('checksum');
const log = require('electron-log');
const chmodr = require('chmodr');
const { encryptCodes, decryptCodes } = require('./encrypt-decrypt.js');
const userDataPath = app.getPath('userData');
const DOWNLOAD_DIR = path.join(userDataPath, '/downloads/');
const DOWNLOAD_COMPLETE_DIR = path.join(userDataPath, '/downloads/completed/');
const DOWNLOAD_PROGRESS_DIR = path.join(userDataPath, '/downloads/pending/');
const SCHEDULE_FILE_PATH = path.join(DOWNLOAD_DIR, 'schedule.json');
const SCHEDULE_FILE_E_PATH = path.join(DOWNLOAD_DIR, 'schedule-e.json');
const CONFIG_FILE_PATH = path.join(userDataPath, 'lemma-config.json');
const OFFLINE_TRACKER_DIR = path.join(userDataPath, '/offline-tracker/');
const { SITE_ID_FILENAME } = require('./constants.js');
fs.existsSync(DOWNLOAD_DIR) || fs.mkdirSync(DOWNLOAD_DIR);
fs.existsSync(DOWNLOAD_COMPLETE_DIR) || fs.mkdirSync(DOWNLOAD_COMPLETE_DIR);
fs.existsSync(DOWNLOAD_PROGRESS_DIR) || fs.mkdirSync(DOWNLOAD_PROGRESS_DIR);
fs.existsSync(OFFLINE_TRACKER_DIR) || fs.mkdirSync(OFFLINE_TRACKER_DIR);
try {
  const cb = ex => {
    if (ex) {
      log.error('[store] error in setting permission', ex);
    }
  };
  chmodr(DOWNLOAD_DIR, 0o700, cb);
  chmodr(DOWNLOAD_COMPLETE_DIR, 0o700, cb);
  chmodr(DOWNLOAD_PROGRESS_DIR, 0o700, cb);
  log.info('[store] Permissions set');
} catch (ex) {
  log.error('[store] chmode', ex);
}

const ensureDirExistsAndWritable = dir => {
  if (fs.existsSync(dir)) {
    try {
      fs.accessSync(dir, fs.constants.W_OK);
    } catch (e) {
      log.info('Cannot access directory: ', dir);
      return false;
    }
  } else {
    try {
      fs.mkdirSync(dir);
    } catch (e) {
      if (e.code == 'EACCES') {
        log.info('Cannot create directory: ', dir);
      } else {
        log.info('Error Code: ', e.code);
      }
      return false;
    }
  }
  return true;
};

const downloadFile = (url, cksum) => {
  return new Promise((resolve, reject) => {
    const fileName = url.split('/').pop();
    var tempFilePath = path.join(DOWNLOAD_PROGRESS_DIR, fileName);
    var finalFilePath = path.join(DOWNLOAD_COMPLETE_DIR, fileName);
    if (
      ensureDirExistsAndWritable(path.join(DOWNLOAD_COMPLETE_DIR, '')) ==
        false ||
      ensureDirExistsAndWritable(path.join(DOWNLOAD_PROGRESS_DIR, '')) == false
    ) {
      return;
    }
    if (fs.existsSync(finalFilePath)) {
      if (cksum == null || cksum == undefined) {
        resolve(finalFilePath);
      } else {
        checksum.file(
          finalFilePath,
          {
            algorithm: 'sha256',
          },
          function (err, sum) {
            if (err) {
              log.info('Checksum Check Error in reverifying', finalFilePath);
              reject();
            } else if (sum === cksum) {
              log.info('Downloaded', url, finalFilePath, fileName);
              resolve(finalFilePath);
            } else {
              log.info(
                'Checksum mismatch ',
                finalFilePath,
                'Expected:',
                cksum,
                'We Got:',
                sum
              );
              fs.unlinkSync(finalFilePath);
              reject();
            }
          }
        );
      }
    } else {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      var req = request({
        method: 'GET',
        uri: url,
        strictSSL: false,
        rejectUnauthorized: false,
      });

      log.info('Downloading', url, tempFilePath);
      var out = fs.createWriteStream(tempFilePath, { flags: 'a' });
      req.pipe(out);

      out.on('finish', () => {
        out.close();
        log.info('Download Completed ', tempFilePath);
      });

      req.on('end', () => {
        if (fs.existsSync(tempFilePath)) {
          if (cksum) {
            checksum.file(
              tempFilePath,
              {
                algorithm: 'sha256',
              },
              function (err, sum) {
                if (err) {
                  log.info('Checksum Check Error', tempFilePath);
                  reject();
                } else if (sum === cksum) {
                  fs.copyFileSync(tempFilePath, finalFilePath);
                  fs.unlinkSync(tempFilePath);
                  log.info('Downloaded', url, finalFilePath, fileName);
                  resolve(finalFilePath);
                } else {
                  log.info(
                    'Checksum mismatch ',
                    tempFilePath,
                    'Expected:',
                    cksum,
                    'We Got:',
                    sum
                  );
                  fs.unlinkSync(tempFilePath);
                  reject();
                }
              }
            );
          }
        } else {
          log.info('TempFileNotFound', tempFilePath);
          out.close();
          reject();
        }
      });
      req.on('error', err => {
        log.info('Downloaded failed', url, tempFilePath, err);
        out.close();
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
        reject();
      });
      req.on('close', () => {
        log.info('Downloaded closed', url, tempFilePath);
        if (cksum == null && fs.existsSync(tempFilePath)) {
          fs.copyFileSync(tempFilePath, finalFilePath);
          fs.unlinkSync(tempFilePath);
          log.info('Downloaded(no-checksum)', url, finalFilePath, fileName);
          resolve(finalFilePath);
        }
      });
    }
  });
};

const canWrite = (path, callback) => {
  fs.access(path, fs.W_OK, function (err) {
    callback(null, !err);
  });
};

const safeParseJSON = data => {
  try {
    // log.debug('[safeParseJSON] DATA: ', data);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    log.debug('parsing fails', e);
    return undefined;
  }
};
exports.updateLocalScheduleEncrypted = function (scheduleData) {
  log.debug(
    '[updateLocalScheduleEncrypted] Attempting to update local schedule'
  );
  let currentFileData = null;
  let passcode = 'lemmaencrypt';
  let encryptedData = encryptCodes(JSON.stringify(scheduleData), passcode);
  if (fs.existsSync(SCHEDULE_FILE_E_PATH)) {
    const fileDataString = fs.readFileSync(SCHEDULE_FILE_E_PATH).toString();
    const parsedFileContent = safeParseJSON(fileDataString);
    currentFileData = decryptCodes(parsedFileContent, passcode);
    if (
      currentFileData &&
      scheduleData &&
      scheduleData.chk_Sum === currentFileData.chk_Sum
    ) {
      log.debug('[updateLocalScheduleEncrypted] No Need to update');
      return false;
    }
  }

  fs.writeFileSync(SCHEDULE_FILE_E_PATH, encryptedData);
  log.debug('[updateLocalScheduleEncrypted] Local Schedule updated');
  return true;
};
exports.readLocalScheduleEncrypted = function () {
  let currentFileData = null;
  let passcode = 'lemmaencrypt';
  if (fs.existsSync(SCHEDULE_FILE_E_PATH)) {
    log.debug('[readLocalScheduleEncrypted] reading encrypted file');
    const fileContent = fs.readFileSync(SCHEDULE_FILE_E_PATH, {
      encoding: 'utf8',
      flag: 'r',
    });
    const parsedFileContent = safeParseJSON(fileContent);
    currentFileData = decryptCodes(parsedFileContent, passcode);
    currentFileData = safeParseJSON(currentFileData);
    currentFileData =
      currentFileData && currentFileData.data
        ? currentFileData.data
        : currentFileData;
    if (currentFileData && currentFileData.chk_Sum) {
      return currentFileData;
    }
  }

  if (fs.existsSync(SCHEDULE_FILE_PATH)) {
    //try to read old unecrypted file
    log.debug('[readLocalSchedule] reading non encrypted file');
    const fileContent = fs.readFileSync(SCHEDULE_FILE_PATH, {
      encoding: 'utf8',
      flag: 'r',
    });
    currentFileData = safeParseJSON(fileContent);
    currentFileData =
      currentFileData && currentFileData.data
        ? currentFileData.data
        : currentFileData;
    if (currentFileData && currentFileData.chk_Sum) {
      return currentFileData;
    }
  }
  return currentFileData;
};
exports.updateLocalScheduleNonEncrypted = function (scheduleData) {
  log.debug(
    '[updateLocalScheduleNonEncrypted] Attempting to update local schedule'
  );
  let currentFileData = null;

  if (fs.existsSync(SCHEDULE_FILE_PATH)) {
    const fileDataString = fs.readFileSync(SCHEDULE_FILE_PATH).toString();
    const parsedFileContent = safeParseJSON(fileDataString);
    currentFileData = parsedFileContent;
    if (
      currentFileData &&
      scheduleData &&
      scheduleData.chk_Sum === currentFileData.chk_Sum
    ) {
      log.debug('[updateLocalScheduleNonEncrypted] No Need to update');
      return false;
    }
  }

  fs.writeFileSync(SCHEDULE_FILE_PATH, JSON.stringify(scheduleData));
  log.debug('[updateLocalScheduleNonEncrypted] Local Schedule updated');
  return true;
};
exports.readLocalScheduleNonEncrypted = function () {
  let currentFileData = null;

  if (fs.existsSync(SCHEDULE_FILE_PATH)) {
    log.debug('[readLocalScheduleNonEncrypted] reading file');
    const fileContent = fs.readFileSync(SCHEDULE_FILE_PATH, {
      encoding: 'utf8',
      flag: 'r',
    });
    currentFileData = safeParseJSON(fileContent);
    currentFileData =
      currentFileData && currentFileData.data
        ? currentFileData.data
        : currentFileData;
    if (currentFileData && currentFileData.chk_Sum) {
      return currentFileData;
    }
  }
  return currentFileData;
};

exports.readLocalConfig = function () {
  let currentFileData = null;
  if (fs.existsSync(CONFIG_FILE_PATH)) {
    currentFileData = safeParseJSON(
      fs.readFileSync(CONFIG_FILE_PATH).toString()
    );
    if (currentFileData) {
      return currentFileData;
    }
  }
  return false;
};

exports.saveConfigLocally = function (configData) {
  //added logic to check if config already exist, then check what data is modified
  if (!fs.existsSync(CONFIG_FILE_PATH)) {
    console.log('First time writing file');
    try {
      fs.writeFileSync(
        CONFIG_FILE_PATH,
        JSON.stringify(configData, null, '  ')
      );
    } catch (err) {
      log.warn('Error while writing file ', err);
      return false;
    }
  } else {
    var existingConfigData = safeParseJSON(
      fs.readFileSync(CONFIG_FILE_PATH).toString()
    );
    if (checkIfConfigChanged(existingConfigData, configData)) {
      log.info(
        '[STORE] Some config changes found in either PID,AID,GID,HT or WD'
      );
      try {
        fs.writeFileSync(
          CONFIG_FILE_PATH,
          JSON.stringify(configData, null, '  ')
        );
      } catch (err) {
        log.warn('Error while writing file ', err);
        return false;
      }
    }
  }

  return true;
};

exports.CACHE_PATHS = {
  DOWNLOAD_DIR,
  DOWNLOAD_COMPLETE_DIR,
  DOWNLOAD_PROGRESS_DIR,
  OFFLINE_TRACKER_DIR,
};
exports.downloadFile = downloadFile;

exports.getLocalFilePath = function (remotePath) {
  const fileName = remotePath.split('/').pop();
  var finalFilePath = path.join(DOWNLOAD_COMPLETE_DIR, fileName);
  if (fs.existsSync(finalFilePath)) {
    return finalFilePath;
  }
  return null;
};
// new function to check if anything changed. Not allowing to set 0 value
function checkIfConfigChanged(existingConfigData, configData) {
  // log.debug("parameter changed :",existingConfigData);
  if (
    configData &&
    configData.params.pid != 0 &&
    existingConfigData.params.pid != configData.params.pid
  ) {
    log.debug(
      'PID : Old',
      existingConfigData.params.pid,
      ' : New ',
      configData.params.pid
    );
    return true;
  }
  if (
    configData &&
    configData.params.aid != 0 &&
    existingConfigData.params.aid != configData.params.aid
  ) {
    log.debug(
      'AID : Old',
      existingConfigData.params.aid,
      ' : New ',
      configData.params.aid
    );
    return true;
  }
  if (
    existingConfigData &&
    existingConfigData.params.gid != configData.params.gid
  ) {
    //0 is allowed to set, so not added gid check
    log.debug(
      'GID : Old',
      existingConfigData.params.gid,
      ' : New ',
      configData.params.gid
    );
    return true;
  }
  if (
    configData &&
    configData.width != 0 &&
    existingConfigData.width != configData.width
  ) {
    log.debug(
      'Width : Old',
      existingConfigData.width,
      ' : New ',
      configData.width
    );
    return true;
  }
  if (
    configData &&
    configData.height != 0 &&
    existingConfigData.height != configData.height
  ) {
    log.debug(
      'PID : Old',
      existingConfigData.height,
      ' : New ',
      configData.height
    );
    return true;
  }

  if (
    configData &&
    configData.serialPort != 'undefined' &&
    existingConfigData.serialPort != configData.serialPort
  ) {
    return true;
  }
  if (existingConfigData && existingConfigData.layout != configData.layout) {
    return true;
  }
  if (
    existingConfigData &&
    existingConfigData.customLayoutType != configData.customLayoutType
  ) {
    log.info(
      configData.customLayoutType,
      ' : ',
      existingConfigData.customLayoutType
    );
    return true;
  }

  // if (!configData.adSync) {
  //     //log.debug("Ad sync ", existingConfigData.adSync)
  //     return false;
  // }
  return false;
}

function checkIfValueChanged(existingValue, newValue) {
  log.debug('Existing value ', newValue, ' : New ', newValue);
  if (existingValue != 0 && existingValue != newValue) {
    return true;
  }
}

// To Store DeviceUid into file SiteId.json
async function ipcStoreDeviceUid(uid){
  const userDataFilePath = path.join(userDataPath, SITE_ID_FILENAME);
  log.debug("Looking for file - "+ userDataFilePath);
  if(!fs.existsSync(userDataFilePath)){
      try{
          const cb = (ex) => {
              if(ex){
                  log.error('[store] error in setting permission', ex);
              }
          };

          const dirs = `${userDataPath}`;
          chmodr(dirs, 0o700, cb);
          fs.writeFileSync(userDataFilePath, JSON.stringify(uid));
          log.info(SITE_ID_FILENAME + ' created successfully');
      }catch(err){
          log.warn('Failed to store MAC & DeviceId', err);
      }
  }
}

exports.IpcStoreDeviceUid = ipcStoreDeviceUid;

// To get the stored DeviceUid, if SiteId.json file exists then
async function getStoredDeviceUid(){
  return new Promise((resolve, reject)=>{
      var deviceId = null;
      const userDataFilePath = path.join(userDataPath, SITE_ID_FILENAME);
      if(fs.existsSync(userDataFilePath)){
          log.info(SITE_ID_FILENAME + ' already exists');
          fs.readFile(userDataFilePath, 'utf-8', (err, data) => {
              if(err){
                  reject("Error in reading file "+ SITE_ID_FILENAME);
              }
              log.debug("The file content is : " + data);
              var SiteIdContents = JSON.parse(data);
              deviceId = SiteIdContents["SiteId"];
              log.debug("SiteIdContents is : " + deviceId);
              resolve(deviceId);
          })
      }else{
          reject("File not present - "+ SITE_ID_FILENAME)
      }
  });
}
exports.GetStoredDeviceUid = getStoredDeviceUid;