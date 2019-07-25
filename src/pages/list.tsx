import * as React from 'react';
import { FunctionComponent, useState, useEffect } from 'react';
import { bMessage, Confirm, fullHeader, popupHeader, i18n } from './common';
import { ChannelList, Channel } from '../typings';
import Link from './link';

interface ChannelMod extends Channel {
    checked: boolean;
}
type ChannelListModify = Array<ChannelMod>;

const ChannelTable: FunctionComponent<{
    list: ChannelList;
    title: string | JSX.Element;
    actionDesc: string;
    enableBulk: boolean;
    onAction: (item: Channel) => any;
    onBulkAction: (items: Array<Channel>) => any;
}> = ({ title, list, onBulkAction, enableBulk, onAction, actionDesc }) => {
    const [channels, setChannels] = useState([] as ChannelListModify);
    const getURL = (id: string) => 'https://youtube.com/channel/' + id;
    const toggleCheck = (_id: string) => enableBulk && setChannels(channels
        .map(({ checked, id, display, username }) => ({
            checked: _id === id ? !checked : checked,
            id,
            display,
            username
        })))
    const selectionsMade = () => channels.some(channel => channel.checked);
    const onListAction = () => {
        const selected = channels
            .filter(({ checked }) => checked)
            .map(({ id, display, username }) => ({ id, display, username }));
        onBulkAction(selected);
    }
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

    return <div className='clearfix'>
        {title}
        <table className='table table-sm table-hover'>
            <thead className='thead-dark d-sm-none d-md-table-header-group'>
                <tr>
                    {enableBulk && <th></th>}
                    <th>{i18n('channelColumn')}</th>
                    <th>{i18n('removeRow')}</th>
                </tr>
            </thead>
            <tbody>
                {!channels.length && <tr>
                    <td className='text-muted'>{i18n('emptyList')}</td>
                    <td></td>
                    <td></td>
                </tr>}
                {channels.map(channel => <tr
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
                            <i className='fas fa-minus-circle' />
                        </button>
                    </td>
                </tr>)}
            </tbody>
        </table>
        {selectionsMade() && <button
            className='btn btn-sm btn-danger float-right mb-2'
            onClick={onListAction}>
            {i18n('bulkRemoveBtn')}
        </button>}
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
    />
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
        }} />
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
        }} />
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
            alert(i18n('removeunMuteConfirm', channel.display), true, false)
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
        }} />
}

export { WhitelistTable, BlacklistTable, MutelistTable, UnmutelistTable }