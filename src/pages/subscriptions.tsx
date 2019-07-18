import * as React from "react";
import { FunctionComponent, useState } from "react";
import { Confirm, diffList, bMessage, mergeSettings } from "./common";
import { Channel, ChannelList, Settings } from "../typings";

const ImportSubscriptions: FunctionComponent<{
    alert: Confirm,
    settings: Settings
    className?: string
}> = ({ alert, settings, className }) => {
    const [importing, setImporting] = useState(false);
    const fetchSubscriptions = async (): Promise<Array<Channel>> => {
        const resp = await fetch("https://www.youtube.com/subscription_manager?action_takeout=1");
        const text = await resp.text();
        const xml = new DOMParser().parseFromString(text, "text/xml");
        const channels = Array.from(xml.querySelectorAll("outline"))
            .map(channel => {
                const display = channel.getAttribute("title");
                const username = "";
                const xmlUrl = channel.getAttribute("xmlUrl");
                const id = xmlUrl ? xmlUrl.match(/\=(.+)$/)[1] : "";
                return { display, username, id };
            })
            .filter(channel => !!channel.id)

        return channels;
    }
    const importSubscriptions = () => {
        setImporting(true);
        fetchSubscriptions()
            .then(channels => {
                setImporting(false);
                const nextWhitelist = diffList(settings.whitelisted, channels);
                if (!nextWhitelist.length)
                    return alert("No new channels found");

                alert(`Found ${channels.length} subscriptions, of which ${nextWhitelist.length} are not in the list. Add ${nextWhitelist.length} items?`, true).then(() => {
                    const nextSettings = mergeSettings(settings, {
                        whitelisted: nextWhitelist,
                        blacklisted: [],
                        muted: [],
                        muteAll: settings.muteAll,
                        skipOverlays: settings.skipOverlays
                    })
                    bMessage("set", "bulk", nextSettings);
                })
            })
            .catch(error => { setImporting(false); alert("Could not fetch subscriptions. Make sure you're logged in to YouTube.", false, true) });
    }
    return <button className={"btn btn-sm btn-primary " + className} disabled={importing} onClick={importSubscriptions}>
        Import from subscriptions
    </button>
}
export default ImportSubscriptions