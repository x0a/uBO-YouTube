import * as React from "react";
import { FunctionComponent, useState, useEffect } from "react";
import { bMessage, Confirm, fullHeader, popupHeader } from "./common";
import { ChannelList, Channel } from "../typings";
import Link from "./link";
interface ChannelMod extends Channel {
    checked: boolean;
}
type ChannelListModify = Array<ChannelMod>;

const ChannelTable: FunctionComponent<{
    list: ChannelList
    title: string | JSX.Element,
    actionDesc: string,
    onAction: (item: Channel) => any
    enableBulk: boolean;
    onBulkAction: (items: Array<Channel>) => any;
}> = ({ title, list, onBulkAction, enableBulk, onAction, actionDesc }) => {
    const [channels, setChannels] = useState([] as ChannelListModify);
    const getURL = (id: string) => "https://youtube.com/channel/" + id;
    const toggleCheck = (_id: string) => enableBulk && setChannels(channels
        .map(({ checked, id, display, username }) => ({
            checked: _id === id ? !checked : checked,
            id,
            display,
            username
        })))
    const checkedCount = () => channels.some(channel => channel.checked);
    const onListAction = () => {
        const selected = channels
            .filter(({ checked }) => checked)
            .map(({ id, display, username }) => ({ id, display, username }));
        onBulkAction(selected);
    }
    useEffect(() => {
        setChannels(list
            .map(({ id, display, username }) => ({ checked: false, id, display, username })));
    }, [list])

    return <div className="clearfix">
        {title}
        <table className="table table-sm table-hover">
            <thead className="thead-dark d-sm-none d-md-table-header-group">
                <tr>
                    {enableBulk && <th></th>}
                    <th>Channel</th>
                    <th>Remove</th>
                </tr>
            </thead>
            <tbody>
                {!channels.length && <tr>
                    <td className="text-muted">None</td>
                    <td></td>
                    <td></td>
                </tr>}
                {channels.map(channel => <tr
                    key={channel.id}
                    className={"cursor-pointer " + (channel.checked ? "table-active" : "")}
                    onClick={() => toggleCheck(channel.id)}>
                    {enableBulk && <td>
                        <input type="checkbox" checked={channel.checked} onChange={() => toggleCheck(channel.id)} />
                    </td>}
                    <td>
                        <Link className="font-weight-bold-sm text-center" href={getURL(channel.id)}>
                            {channel.display}
                        </Link>
                    </td>
                    <td>
                        <button
                            className="btn btn-link text-danger float-right m-0 p-0"
                            onClick={onAction.bind(this, channel)}
                            title={actionDesc}>
                            <i className="fas fa-minus-circle" />
                        </button>
                    </td>
                </tr>)}
            </tbody>
        </table>
        {checkedCount() && <button
            className="btn btn-sm btn-danger float-right mb-2"
            onClick={onListAction}>
            Remove selected
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
            ? fullHeader("Whitelisted Channels")
            : popupHeader("Whitelisted Channels")}
        actionDesc="Remove channel from whitelist"
        enableBulk={full}
        onAction={channel => {
            alert("Are you sure you want to remove '" + channel.display + "' from whitelist?", true, false)
                .then(() => {
                    bMessage("set", "remove-white", channel)
                        .catch(error => alert("Could not remove: " + error, false, true))
                })
        }}
        onBulkAction={channels => {
            alert("Are you sure you want to remove " + channels.length + " items from whitelist?", true, false)
                .then(() => {
                    bMessage("set", "remove-white", channels.map(channel => channel.id))
                        .catch(error => alert("Could not remove requested items" + error, false, true))
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
            ? fullHeader("Blacklisted Advertisers")
            : popupHeader("Blacklisted Advertisers")}
        actionDesc="Remove advertiser from blacklist"
        enableBulk={full}
        onAction={channel => {
            alert("Are you sure you want to remove '" + channel.display + "' from blacklist?", true, false)
                .then(() => {
                    bMessage("set", "remove-black", channel)
                        .catch(error => alert("Could not remove: " + error, false, true))
                })
        }}
        onBulkAction={channels => {
            alert("Are you sure you want to remove " + channels.length + " items from blacklist?", true, false)
                .then(() => {
                    bMessage("set", "remove-black", channels.map(channel => channel.id))
                        .catch(error => alert("Could not remove requested items: " + error, false, true))
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
            ? fullHeader("Muted Advertisers")
            : popupHeader("Muted Advertisers")}
        actionDesc="Remove advertiser from mutelist"
        enableBulk={full}
        onAction={channel => {
            alert("Are you sure you want to remove '" + channel.display + "' from mutelist?", true, false)
                .then(() => {
                    bMessage("set", "remove-mute", channel)
                        .catch(error => alert("Could not remove: " + error, false, true))
                })
        }}
        onBulkAction={channels => {
            alert("Are you sure you want to remove " + channels.length + " items from mute list", true, false)
                .then(() => {
                    bMessage("set", "remove-mute", channels.map(channel => channel.id))
                        .catch(error => alert("Could not remove requested items: " + error, false, true))
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
            ? fullHeader("Unmuted Advertisers")
            : popupHeader("Unmuted Advertisers")}
        actionDesc="Unmute advertiser"
        enableBulk={full}
        onAction={channel => {
            alert("Are you sure you want to resume muting for '" + channel.display + "'?", true, false)
                .then(() => {
                    bMessage("set", "remove-mute", channel)
                        .catch(error => alert("Could not remove: " + error, false, true))
                })
        }}
        onBulkAction={channels => {
            alert("Are you sure you want to resume muting for " + channels.length + " items?", true, false)
                .then(() => {
                    bMessage("set", "remove-mute", channels.map(channel => channel.id))
                        .catch(error => alert("Could not remove requested items: " + error, false, true))
                })
        }} />
}

export { WhitelistTable, BlacklistTable, MutelistTable, UnmutelistTable }