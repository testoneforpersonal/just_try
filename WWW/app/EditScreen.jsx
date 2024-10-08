import React, { useCallback, useEffect, useState } from 'react';
import { withRouter } from 'react-router-dom';
const config = [
  {
    label: 'Publisher Id',
    type: 'number',
    propName: 'pid',
    hidden: false,
  },
  {
    label: 'Display Group Id',
    type: 'number',
    propName: 'gid',
    hidden: false,
  },
  {
    label: 'Ad unit id',
    type: 'number',
    propName: 'aid',
    hidden: false,
  },
  {
    label: 'Screen Width',
    type: 'number',
    propName: 'width',
  },
  {
    label: 'Screen Height',
    type: 'number',
    propName: 'height',
    hidden: false,
  },
  {
    label: 'Screen X Offset',
    type: 'number',
    propName: 'x',
    hidden: false,
  },
  {
    label: 'Screen Y Offset',
    type: 'number',
    propName: 'y',
    hidden: false,
  },
  {
    label: 'Full Screen',
    type: 'dropdown',
    values: [
      { label: 'Yes', value: '1' },
      { label: 'No', value: '0' },
    ],
    propName: 'fullscreen',
    hidden: false,
  },
  {
    label: 'Layout',
    type: 'dropdown',
    values: [
      { label: 'Default', value: 'default-layout' },
      { label: 'Custom', value: 'custom-layout' },
    ],
    propName: 'layout',
    hidden: false,
  },
  {
    label: 'Custom layout types',
    type: 'dropdown',
    values: [
      { label: 'Full', value: 'full' },
      { label: '50-50', value: '50-50' },
      { label: '70-30', value: '70-30' },
    ],
    propName: 'customLayoutType',
    hidden: true,
  },
  {
    label: 'Do you want Ads syncup enabled?',
    type: 'dropdown',
    values: [
      { label: 'Yes', value: '1' },
      { label: 'No', value: '0' },
    ],
    propName: 'adSync',
    hidden: false,
  },
  {
    label: 'Serial ports',
    type: 'dropdown',
    values: [],
    propName: 'serialports',
    hidden: false,
  },
  {
    label: 'Server Environment',
    type: 'dropdown',
    values: [
      { label: 'Live Server', value: '1' },
      { label: 'Local Server', value: '0' },
    ],
    propName: 'env',
  },
  {
    label: 'Ad Serving Domain',
    type: 'dropdown',
    values: [
      { label: 'Global', value: 'lemmadigital.com' },
      { label: 'APEC', value: 'sg.lemmatechnologies.com' },
      { label: 'SANDBOX', value: 'sandbox.lemmatechnologies.com' },
    ],
    propName: 'domain',
    hidden: false,
  },
];
const EditScreen = props => {
  const [stateData, setStateData] = useState({
    pid: 0,
    gid: 0,
    aid: 0,
    width: 0,
    height: 0,
    x: 1,
    y: 2,
    fullscreen: 0,
    adSync: 0,
    env: 1,
    domain: 0,
    layout: '',
  });

  function pushfunc(serialports) {
    config.map(item => {
      if (item.propName === 'serialports') {
        serialports.map(it => {
          item.values.push(it);
        });
      }
    });
  }
  useEffect(() => {
    if (window.localStorage.getItem('serialports') != 'undefined') {
      //console.log(window.localStorage.getItem('serialports'));
      let serialports = JSON.parse(window.localStorage.getItem('serialports'));
      pushfunc(serialports);
    }

    const params = ConfigManager.get('params');
    const screenOffset = ConfigManager.get('screenOffset');
    const appSettings = ConfigManager.get('appSettings');
    const data = {
      pid: params.pid,
      gid: params.gid,
      aid: params.aid,
      width: ConfigManager.get('width'),
      height: ConfigManager.get('height'),
      x: screenOffset.x,
      y: screenOffset.y,
      fullscreen: appSettings.kiosk ? 1 : 0,
      adSync: ConfigManager.get('adSync'),
      env: ConfigManager.get('environment'),
      domain: ConfigManager.get('apiDomain'),
      layout: ConfigManager.get('layout'),
      customLayoutType: ConfigManager.get('customLayoutType'),
    };
    setStateData(() => data);
  }, [setStateData]);

  const onSaveChanges = useCallback(() => {
    const params = ConfigManager.get('params');
    const screenOffset = ConfigManager.get('screenOffset');
    const appSettings = ConfigManager.get('appSettings');
    //not going save 0 value for PID and AID
    if (stateData.pid != 0) {
      params.pid = stateData.pid;
    }
    if (stateData.aid != 0) {
      params.aid = stateData.aid;
    }
    //group id can be 0
    params.gid = stateData.gid;

    ConfigManager.set('params', params);

    ConfigManager.set('width', stateData.width);
    ConfigManager.set('height', stateData.height);

    screenOffset.x = stateData.x;
    screenOffset.y = stateData.y;
    ConfigManager.set('screenOffset', screenOffset);
    let domain = ConfigManager.get('domain');
    domain.prod = stateData.domain;
    appSettings.kiosk = stateData.fullscreen == '1';
    ConfigManager.set('appSettings', appSettings);
    ConfigManager.set('adSync', stateData.adSync);
    ConfigManager.set('environment', stateData.env);
    ConfigManager.set('apiDomain', stateData.domain);
    ConfigManager.set('domain', domain);
    ConfigManager.set('serialPort', stateData.serialports);
    ConfigManager.set('layout', stateData.layout);
    ConfigManager.set('customLayoutType', stateData.customLayoutType);
    ConfigManager.writeConfigLocally();

    props.history.push('/');
  }, [stateData, props]);

  const onCancel = useCallback(() => {
    props.history.push('/');
  }, [props]);

  const updateStateData = useCallback(
    partial => {
      config.map(item => {
        if (item.label === 'Custom layout types') {
          item.hidden = false;
        }
      });

      if (partial.layout === 'custom-layout') {
      } else if (partial.layout === 'default-layout') {
        config.map(item => {
          if (item.label === 'Custom layout types') {
            item.hidden = true;
          }
        });
      }
      setStateData(data => Object.assign({}, data, partial));
    },
    [setStateData]
  );
  const renderTextBox = item => {
    return (
      <input
        type="number"
        value={stateData[item.propName]}
        onChange={e => {
          updateStateData({ [item.propName]: e.target.value });
        }}
      />
    );
  };
  const renderDropDown = item => {
    return (
      <select
        data-test={stateData[item.propName]}
        data-prop={item.propName}
        value={stateData[item.propName]}
        onChange={e => {
          updateStateData({ [item.propName]: e.target.value });
        }}>
        {item.values.map(entry => (
          <option key={entry.value} value={entry.value}>
            {entry.label}
          </option>
        ))}
      </select>
    );
  };

  return (
    <div className="config-editor">
      <div className="config-header">Edit Screen Setting</div>
      <div className="config-container">
        {config.map(item => (
          <div
            key={item.label}
            className="config-item"
            style={item.hidden ? { display: 'none' } : {}}>
            {item.label === 'Custom layout types' ? (
              <div className="config-label">{item.label}</div>
            ) : (
              <div className="config-label">{item.label}</div>
            )}
            <div className="config-value">
              {item.type === 'number'
                ? renderTextBox(item)
                : renderDropDown(item)}
            </div>
          </div>
        ))}
      </div>
      <div className="config-footer">
        <button onClick={onSaveChanges}>Save Changes</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
};

export default withRouter(EditScreen);
