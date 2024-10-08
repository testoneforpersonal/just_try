import React, { Fragment, useCallback, useEffect, useState } from 'react';
import { GetDeviceInfo, GETDeviceUID } from '../device-info';
import { getMD5, getPublicIP } from '../util';
import { version } from '../../package.json';
import { withRouter } from 'react-router-dom';
const actions = [
  { icon: 'img/icons/icon-settings.png', type: 'edit' },
  { icon: 'img/icons/icon-play.png', type: 'play' },
  { icon: 'img/icons/icon-off.png', type: 'off' },
];

const sysInfo = GetDeviceInfo();
const Landing = props => {
  const [publicIp, setPublicIP] = useState('N/A');
  const [timeStr, setTimeStr] = useState('');
  useEffect(() => {
    const intervalId = setInterval(() => {
      let dateString = new Date().toLocaleString().replace(', ', ' - ');
      setTimeStr(dateString);
    }, 1000);
    return () => {
      clearInterval(intervalId);
    };
  }, [setTimeStr]);
  useEffect(() => {
    getPublicIP().then(ip => {
      setPublicIP(ip);
    });
  }, [setPublicIP]);

  const actionHandler = useCallback(event => {
    const type = event.target.dataset['action'];
    if (type === 'edit') {
      props.history.push('/edit');
    } else if (type == 'off') {
      closeApp();
    } else {
      location.assign('../index.html');
    }
  }, []);

  let screenSizeText = 'N/A';
  let params = ConfigManager.get('params');
  screenSizeText =
    'Resolution : ' +
    screen.width +
    'x' +
    screen.height +
    ' Screen Size: ' +
    params.w +
    'x' +
    params.h;

  const info = [
    {
      icon: 'img/icons/icon-clock.png',
      text: timeStr,
    },
    {
      icon: 'img/icons/icon-internet.png',
      text: publicIp,
    },
    {
      icon: 'img/icons/icon-macaddress.png',
      text: 'Device ID: ' + ConfigManager.get('siteId'),
    },
    {
      icon: 'img/icons/icon-win.png',
      text:
        sysInfo.os.type +
        ' Operating System (' +
        sysInfo.os.arch +
        ') RAM: ' +
        sysInfo.os.memory,
    },
    {
      icon: 'img/icons/icon-size.png',
      text: screenSizeText,
    },
    {
      icon: 'img/icons/icon-id.png',
      text: 'Publisher ID: ' + params.pid + ' AdUnit ID: ' + params.aid,
    },
    {
      icon: 'img/icons/icon-media.png',
      text: 'Default Creative',
    },
    {
      icon: 'img/icons/icon-version.png',
      text: version,
    },
  ];
  return (
    <div>
      <div className="header">
        <div>
          <img className="logo" src="img/lm-logo.png" />
        </div>
        <div className="actions">
          {actions.map(action => (
            <img
              key={action.icon}
              data-action={action.type}
              className="action-icon"
              src={action.icon}
              onClick={actionHandler}
            />
          ))}
        </div>
      </div>
      <div>
        <div className="info-container">
          {info.map(item => (
            <Fragment key={item.icon}>
              <div className="info-icon">
                <img src={item.icon} />
              </div>
              <div className="info-text">{item.text}</div>
            </Fragment>
          ))}
        </div>
      </div>
      <div className="footer">
        For any technical support in integration please contact{' '}
        <span className="email">support@lemmatechnologies.com</span>
      </div>
    </div>
  );
};
export default withRouter(Landing);
