import * as React from "react";
import { FunctionComponent, useEffect, useState } from "react";
import { ChannelList, Channel, Settings } from "../typings";
import { bMessage, requestGooglePermission, Confirm } from "./common";

const ChannelSearch: FunctionComponent<{
    full: boolean;
    alert: Confirm;
    children?: any;
    whitelisted: ChannelList;
}> = ({ full, whitelisted, alert, children }) => {
    const [search, setSearch] = useState("");
    const [error, setError] = useState(false);
    const [searching, setSearching] = useState(false);
    const [channels, setChannels] = useState([] as any);
    const [permission, setPermission] = useState(false);
    const onChange = (event: React.FormEvent<HTMLInputElement>) => {
        const text = event.currentTarget.value;
        setSearch(text);
        setSearching(true);
    }
    const requestPermission = () => requestGooglePermission()
        .then(granted => setPermission(granted));
        
    useEffect(() => {
        bMessage("permission", "google-api")
            .then(granted => setPermission(granted));
    }, [])
    useEffect(() => {
        let int: number;
        setChannels([]);
        if (search.length) {
            int = setTimeout(() => fetch("https://content.googleapis.com/youtube/v3/search?type=channel&q=" + search + "&maxResults=10&part=snippet&key=AIzaSyCPqJiD5cXWMilMdzmu4cvm8MjJuJsbYIo")
                .then(resp => resp.json())
                .then(json => {
                    setSearching(false);
                    setError(false);
                    setChannels(json.items);
                })
                .catch(err => {
                    setSearching(false);
                    setChannels([]);
                    setError(true);
                }), 800) as any as number;
        } else {
            setSearching(false);
            setError(false);
        }
        return () => clearTimeout(int);
    }, [search])
    let searchIcon = "";

    if (!searching && !error) {
        searchIcon = "fa-search";
    } else if (searching) {
        searchIcon = "fa-spinner fa-spin";
    } else if (error) {
        searchIcon = "fa-exclamation-circle";
    }
    const toggleWhitelist = (channel: Channel, whitelist: boolean) => {
        if (whitelist) {
            bMessage("set", "add-white", channel);
        } else {
            bMessage("set", "remove-white", channel);
        }
    }

    return <div className={full ? "mt-2" : ""}>
        <div className="search-container">
            <input
                type="text"
                onChange={onChange}
                value={search}
                placeholder="Channel name.."
                className="form-control form-control-sm"
                disabled={!permission} />
            <i className={"fas search-feedback " + searchIcon} />
        </div>
        <hr />
        {!permission && <div>
            <p className="text-muted list-group-option">
                A one-time permission needed to search for YouTube channels
            </p>
            <button
                className="btn btn-primary btn-block btn-sm mt-2"
                onClick={requestPermission}>Grant permission</button>
        </div>}
        {permission
            && !error
            && !searching
            && !channels.length
            && <span className={"text-muted list-group-option" + (!permission ? "text-muted" : "")}>
                Type to search for a YouTube channel or
                {children}
            </span>}
        {searching && <span className="bold">Searching...</span>}
        {error && <span className="bold">Could not load results. Offline?</span>}
        {channels.map((item: any) => <ChannelItem
            onClick={toggleWhitelist}
            full={full}
            item={item}
            added={whitelisted.findIndex(channel => channel.id === item.id.channelId) !== -1} />)}
    </div>
}

const ChannelItem: FunctionComponent<{
    item: any;
    added: boolean;
    onClick: (channel: Channel, whitelist: boolean) => any;
    full: boolean;
}> = ({ item, full, added, onClick }) => {
    const title = item.snippet.channelTitle as string;
    const thumbnail = item.snippet.thumbnails.default.url as string;
    const description = item.snippet.description as string;
    const [hovering, setHovering] = useState(false);
    const url = "https://youtube.com/channel/" + item.id.channelId + (added ? "?igno=re&disableadblock=1" : "");
    const toggle = () => {
        const channel = {
            id: item.id.channelId,
            display: item.snippet.title,
            username: ""
        }
        onClick(channel, !added);
    }
    return <div
        className={"channel list-group-item"}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}>

        <div className="channel-thumb-container" >
            <img className="channel-thumb" src={thumbnail} />
        </div>
        <div className="channel-info">
            <a className="channel-name mr-1" href={url}>{title}</a>
            <span className={full ? "channel-desc" : "hidden"}>{description}</span>
        </div>
        <div className={"channel-action " + (hovering || (!hovering && added) ? "" : "invisible")}>
            <button
                className={"btn btn-sm " + (added ? (!hovering ? "btn-link" : "btn-danger") : "btn-primary")}
                disabled={added && !hovering}
                onClick={toggle}>

                {!added && <><i className="fas fa-plus" /><span> Add</span></>}
                {added && !hovering && "Added"}
                {added && hovering && <><i className="fas fas-minus" /><span> Remove</span> </>}
            </button>
        </div>
    </div>
}

export default ChannelSearch;