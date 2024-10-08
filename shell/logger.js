const log = require('electron-log');

// Same as for console transport
log.transports.file.level =  'debug'
log.transports.console.level = 'error'
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] ' + prefix + ' {text}';
log.transports.file.maxSize = 10 * 1024 * 1024;
log.transports.file.file = 'app-log-' + moment().format('DDMMYYY') + '.log';
log.transports.file.streamConfig = {
    flags: 'w'
};
log.transports.file.stream = fs.createWriteStream('app-log-' + moment().format('DDMMYYY') + '.log');