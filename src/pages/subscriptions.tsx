import * as React from 'react';
import { useEffect } from 'react'
import { FunctionComponent, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSpinner } from '@fortawesome/free-solid-svg-icons'
import { Confirm, diffList, bMessage, mergeSettings, i18n, openTab, onSuggestions } from './common';
import { Channel, Settings } from '../typings';

let resolver: (channels: Array<Channel>) => void;

const ImportSubscriptions: FunctionComponent<{
    alert: Confirm,
    settings: Settings
    className?: string
}> = ({ alert, settings, className }) => {
    const [importing, setImporting] = useState(false);
    useEffect(() => {
        onSuggestions(channels => resolver && resolver(channels));
    }, [settings])
    const importSubscriptions = () => {

        const awaitImport = new Promise(resolve => {
            resolver = resolve;
            setImporting(true)

            fetch('https://www.youtube.com/account?pbj=1')
                .then(resp => resp.text())
                .then(() => openTab('https://www.youtube.com/feed/channels?uBO-YT-extract', false))
                .catch(err => resolve(null));
        }) as Promise<Array<Channel>>;

        awaitImport
            .then(channels => {
                resolver = null;
                setImporting(false);
                if (!channels) throw 'Fetch error';
                return channels;
            })
            .then(channels => {
                const nextWhitelist = diffList(settings.whitelisted, channels);

                if (!nextWhitelist.length)
                    return alert(i18n('noNew'));

                alert(i18n('importSubsConfirm', [channels.length, nextWhitelist.length]), true)
                    .then(() => {
                        const nextSettings = mergeSettings(settings, {
                            whitelisted: nextWhitelist,
                            blacklisted: [],
                            muted: [],
                            exclude: [],
                            autoWhite: settings.autoWhite,
                            verifyWl: settings.verifyWl,
                            muteAll: settings.muteAll,
                            skipOverlays: settings.skipOverlays,
                            skipAdErrors: settings.skipAdErrors,
                            pauseAfterAd: settings.pauseAfterAd,
                            autoSkip: settings.autoSkip,
                            limitAds: settings.limitAds,
                            limitAdsQty: settings.limitAdsQty,
                            autoSkipSeconds: settings.autoSkipSeconds,
                            keyboardSkip: settings.keyboardSkip,
                            forceWhite: settings.forceWhite
                        })
                        bMessage('set', 'bulk', nextSettings);
                    })
            })
            .catch(err => alert(i18n('importSubsFailed'), false, true));
    }
    return <button className={'btn btn-sm btn-primary ' + className} disabled={importing} onClick={importSubscriptions}>
        {importing
            ? <FontAwesomeIcon icon={faSpinner} spin={true} />
            : i18n('importSubsBtn')}
    </button>
}
export default ImportSubscriptions