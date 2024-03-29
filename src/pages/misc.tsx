import * as React from 'react';
import { FunctionComponent, useState, useCallback, useEffect, FormEvent, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faDownload, faFileImport, faTrash, faCopy, faCog } from '@fortawesome/free-solid-svg-icons'
import { SwitchableOption, Tooltip } from './switch';
import { Settings } from '../typings';
import {
    Confirm, isSettings, canonicalizeSettings, diffSettings,
    mergeSettings, readJSONFile, bMessage, openTab,
    getExtURL, i18n, getManifest, checkDev
} from './common';

const Import: FunctionComponent<{
    settings: Settings,
    alert: Confirm
}> = ({ alert, settings }) => {
    const [inputEl, setInput] = useState(null as HTMLInputElement);
    const inputRef = useCallback((el: HTMLInputElement) => {
        if (el !== null) {
            setInput(el);
        }
    }, []);
    const onFile = (event: FormEvent<HTMLInputElement>) => {
        if (!event.currentTarget.files.length) return;
        const file = event.currentTarget.files[0];

        if (file.type !== 'application/json' && file.type !== '')
            return alert(i18n('wrongFormat', file.type), false, true);

        readJSONFile(file)
            .then(json => {
                inputEl.value = '';
                if (!isSettings(json))
                    throw 'Invalid settings';
                const nextSettings = diffSettings(settings, canonicalizeSettings(json, settings));

                if (!nextSettings.whitelisted.length && !nextSettings.blacklisted.length && !nextSettings.muted.length)
                    return alert(i18n('noNew'));

                alert(i18n('confirmImport', [
                    nextSettings.whitelisted.length,
                    nextSettings.blacklisted.length,
                    nextSettings.muted.length]), true)
                    .then(() => {
                        const newSettings = mergeSettings(settings, nextSettings);
                        bMessage('set', 'bulk', newSettings)
                            .catch(error => alert(i18n('updateFailed', error), false, true));
                    })
            })
            .catch(error => {
                inputEl.value = '';
                alert(error, false, true);
            });
    }
    return <>
        <input type='file' ref={inputRef} onChange={onFile} className='d-none' />
        <button type='button' className='btn btn-sm btn-primary' onClick={() => inputEl.click()}>
            <FontAwesomeIcon icon={faFileImport} /> {i18n('importBtn')}
        </button>
    </>
}

const Export: FunctionComponent<{
    settings: Settings
    className?: string;
    alt?: boolean
}> = ({ settings, className = '', alt = false }) => {
    const [linkEl, setLink] = useState(null as HTMLAnchorElement);
    const [blobURL, setBlobURL] = useState('');
    const linkRef = useCallback((el: HTMLAnchorElement) => el !== null && setLink(el), []);
    useEffect(() => {
        const fileBlob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(fileBlob);
        setBlobURL(url);
        return () => URL.revokeObjectURL(url);
    }, [settings])

    return <>
        <a download='ublock-youtube.json' href={blobURL} ref={linkRef} className='d-none' />
        <button
            type='button'
            className={'btn btn-sm btn-primary ' + className}
            onClick={() => linkEl.click()}>
            <FontAwesomeIcon icon={faDownload} /> {alt ? i18n('exportAltBtn') : i18n('exportBtn')}
        </button>
    </>
}

const Reset: FunctionComponent<{
    alert: Confirm,
    className?: string
}> = ({ alert, className = '' }) => {
    const reset = () => alert(i18n('resetConfirm'), true, true)
        .then(() => bMessage('set', 'reset'));
    return <button
        type='button'
        className={'btn btn-sm btn-danger ' + className}
        title={i18n('resetTooltip')}
        onClick={reset}>
        <FontAwesomeIcon icon={faTrash} /> {i18n('resetBtn')}
    </button>
}
const ListGroupItem: FunctionComponent<{
    children: JSX.Element | Array<JSX.Element | string> | string
    flex?: boolean
}> = ({ children, flex = true }) =>
        <div className={'list-group-item w-100 justify-content-between ' + (flex && 'd-flex')}>
            {children}
        </div>
const SettingsPage = () => <button
    className='btn btn-primary btn-sm'
    onClick={() => {
        openTab(getExtURL('settings.html'))
            .then(() => window.close())
    }}>
    <FontAwesomeIcon icon={faCog} /> {i18n('optionsBtn')}
</button>
const CopyableInput: FunctionComponent<{
    text: string
}> = ({ text }) => {
    const inputField = useRef(null as HTMLInputElement);
    const [copied, setCopied] = useState(false);
    const selectAll = () => {
        inputField.current.select();
    }
    const copy = () => {
        inputField.current.select()
        inputField.current.setSelectionRange(0, 99999);
        document.execCommand('copy');

        setCopied(true);
        setTimeout(() => setCopied(false), 2000)
    }

    return <div>
        <div className='input-group'>
            <input type="text" ref={inputField} onClick={selectAll} className="form-control" value={text} readOnly={true} />
            <div className="input-group-append">
                <button
                    className="btn btn-outline-secondary p-0 ml-0"
                    type="button"
                    onClick={copy}
                    disabled={copied}>
                    <Tooltip text={copied ? i18n('copied') : i18n('copy')} className='pt-2 pb-2 pl-3 pr-3'>
                        <FontAwesomeIcon icon={faCopy}/>
                    </Tooltip>
                </button>


            </div>
        </div>
    </div>
}
const Options: FunctionComponent<{
    settings: Settings,
    alert: Confirm,
}> = ({ settings, alert }) => {
    const [isDev, setDev] = useState(false);

    useEffect(() => {
        checkDev.then(dev => setDev(dev));
    }, []);

    return <div className='row'>
        <div className='d-sm-none d-md-block col-md-6'>
            <div className='list-group list-group-flush'>
                <SwitchableOption
                    checked={settings.autoWhite}
                    onChange={(checked) => bMessage('set', 'auto-whitelist', checked)}
                    text={i18n('autoWhiteOption')}
                    tooltip={i18n('autoWhiteTooltip')}
                />
                <ListGroupItem>
                    {i18n('import')}
                    <Import alert={alert} settings={settings} />
                </ListGroupItem>
                <ListGroupItem>
                    {i18n('export')}
                    <Export settings={settings} />
                </ListGroupItem>
                <ListGroupItem>
                    {i18n('reset')}
                    <Reset alert={alert} className='' />
                </ListGroupItem>
            </div>
        </div>
        <div className='d-sm-none d-md-block col-md-6'>
            <div className='list-group list-group-flush'>
                <ListGroupItem flex={false}>
                    <div className='row'>
                        <div className='col'>
                            Trusted string
                        </div>
                        <div className='col'>
                            <CopyableInput text={'*youtube.com/*&disableadblock=1'} />
                        </div>
                    </div>
                </ListGroupItem>
                <ListGroupItem>
                    Version
                    <div>
                        <strong>{getManifest().version + (isDev ? ' (development)' : '')} </strong>
                    </div>
                </ListGroupItem>
                <ListGroupItem>
                    Provide translations
                    <a href="https://crowdin.com/project/youtube-channel-whitelist-for">
                        <strong>Crowdin</strong>
                    </a>
                </ListGroupItem>
                <ListGroupItem>
                    Report issues/suggestions
                    <div>
                        <a href="https://github.com/x0a/uBO-YouTube">
                            <strong>Github</strong>
                        </a>
                    </div>
                </ListGroupItem>
            </div>
        </div>
        <div className='d-md-none float-right-sm'>
            <SettingsPage />
        </div>
    </div>
}


export { Export }
export default Options