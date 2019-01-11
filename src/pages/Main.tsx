import * as ReactDOM from "react-dom";
import * as React from "react";
import { Component, Fragment } from "react";
import Alert from "./Alert";
import SettingsTools from "./Settings";
import { ChannelSearch } from "./ChannelSearch";
import { clickEvents } from "./Common"
import browser from "../browser"
import { Settings as _Settings, ChannelList as _ChannelList, Channel, Ad } from "../typings"

interface AlertState {
    show: boolean;
    confirm: boolean;
    danger: boolean;
    text: string;
    onConfirm?: () => void;
    onCancel?: () => void;
}
interface Settings {
    whitelisted: _ChannelList,
    blacklisted: _ChannelList;
    muted: Array<any>;
    muteAll: boolean;
}
interface MainState {
    alert: AlertState,
    settings: Settings;
    showSearch: boolean;
}

interface MainProps {
    showSearch: boolean;
    full: boolean;

}
class Main extends Component<MainProps, MainState> {
    full: boolean;
    settingsComp: SettingsTools;
    adsComp: AdList;
    constructor(props: MainProps) {
        super(props);

        this.state = {
            alert: Alert.defaultProps(),
            settings: {
                whitelisted: [],
                blacklisted: [],
                muted: [],
                muteAll: false
            },
            showSearch: props.showSearch || false
        }

        this.full = props.full;
        this.toggleSearch = this.toggleSearch.bind(this);
        this.showAlert = this.showAlert.bind(this);
        this.dismissAlert = this.dismissAlert.bind(this);
        this.setSettings = this.setSettings.bind(this);
        this.removeWhite = this.removeWhite.bind(this);
        this.removeBlack = this.removeBlack.bind(this);
        this.addBlacklist = this.addBlacklist.bind(this);
        this.addWhite = this.addWhite.bind(this);
        this.toggleWhite = this.toggleWhite.bind(this);
        this.refreshAll = this.refreshAll.bind(this);
        this.toggleMuteAll = this.toggleMuteAll.bind(this);
        this.removeMute = this.removeMute.bind(this);
    }

    showAlert(text: string, confirm = false, danger = false): Promise<void> {
        return new Promise((resolve, reject) => {
            this.setState({
                alert: {
                    show: true,
                    confirm: confirm,
                    danger: danger,
                    onConfirm: resolve,
                    onCancel: reject,
                    text: text
                } as AlertState
            });
        })
    }

    dismissAlert() {
        this.setState({ alert: Alert.defaultProps() })
    }

    setSettings(settings: any | _Settings, response = false): Promise<void> {
        return new Promise((resolve, reject) => {
            if (response) {
                if (settings && settings.action === "update") {
                    settings = settings.settings;
                } else {
                    resolve();
                    return;
                }
            }
            this.setState({ settings: settings }, resolve);
        });

    }

    toggleSearch() {
        this.setState({ showSearch: !this.state.showSearch })
    }
    toggleMuteAll() {
        this.settingsComp.toggleMuteAll(!this.state.settings.muteAll);
    }
    removeMute(item: Channel) {
        this.settingsComp.removeMute(item, this.state.settings.muteAll);
    }
    removeBlack(item: Channel) {
        this.settingsComp.removeBlack(item);
    }

    removeWhite(item: Channel) {
        return this.settingsComp.removeWhite(item);
    }

    addBlacklist(item: Channel) {
        this.settingsComp.addBlacklist(item);
    }

    addWhite(item: Channel) {
        return this.settingsComp.addWhite(item);
    }

    toggleWhite(item: Channel): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.state.settings.whitelisted.findIndex(i => i.id === item.id) !== -1) {
                return this.removeWhite(item)
            } else {
                return this.addWhite(item)
            }
        })

    }

    refreshAll() {
        return Promise.all([this.settingsComp.getList(), this.adsComp.getList()]);
    }

    render() {
        const hideMain = this.state.alert.show || this.state.showSearch;
        const hideSearch = this.state.alert.show || !this.state.showSearch;

        let addBtn = <button
            className={this.full ? "btn btn-primary" : "link refresh"}
            onClick={this.toggleSearch}
            ref={clickEvents.bind(this.full)}>
            <i className="fas fa-search" />
            {this.full ? " Find channels" : ""}
        </button>;

        let whitelist = <ChannelList
            full={this.full}
            name="Whitelisted Channels"
            actionTip="Remove from whitelist"
            list={this.state.settings.whitelisted}
            remove={this.removeWhite}
            whitelist={true}>{!this.full && addBtn}</ChannelList>;

        let blacklist = <ChannelList
            full={this.full}
            name="Blacklisted Advertisers"
            actionTip="Remove from blacklist"
            list={this.state.settings.blacklisted}
            remove={this.removeBlack} />;
        let muteTableName = this.state.settings.muteAll ? "Unmuted Advertisers" : "Muted Advertisers";
        let muteToggle = <div className="row">
            <div className="col">
                {muteTableName}
            </div>
            <div className="col">
                <div className="btn-group btn-group-toggle">
                    <label
                        title="Mute ads from these advertisers"
                        className={"btn btn-sm btn-secondary " + (!this.state.settings.muteAll ? "active" : "")}
                    >
                        <input
                            type="radio"
                            autoComplete="off"
                            name="muteAll"
                            checked={!this.state.settings.muteAll}
                            onChange={this.toggleMuteAll.bind(this, false)}
                        />
                        Include channels
                </label>
                    <label
                        title="Mute all ads except from these advertisers"
                        className={"btn btn-sm btn-secondary " + (this.state.settings.muteAll ? "active" : "")}
                    >
                        <input
                            type="radio"
                            autoComplete="off"
                            name="muteAll"
                            checked={this.state.settings.muteAll}
                            onChange={this.toggleMuteAll.bind(this, true)}
                        />
                        Exempt channels
                </label>
                </div>
            </div>
        </div>;
        let muted = <ChannelList
            full={this.full}
            name={this.full ? muteToggle : muteTableName}
            list={this.state.settings.muted}
            actionTip={this.state.settings.muteAll ? "Remove mute exemption" : "Stop muting ads from this advertiser"}
            remove={this.removeMute} />;
        let adsUi = <AdList full={this.full} blacklist={this.addBlacklist} ref={el => this.adsComp = el} />;

        let settingsUi = <SettingsTools
            ref={el => this.settingsComp = el}
            full={this.full}
            askConfirm={this.showAlert}
            requestRefresh={this.refreshAll}
            receivedSettings={this.setSettings}>{this.full ? addBtn : ""}</SettingsTools>;

        let channelSearch = <ChannelSearch
            full={this.full}
            whitelist={this.state.settings.whitelisted}
            dismiss={this.toggleSearch}
            show={this.state.showSearch}
            onSelected={this.toggleWhite} />;

        let alert = this.state.alert.show && <Alert
            onConfirm={this.state.alert.onConfirm}
            onCancel={this.state.alert.confirm ? this.state.alert.onCancel : null}
            danger={this.state.alert.danger}
            dismiss={this.dismissAlert}
            text={this.state.alert.text} />;


        if (this.full) {
            return <Fragment>
                {alert}
                <div className={"container "}>
                    {channelSearch}
                </div>
                <div className={"container " + (hideMain ? "blur" : "")}>
                    {settingsUi}
                    <hr />
                    <div className="row">
                        <div className="col-md">
                            {whitelist}
                        </div>
                        <div className="col-md">
                            {blacklist}
                            {muted}
                            {adsUi}
                        </div>
                    </div>
                </div>
                <a className="text-muted support" href="https://github.com/x0a/YouTube-Channel-Whitelist-for-uBlock-Origin" title="Report an issue">
                    <svg aria-hidden="true" data-prefix="fab" data-icon="github" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512" className="svg-inline--fa fa-github fa-w-16 fa-3x"><path fill="currentColor" d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"></path></svg>
                </a>
            </Fragment>
        } else {
            return <Fragment>
                {alert}
                <div className={"search " + (hideSearch ? "hidden" : "")}>
                    {channelSearch}
                </div>
                <div className={"main " + (hideMain ? "hidden" : "")}>
                    <div className="table-container">
                        {whitelist}
                        {blacklist}
                        {muted}
                        {adsUi}
                    </div>
                    <hr />
                    {settingsUi}
                </div>
            </Fragment>;
        }
    }
}

interface ChannelListState {
    name: any;
    list: _ChannelList
    actionTip: string;
}
interface ChannelListProps {
    full: boolean;
    remove: (channel: Channel) => void;
    name: any;
    list: _ChannelList;
    actionTip: string;
    whitelist?: boolean;
}
class ChannelList extends Component<ChannelListProps, ChannelListState> {
    remove: (channel: Channel) => void;
    whitelist: boolean;
    full: boolean;
    emptyRow: any;

    constructor(props: ChannelListProps) {
        super(props);
        this.remove = props.remove;
        this.state = {
            name: props.name || "",
            list: props.list || [],
            actionTip: props.actionTip
        };
        this.whitelist = props.whitelist;
        this.full = props.full;
        this.emptyRow = <tr>
            <td className="text-muted">None</td>
            <td />
        </tr>;
    }
    componentWillReceiveProps(nextProps: ChannelListProps) {
        let nextState = {};

        if (nextProps.list) {
            nextState = {
                list: nextProps.list,
                name: nextProps.name,
                actionTip: nextProps.actionTip
            }
        }

        this.setState(nextState);
    }

    render() {
        const list = !this.state.list.length ? this.emptyRow : this.state.list.map(item => <ListItem
            key={item.id}
            full={this.full}
            onAction={this.remove}
            actionTip={this.state.actionTip}
            whitelist={this.whitelist}
            channelId={item} />)

        return <Fragment>
            {this.full ? <h4>{this.state.name}</h4> : null}
            <table className="table table-striped table-sm">
                <thead className="thead-dark">
                    <tr>
                        <th>{this.full ? "Channel" : this.state.name}</th>
                        <th>{this.full ? "Remove" : this.props.children}</th>
                    </tr>
                </thead>
                <tbody>
                    {list}
                </tbody>
            </table>
        </Fragment>
    }
}

interface AdListProps {
    full: boolean;
    blacklist: (channel: Channel) => void;
}

class AdList extends Component<AdListProps, { list: Array<Ad> }>{
    full: boolean;
    emptyRow: any;

    constructor(props: AdListProps) {
        super(props);
        this.state = {
            list: []
        }
        this.full = props.full;
        this.blacklist = this.blacklist.bind(this);
        this.emptyRow = <tr>
            <td className="text-muted">None</td>
            {
                this.full ? <Fragment><td /><td /><td /></Fragment> : <td />
            }
        </tr>;
    }

    componentDidMount() {
        this.getList();
    }

    getList() {
        return new Promise((resolve, reject) => {
            browser.runtime.sendMessage({ action: "get-ads", type: "all" } as any).then((response: Array<Ad>) => {
                console.log("Ads:", response);
                response = response.reverse();

                if (!this.full) {
                    response = response.slice(0, 5);
                } else {
                    response = response.slice(0, 15);
                }

                for (let item of response) {
                    const matches = item.details.url.match(/\&video_id=([A-Za-z_\-0-9]+)\&/);

                    if (matches && matches.length > 1) {
                        const videoId = matches[1];
                        item.videoUrl = "http://www.youtube.com/watch?v=" + videoId;
                    }

                    if (item.title) {
                        if (item.title.length > 20)
                            item.videoTitle = item.title.substring(0, 20) + "..."
                        else
                            item.videoTitle = item.title;
                    } else {
                        item.videoTitle = "Ad";
                    }
                }

                this.setState({ list: response }, resolve);
            })
        })
    }

    blacklist(item: Channel) {
        this.props.blacklist(item);
    }

    render() {
        let title = this.full ? <h4>Recently detected advertisers</h4> : null;
        let list = !this.state.list.length ? this.emptyRow : this.state.list.map(item =>
            <ListItem
                key={item.channelId.id}
                full={this.full}
                channelId={item.channelId}
                onAction={this.blacklist}
                actionTip="Add to blacklist"
                actionDOM={<i className="fas fa-ban" />} >
                <td>
                    <a href={item.videoUrl} title={item.title}>
                        <i className="fas fa-link" /> {item.videoTitle}
                    </a>
                </td>
                {item.blocked ?
                    <td><i className="fas fa-video-slash" /> Blocked</td>
                    :
                    <td><i className="fas fa-video" /> Allowed</td>
                }
            </ListItem>)

        return <Fragment>
            {title}
            <table className="table table-striped table-sm">
                <thead className="thead-dark">
                    <tr>
                        <th>{this.full ? "Advertiser" : "Recently detected advertisers"}</th>
                        {this.full ? <th>Video</th> : null}
                        {this.full ? <th>Status</th> : null}
                        <th>{this.full ? "Block" : this.props.children}</th>
                    </tr>
                </thead>
                <tbody>{list}</tbody>
            </table>
        </Fragment>
    }
}

interface ListItemState {
    channelId: Channel;
    url: string,
    actionTip: string;
}
interface ListItemProps {
    full: boolean;
    onAction: (channel: Channel) => void;
    actionTip: string;
    whitelist?: boolean;
    actionDOM?: any;
    channelId: Channel;
}
class ListItem extends Component<ListItemProps, ListItemState> {
    full: boolean;
    callAction: ListItemProps["onAction"];
    whitelist: boolean;
    actionDOM: any;

    constructor(props: ListItemProps) {
        super(props);
        this.full = props.full;
        this.callAction = props.onAction;
        this.whitelist = props.whitelist;
        this.actionDOM = props.actionDOM;

        this.state = {
            channelId: props.channelId,
            url: this.getUrl(props.channelId),
            actionTip: props.actionTip,
        };

        this.action = this.action.bind(this);
        this.open = this.open.bind(this);
    }

    componentWillReceiveProps(nextProps: ListItemProps) {
        if (this.state.channelId.id !== nextProps.channelId.id || this.state.actionTip !== nextProps.actionTip) {
            this.setState({
                channelId: nextProps.channelId,
                url: this.getUrl(this.props.channelId),
                actionTip: nextProps.actionTip
            })
        }
    }
    getUrl(item: Channel) {
        return "https://youtube.com/channel/" + item.id + (this.whitelist ? "?igno=re&disableadblock=1" : "");
    }

    action() {
        this.callAction(this.state.channelId);
    }

    open(event: MouseEvent) {
        if (event.button === 0 || event.button === 1) {
            event.preventDefault();
            browser.tabs.create({
                url: this.state.url
            })
        }
    }

    mousedown(event: MouseEvent) {
        if (event.button === 1) {
            event.preventDefault();
        }
    }

    render() {
        if (this.full) {
            return <tr>
                <td>
                    <a href={this.state.url}>
                        {this.state.channelId.display}
                    </a>
                </td>
                {this.props.children ? this.props.children : null}
                <td>
                    <button
                        className="btn btn-link table-action text-danger float-right"
                        onClick={this.action}
                        title={this.state.actionTip}>
                        {this.actionDOM || <i className="fas fa-minus-circle" />}
                    </button>
                </td>
            </tr>
        } else {
            return <tr>
                <td>
                    <button className="bold link" onMouseUp={this.open as any} onMouseDown={this.mousedown as any}>
                        {this.state.channelId.display}
                    </button>
                </td>
                <td>
                    <button className="link remove" onClick={this.action} title={this.state.actionTip}>
                        {this.actionDOM || <i className="fas fa-minus-circle" />}
                    </button>
                </td>
            </tr>
        }
    }
}
(window as any).browser = browser;
document.addEventListener("DOMContentLoaded", () =>
    ReactDOM.render(
        <Main
            showSearch={location.hash === "#searchpermissions"}
            full={location.href.indexOf("/settings.html") !== -1}
        />,
        document.getElementById('root')
    )
)