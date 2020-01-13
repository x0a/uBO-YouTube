import * as React from 'react';
import { FunctionComponent, useState, useCallback, useEffect, FormEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faDownload, faFileImport, faTrash } from '@fortawesome/free-solid-svg-icons'
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
        <button type='button' className='btn btn-primary' onClick={() => inputEl.click()}>
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
            className={'btn btn-primary ' + className}
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
        className={'btn btn-danger ' + className}
        title={i18n('resetTooltip')}
        onClick={reset}>
        <FontAwesomeIcon icon={faTrash} /> {i18n('resetBtn')}
    </button>
}
const ListGroupItem: FunctionComponent<{
    children: JSX.Element | Array<JSX.Element | string> | string
}> = ({ children }) =>
        <div className='list-group-item d-flex w-100 justify-content-between'>
            {children}
        </div>
const SettingsPage = () => <button
    className='btn btn-primary btn-sm'
    onClick={() => {
        openTab(getExtURL('settings.html'))
            .then(() => window.close())
    }}>
    <FontAwesomeIcon icon={faTrash} /> {i18n('optionsBtn')}
</button>

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