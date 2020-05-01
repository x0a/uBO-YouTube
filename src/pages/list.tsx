import * as React from 'react';
import { FunctionComponent, useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMinusCircle, faMinus, faCompress, faCompressArrowsAlt, faMinusSquare, faPlusSquare } from '@fortawesome/free-solid-svg-icons'
import { bMessage, Confirm, fullHeader, popupHeader, i18n, settingsFromList } from './common';
import { Export } from './misc'
import { ChannelList, Channel } from '../typings';
import Link from './link';

interface ChannelMod extends Channel {
    checked: boolean;
}
type ChannelListModify = Array<ChannelMod>;

const ChannelTable: FunctionComponent<{
    list: ChannelList;
    title: string | JSX.Element;
    exportKey: string;
    actionDesc: string;
    enableBulk: boolean;
    onAction: (item: Channel) => any;
    onBulkAction: (items: Array<Channel>) => any;
}> = ({ title, list, exportKey, onBulkAction, enableBulk, onAction, actionDesc }) => {
    const [channels, setChannels] = useState([] as ChannelListModify);
    const [checkAll, toggleCheckAll] = useState(false);
    const [hide, setHide] = useState(false);

    const getURL = (id: string) => 'https://youtube.com/channel/' + id;
    const toggleCheck = (_id: string) => {
        if (enableBulk) setChannels(channels
            .map(({ checked, id, display, username }) => ({
                checked: _id === id ? !checked : checked,
                id,
                display,
                username
            })))
        toggleCheckAll(false);
    }
    const toggleAll = () => {
        const nextCheck = !checkAll;
        setChannels(channels
            .map(({ id, display, username }) => ({
                checked: nextCheck,
                id,
                display,
                username
            })))
        toggleCheckAll(nextCheck);
    }
    const selectionsMade = () => channels.some(channel => channel.checked);
    const getSelections = () => channels
        .filter(({ checked }) => checked)
        .map(({ id, display, username }) => ({ id, display, username }));
    const onListAction = () => onBulkAction(getSelections());
    const onSingleAction = (channel: Channel, event: React.SyntheticEvent) => {
        event.stopPropagation();
        onAction(channel);
    }
    useEffect(() => {
        const lastChecked = channels.filter(({ checked }) => checked);
        setChannels(list
            .map(({ id, display, username }) => ({
                checked: lastChecked.findIndex(({ id: _id }) => _id === id) !== -1,
                id,
                display,
                username
            })));
    }, [list])

    return <div className=''>
        {title}
        <table className='table table-sm table-hover'>
            <thead className='thead-dark d-sm-none d-md-table-header-group'>
                <tr>
                    {enableBulk && <th>{!!channels.length && !hide &&
                        <input type="checkbox" checked={checkAll} onChange={toggleAll} />
                    }</th>}
                    <th>{i18n('channelColumn')}</th>
                    <th onClick={() => setHide(!hide)} className='cursor-pointer text-right text-muted toggle-collapse'>
                        {hide
                            ? <FontAwesomeIcon icon={faPlusSquare} />
                            : <FontAwesomeIcon icon={faMinusSquare} />}
                    </th>
                </tr>
            </thead>
            <tbody>
                {!channels.length && !hide && <tr>
                    <td className='text-muted'>{i18n('emptyList')}</td>
                    <td></td>
                    <td></td>
                </tr>}
                {hide ? [] : channels.map(channel => <tr
                    key={channel.id}
                    className={'cursor-pointer ' + (channel.checked ? 'table-active' : '')}
                    onClick={() => toggleCheck(channel.id)}>
                    {enableBulk && <td>
                        <input type='checkbox' checked={channel.checked} onChange={() => toggleCheck(channel.id)} />
                    </td>}
                    <td>
                        <Link className='font-weight-bold-sm text-center' href={getURL(channel.id)}>
                            {channel.display}
                        </Link>
                    </td>
                    <td>
                        <button
                            className='btn btn-link text-danger float-right m-0 p-0'
                            onClick={event => onSingleAction(channel, event)}
                            title={actionDesc}>
                            <FontAwesomeIcon icon={faMinusCircle} />
                        </button>
                    </td>
                </tr>)}
            </tbody>
        </table>
        {<div className={'d-md-flex justify-content-end d-sm-none ' + (selectionsMade() ? '' : 'invisible')}>
            <Export settings={settingsFromList(getSelections(), exportKey)} className='btn-sm' alt={true} />
            <button
                className='btn btn-sm btn-danger float-right'
                onClick={onListAction}>
                {i18n('bulkRemoveBtn')}
            </button>
        </div>}
    </div>
}

const WhitelistTable: FunctionComponent<{
    list: ChannelList,
    alert: Confirm,
    full: boolean
}> = ({ list, alert, full }) => {
    return <ChannelTable
        list={list}
        title={full
            ? fullHeader(i18n('whitelistHeader'))
            : popupHeader(i18n('whitelistHeader'))}
        actionDesc={i18n('removeWhitelistTooltip')}
        enableBulk={full}
        onAction={channel => {
            alert(i18n('removeWhitelistConfirm', channel.display), true, false)
                .then(() => {
                    bMessage('set', 'remove-white', channel)
                        .catch(error => alert(i18n('removeFailed', error), false, true))
                })
        }}
        onBulkAction={channels => {
            alert(i18n('bulkRemoveWhitelistConfirm', channels.length), true, false)
                .then(() => {
                    bMessage('set', 'remove-white', channels.map(channel => channel.id))
                        .catch(error => alert(i18n('removeFailed', error), false, true))
                })
        }}
        exportKey='whitelisted' />
}
const ExcludeTable: FunctionComponent<{
    list: ChannelList,
    alert: Confirm,
    full: boolean
}> = ({ list, alert, full }) => {
    return <ChannelTable
        list={list}
        title={full
            ? fullHeader(i18n('excludeHeader'))
            : popupHeader(i18n('excludeHeader'))}
        actionDesc={i18n('removeExcludeTooltip')}
        enableBulk={full}
        onAction={channel => {
            alert(i18n('removeExcludeConfirm', channel.display), true, false)
                .then(() => {
                    bMessage('set', 'remove-exclude', channel)
                        .catch(error => alert(i18n('removeFailed', error), false, true))
                })
        }}
        onBulkAction={channels => {
            alert(i18n('bulkRemoveExcludeConfirm', channels.length), true, false)
                .then(() => {
                    bMessage('set', 'remove-exclude', channels.map(channel => channel.id))
                        .catch(error => alert(i18n('removeFailed', error), false, true))
                })
        }}
        exportKey='exclude' />
}
const BlacklistTable: FunctionComponent<{
    list: ChannelList
    alert: Confirm
    full: boolean
}> = ({ list, alert, full }) => {
    return <ChannelTable
        list={list}
        title={full
            ? fullHeader(i18n('blacklistHeader'))
            : popupHeader(i18n('blacklistHeader'))}
        actionDesc={i18n('removeBlacklistTooltip')}
        enableBulk={full}
        onAction={channel => {
            alert(i18n('removeBlacklistConfirm', channel.display), true, false)
                .then(() => {
                    bMessage('set', 'remove-black', channel)
                        .catch(error => alert(i18n('removeFailed', error), false, true))
                })
        }}
        onBulkAction={channels => {
            alert(i18n('bulkRemoveBlacklistConfirm', channels.length), true, false)
                .then(() => {
                    bMessage('set', 'remove-black', channels.map(channel => channel.id))
                        .catch(error => alert(i18n('removeFailed', error), false, true))
                })
        }}
        exportKey='blacklisted'
    />
}
const MutelistTable: FunctionComponent<{
    list: ChannelList
    alert: Confirm
    full: boolean
}> = ({ list, alert, full }) => {
    return <ChannelTable
        list={list}
        title={full
            ? fullHeader(i18n('mutelistHeader'))
            : popupHeader(i18n('mutelistHeader'))}
        actionDesc={i18n('removeMuteBtn')}
        enableBulk={full}
        onAction={channel => {
            alert(i18n('removeMuteConfirm', channel.display), true, false)
                .then(() => {
                    bMessage('set', 'remove-mute', channel)
                        .catch(error => alert(i18n('removeFailed', error), false, true))
                })
        }}
        onBulkAction={channels => {
            alert(i18n('bulkRemoveMuteConfirm', channels.length), true, false)
                .then(() => {
                    bMessage('set', 'remove-mute', channels.map(channel => channel.id))
                        .catch(error => alert(i18n('removeFailed', error), false, true))
                })
        }}
        exportKey='muted' />
}

const UnmutelistTable: FunctionComponent<{
    list: ChannelList,
    alert: Confirm,
    full: boolean
}> = ({ list, alert, full }) => {
    return <ChannelTable
        list={list}
        title={full
            ? fullHeader(i18n('unmutedHeader'))
            : popupHeader(i18n('unmutedHeader'))}
        actionDesc={i18n('muteBtn')}
        enableBulk={full}
        onAction={channel => {
            alert(i18n('removeUnmuteConfirm', channel.display), true, false)
                .then(() => {
                    bMessage('set', 'remove-mute', channel)
                        .catch(error => alert(i18n('removeFailed', error), false, true))
                })
        }}
        onBulkAction={channels => {
            alert(i18n('bulkRemoveUnmuteConfirm', channels.length), true, false)
                .then(() => {
                    bMessage('set', 'remove-mute', channels.map(channel => channel.id))
                        .catch(error => alert(i18n('removeFailed', error), false, true))
                })
        }}
        exportKey='muted' />
}

export { WhitelistTable, ExcludeTable, BlacklistTable, MutelistTable, UnmutelistTable }