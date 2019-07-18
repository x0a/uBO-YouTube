import * as React from "react";
import { FunctionComponent } from "react";
import { bMessage, Confirm, fullHeader, popupHeader } from "./common";
import { ChannelList, Channel } from "../typings";
import Link from "./link";

const ChannelTable: FunctionComponent<{
    list: ChannelList
    title: string | JSX.Element,
    actionDesc: string,
    onAction: (item: Channel) => any
}> = ({ title, list, onAction, actionDesc }) => {
    const getURL = (id: string) => "https://youtube.com/channel/" + id;
    return <>
        {title}
        <table className="table table-striped table-sm">
            <thead className="thead-dark d-sm-none d-md-table-header-group">
                <tr>
                    <th>Channel</th>
                    <th>Remove</th>
                </tr>
            </thead>
            <tbody>
                {!list.length && <tr>
                    <td className="text-muted">None</td>
                    <td></td>
                </tr>}
                {list.map(channel => <tr key={channel.id}>
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
    </>
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
        onAction={channel => {
            alert("Are you sure you want to remove '" + channel.display + "' from whitelist?", true, false)
                .then(() => {
                    bMessage("set", "remove-white", channel)
                        .catch(error => alert("Could not remove: " + error, false, true))
                })
        }} />
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
        onAction={channel => {
            alert("Are you sure you want to remove '" + channel.display + "' from blacklist?", true, false)
                .then(() => {
                    bMessage("set", "remove-black", channel)
                        .catch(error => alert("Could not remove: " + error, false, true))
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
        onAction={channel => {
            alert("Are you sure you want to remove '" + channel.display + "' from mutelist?", true, false)
                .then(() => {
                    bMessage("set", "remove-mute", channel)
                        .catch(error => alert("Could not remove: " + error, false, true))
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
        onAction={channel => {
            alert("Are you sure you want to resume muting for '" + channel.display + "'?", true, false)
                .then(() => {
                    bMessage("set", "remove-mute", channel)
                        .catch(error => alert("Could not remove: " + error, false, true))
                })
        }} />
}

export { WhitelistTable, BlacklistTable, MutelistTable, UnmutelistTable }