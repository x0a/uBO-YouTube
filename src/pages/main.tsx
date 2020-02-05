import * as React from 'react';
import { FunctionComponent, useEffect, useState, useLayoutEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faInfoCircle } from '@fortawesome/free-solid-svg-icons'
import { WhitelistTable, BlacklistTable, MutelistTable, UnmutelistTable } from './list';
import { bMessage, onSettings, defaultSettings, i18n } from './common';
import { Settings } from '../typings';
import { TabContainer, TabPane } from './tabs';
import Options from './misc';
import ChannelSearch from './search';
import ImportSubscriptions from './subscriptions';
import Switch from './switch';
import RecentAds from './recentads';

interface AlertProps {
    show: boolean,
    text: string,
    confirm: boolean,
    danger: boolean,
    onConfirm: () => any,
    onCancel: () => any
}

const Main: FunctionComponent<{
    full: boolean,
    defaultTab?: string
}> = ({ full, defaultTab }) => {
    const defaultAlert = Object.freeze({
        show: false,
        text: '',
        confirm: false,
        danger: false,
        onConfirm: () => { },
        onCancel: () => { }
    } as AlertProps);

    const [settings, setSettings] = useState(defaultSettings());
    const [alert, setAlert] = useState(defaultAlert)

    const showAlert = (text: string, confirm = false, danger = false) => new Promise((resolve, reject) => {
        setAlert({
            show: true,
            text,
            confirm,
            danger,
            onConfirm: () => {
                setAlert(defaultAlert);
                resolve();
            },
            onCancel: () => {
                setAlert(defaultAlert);
                reject();
            }
        })
    }) as Promise<void>;

    useEffect(() => {
        bMessage('get', 'settings')
            .then(onSettings(settings => {
                console.log('Received settings: ', settings);
                setSettings(settings)
            }));
    }, []);

    return <div className={!full && !alert.show ? 'main' : ''}>
        {alert.show && <Alert {...alert} />}
        {!(alert.show && !full) &&
            <div className='container-fluid'>
                <TabContainer defaultTab={defaultTab || ''}>
                    <TabPane id='whitelist' title={i18n('whitelistTabTitle')}>
                        <div className='row'>
                            <div className='col-md'>
                                <WhitelistTable list={settings.whitelisted} alert={showAlert} full={full} />
                            </div>
                            <div className='col-md d-sm-none d-md-block'>
                                <h4 className='invisible'>
                                    {i18n('channelSearchHeader')}
                                </h4>
                                <ChannelSearch alert={showAlert} whitelisted={settings.whitelisted} full={full}>
                                    <ImportSubscriptions settings={settings} alert={showAlert} className='ml-2' />
                                </ChannelSearch>
                            </div>
                        </div>
                    </TabPane>
                    <TabPane id='ads' title={i18n('adsTabTitle')}>
                        <div className='row'>

                            {full && <div className='col-md-3 d-sm-none d-md-block'>
                                <h4>{i18n('adOptionsHeader')}</h4>
                                <ul className='list-group'>
                                    <SwitchableOption
                                        checked={settings.muteAll}
                                        onChange={(checked) => bMessage('set', 'mute-all', checked)}
                                        text={i18n('muteOption')}
                                    />
                                    <SwitchableOption
                                        checked={settings.pauseAfterAd}
                                        onChange={(checked) => bMessage('set', 'pause-after-ad', checked)}
                                        text={i18n('pauseAfterAdOption')}
                                        tooltip={i18n('pauseAfterAdTooltip')}
                                    />
                                    <SwitchableOption
                                        checked={settings.skipAdErrors}
                                        onChange={(checked) => bMessage('set', 'skip-ad-errors', checked)}
                                        text={i18n('adErrorsOption')}
                                        tooltip={i18n('adErrorsOptionTooltip')}
                                    />
                                    <SwitchableOption
                                        checked={settings.skipOverlays}
                                        onChange={(checked) => bMessage('set', 'skip-overlays', checked)}
                                        text={i18n('overlaysOption')}
                                    />
                                </ul>
                            </div>}
                            <div className='col-md-3'>
                                {settings.muteAll
                                    ? <UnmutelistTable list={settings.muted} alert={showAlert} full={full} />
                                    : <MutelistTable list={settings.muted} alert={showAlert} full={full} />
                                }
                                <BlacklistTable list={settings.blacklisted} alert={showAlert} full={full} />
                            </div>
                            <div className='col-md-6'>
                                <RecentAds full={full} settings={settings} />
                            </div>
                        </div>
                    </TabPane>
                    <TabPane id='misc' title={i18n('miscTabTitle')}>
                        <hr className='d-md-none' />
                        <Options alert={showAlert} settings={settings} />
                    </TabPane>
                </TabContainer>
            </div>
        }

    </div >
}
const SwitchableOption: FunctionComponent<{
    checked: boolean;
    onChange: (checked: boolean) => any;
    text: string;
    tooltip?: string;
}> = ({ checked, onChange, text, tooltip }) => {
    return <li className='list-group-item list-group-option'>
        <Switch
            checked={checked}
            onChange={onChange} />
        <span className='ml-2 flex-grow-1'>
            {text}
        </span>
        {tooltip && <div className='tooltip-parent'>
            <FontAwesomeIcon icon={faInfoCircle} />
            <div className='tooltip'>
                <div className='tooltip-inner'>{tooltip}</div>
            </div>
        </div>}
    </li>
}
const Alert: FunctionComponent<AlertProps> = ({ text, danger, confirm, onConfirm, onCancel, show }) => {
    const alertRef = useRef(null as HTMLDivElement);
    useLayoutEffect(() => {
        if (show) {
            const height = alertRef.current.offsetHeight;
            const width = alertRef.current.offsetWidth;
            alertRef.current.style.left = (window.innerWidth / 2 - width / 2) + 'px';
            alertRef.current.style.top = (window.innerHeight / 2 - height / 2) + 'px';
        }
    }, [show])
    return <div className={show ? '' : 'd-none'}>
        <div className='overlay' />
        <div ref={alertRef} className='alert'>
            <p className='font-weight-bold-sm'>{text}</p>
            <div className='float-right-sm'>
                <button type='button'
                    className={'btn btn-sm ' + (danger ? 'btn-danger' : 'btn-primary')}
                    onClick={onConfirm}>
                    {i18n('okBtn')}
                </button>
                {confirm &&
                    <button type='button'
                        className='btn btn-sm btn-secondary'
                        onClick={onCancel}>
                        {i18n('cancelBtn')}
                    </button>}
            </div>
        </div>
    </div>
}

export default Main;