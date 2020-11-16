import * as React from 'react';
import { FunctionComponent, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faMinus, faSearch, faSpinner, faExclamationCircle, faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons'
import { ChannelList, Channel } from '../typings';
import apiKeys from '../../shared/api'
import { bMessage, requestGooglePermission, Confirm, i18n } from './common';

const [, apiKey] = apiKeys;

const ChannelSearch: FunctionComponent<{
    full: boolean;
    alert: Confirm;
    children?: any;
    whitelisted: ChannelList;
}> = ({ full, whitelisted, alert, children }) => {
    const [search, setSearch] = useState('');
    const [error, setError] = useState(false);
    const [searching, setSearching] = useState(false);
    const [channels, setChannels] = useState([] as any);
    const [permission, setPermission] = useState(false);
    const [nav, setNav] = useState({
        current: '',
        next: '',
        prev: ''
    })
    const onChange = (event: React.FormEvent<HTMLInputElement>) => {
        const text = event.currentTarget.value;
        setSearch(text);
        setNav({ current: '', next: '', prev: '' })
        setSearching(true);
    }
    const requestPermission = () => requestGooglePermission()
        .then(granted => setPermission(granted));

    useEffect(() => {
        bMessage('permission', 'google-api')
            .then(granted => setPermission(granted));
    }, [])
    useEffect(() => {
        let int: number;
        if (!nav.current) setChannels([]);
        if (search.length) {
            int = setTimeout(() => fetch('https://content.googleapis.com/youtube/v3/search?type=channel&q='
                + search
                + (nav.current ? '&pageToken=' + nav.current : '')
                + '&maxResults=10&part=snippet&key='
                + apiKey)
                .then(resp => resp.json())
                .then(json => {
                    if (!json.items) throw "Error";
                    setError(false);
                    setSearching(false);
                    setChannels(json.items);
                    setNav({
                        current: nav.current,
                        next: json.nextPageToken || '',
                        prev: json.prevPageToken || ''
                    })
                })
                .catch(err => {
                    setError(true);
                    setSearching(false);
                    setChannels([]);
                    setNav({
                        current: '',
                        next: '',
                        prev: ''
                    })
                }), nav.current ? 300 : 800) as any as number;
        } else {
            setSearching(false);
            setError(false);
        }
        return () => clearTimeout(int);
    }, [search, nav.current]);

    let searchIcon;
    let spin = false;

    if (!searching && !error) {
        searchIcon = faSearch;
    } else if (searching) {
        searchIcon = faSpinner;
        spin = true;
    } else if (error) {
        searchIcon = faExclamationCircle;
    }
    const toggleWhitelist = (channel: Channel, whitelist: boolean) => {
        if (whitelist) {
            bMessage('set', 'add-white', channel);
        } else {
            bMessage('set', 'remove-white', channel);
        }
    }

    return <div className={full ? 'mt-2' : ''}>
        <div className='search-container'>
            <input
                type='text'
                onChange={onChange}
                value={search}
                placeholder={i18n('searchPlaceholder')}
                className='form-control form-control-sm'
                disabled={!permission} />
            <FontAwesomeIcon icon={searchIcon} className="search-feedback" spin={spin} />
        </div>
        <hr />
        {!permission && <div>
            <p className='text-muted list-group-option'>
                {i18n('permissionDesc')}
            </p>
            <button
                className='btn btn-primary btn-block btn-sm mt-2'
                onClick={requestPermission}>
                {i18n('permissionBtn')}
            </button>
        </div>}
        {permission
            && !error
            && !searching
            && !channels.length
            && <span className={'text-muted list-group-option' + (!permission ? 'text-muted' : '')}>
                {i18n('searchDesc')}
                {children}
            </span>}
        {searching && <span className='bold'>
            {i18n('searching')}
        </span>}
        {error && <span className='bold'>
            {i18n('searchFailed')}
        </span>}
        <div className='list-group'>
            {channels.map((item: any) => <ChannelItem
                key={item.id.channelId}
                onClick={toggleWhitelist}
                full={full}
                item={item}
                added={whitelisted.findIndex(channel => channel.id === item.id.channelId) !== -1} />)}
        </div>
        {!!channels.length && <div className='d-flex justify-content-center mt-2'>
            <button
                onClick={() => setNav({ prev: '', next: '', current: nav.prev })}
                disabled={!nav.prev}
                className='btn btn-secondary btn-sm'>
                <FontAwesomeIcon icon={faChevronLeft} />
            </button>
            <button
                className='btn btn-secondary btn-sm'
                disabled={!nav.next}
                onClick={() => setNav({ prev: '', next: '', current: nav.next })}>
                <FontAwesomeIcon icon={faChevronRight} />
            </button>
        </div>
        }
    </div>
}

const ChannelItem: FunctionComponent<{
    item: any;
    added: boolean;
    full: boolean;
    onClick: (channel: Channel, whitelist: boolean) => any;
}> = ({ item, full, added, onClick }) => {
    const title = item.snippet.channelTitle as string;
    const thumbnail = item.snippet.thumbnails.default.url as string;
    const description = item.snippet.description as string;
    const [hovering, setHovering] = useState(false);
    const url = 'https://youtube.com/channel/'
        + item.id.channelId
        + (added ? '?igno=re&disableadblock=1' : '');
    const toggle = () => {
        const channel = {
            id: item.id.channelId,
            display: item.snippet.title,
            username: ''
        }
        onClick(channel, !added);
    }
    return <div
        className={'d-flex flex-row p-2 list-group-item'}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}>

        <div>
            <img className='channel-thumb' src={thumbnail} />
        </div>
        <div className='flex-grow-1 p-1'>
            <div>
                <strong><a href={url}>{title}</a></strong>
            </div>
            <small className={full ? '' : 'hidden'}>{description}</small>
        </div>
        <div className={'channel-action ' + (hovering || (!hovering && added) ? '' : 'invisible')}>
            <button
                className={'btn text-nowrap btn-sm ' + (added ? (!hovering ? 'btn-link' : 'btn-danger') : 'btn-primary')}
                disabled={added && !hovering}
                onClick={toggle}>

                {!added && <><FontAwesomeIcon icon={faPlus} className="mr-1" /><span>
                    {i18n('addBtn')}
                </span></>}
                {added && !hovering && i18n('addedBtn')}
                {added && hovering && <><FontAwesomeIcon icon={faMinus} className="mr-2" /><span>
                    {i18n('removeBtn')}
                </span> </>}
            </button>
        </div>
    </div>
}

export default ChannelSearch;