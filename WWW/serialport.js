const { ConfigManager } = require('./config-manager');
const { SerialPort } = require('serialport');

const SerialPortManager = {
  init() {
    try {
      const readSerialPort = ConfigManager.get('readSerialPort')
        ? ConfigManager.get('readSerialPort')
        : false;
      const comPort = ConfigManager.get('serialPort')
        ? ConfigManager.get('serialPort')
        : 'COM3';
      const sendMessage = function (msg) {
        var iframeList = document.getElementsByClassName('lemmaAdFrame');
        if (iframeList.length) {
          for (var i = 0; i < iframeList.length; i++) {
            var iframe = iframeList[i] && iframeList[i]['contentWindow'];
            if (iframe) {
              // log.info("[APP][sendMessage] Lemma App Message: ", msg);
              iframe.postMessage(msg, '*');
            }
          }
        }
      };

      SerialPort.list().then(function (ports) {
        // let serialports;
        const portarr = [];
        ports.forEach(function (port) {
          //serialports.add('label',port.path)
          portarr.push({ label: port.path, value: port.path });
          // log.info("[APP] PORT: ", port.path, port.pnpId, port.manufacturer); // or console.log(port)
        });
        return portarr;
        //window.localStorage.setItem('serialports', serialports);
      });
      var serialports = SerialPort;
      window.localStorage.setItem('serialports', JSON.stringify(serialports));
      //temp code need to remove
      //window.localStorage.setItem('serialports', JSON.stringify([{"label": "comp1","value": "comp1"}, {"label": "comp2","value": "comp2"},{"label": "comp3","value": "comp3"}]));

      var port = new SerialPort({
        path: comPort,
        baudRate: 9600,
        autoOpen: true,
      });
      port.on('open', function (err) {
        if (err) {
          log.debug(err);
        } else {
          port.on('data', function (chunk) {
            if (chunk.length > 0) sendMessage(chunk.toString());
          });
        }
      });
      port.on('error', function (err) {
        sendMessage(err);
      });
    } catch (error) {
      log.debug('[APP] Reading serial port error: ', error);
    }
  },
};

exports.SerialPortManager = SerialPortManager;
