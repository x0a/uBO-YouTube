import { Component, Fragment } from "react";
import Alert from "./Alert.jsx";
import SettingsTools from "./Settings.jsx";
import { ChannelSearch } from "./ChannelSearch.jsx";
import { clickEvents, noop, deepCopy } from "./Common.jsx"

class Main extends Component {
    constructor(props) {
        super(props);

        this.state = {
            alert: { show: false, confirm: false, danger: false, onConfirm: null, onCancel: null },
            settings: {
                whitelisted: [],
                blacklisted: []
            },
            showSearch: false
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
    }

    showAlert(text, confirm = false, danger = false) {
        return new Promise((resolve, reject) => {
            this.setState({
                alert: {
                    show: true,
                    confirm: confirm,
                    danger: danger,
                    onConfirm: resolve,
                    onReject: reject,
                    text: text
                }
            });
        })
    }

    dismissAlert() {
        this.setState({ alert: { show: false } })
    }

    setSettings(settings, response = false) {
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

    removeBlack(item) {
        this.settingsComp.removeBlack(item);
    }

    removeWhite(item) {
        return this.settingsComp.removeWhite(item);
    }

    addBlacklist(item) {
        this.settingsComp.addBlacklist(item);
    }

    addWhite(item) {
        return this.settingsComp.addWhite(item);
    }

    toggleWhite(item) {
        return new Promise((resolve, reject) => {
            if (this.state.settings.whitelisted.findIndex(i => i.id === item.id) !== -1) {
                this.removeWhite(item)
                    .then(resolve)
                    .catch(reject);
            } else {
                this.addWhite(item)
                    .then(resolve)
                    .catch(reject);
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
            list={this.state.settings.whitelisted}
            remove={this.removeWhite}
            whitelist={true}>{!this.full && addBtn}</ChannelList>;

        let blacklist = <ChannelList
            full={this.full}
            name="Blacklisted Advertisers"
            list={this.state.settings.blacklisted}
            remove={this.removeBlack} />;

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
            onCancel={this.state.alert.confirm ? this.state.alert.onReject : null}
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
                        {adsUi}
                    </div>
                    <hr />
                    {settingsUi}
                </div>
            </Fragment>;
        }
    }
}


class ChannelList extends Component {
    constructor(props) {
        super(props);
        this.name = props.name || "";
        this.remove = props.remove;
        this.state = {
            list: props.list || []
        };
        this.whitelist = props.whitelist;
        this.full = props.full;
        this.emptyRow = <tr>
            <td className="text-muted">None</td>
            <td />
        </tr>;
    }
    componentWillReceiveProps(nextProps) {
        let nextState = {};

        if (nextProps.list) {
            nextState.list = nextProps.list;
        }

        this.setState(nextState);
    }

    render() {
        let title = this.full ? <h4>{this.name}</h4> : null;
        let list = !this.state.list.length ? this.emptyRow : this.state.list.map(item => <ListItem
            key={item.id}
            full={this.full}
            onAction={this.remove}
            actionName={this.whitelist ? "Remove from whitelist" : "Remove from blacklist"}
            whitelist={this.whitelist}
            channelId={item} />)

        return <Fragment>
            {title}
            <table className="table table-striped table-sm">
                <thead className="thead-dark">
                    <tr>
                        <th>{this.full ? "Channel" : this.name}</th>
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

class AdList extends Component {
    constructor(props) {
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
            browser.runtime.sendMessage({ action: "recentads" }, response => {
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
                        const decoded = decodeURIComponent(item.title);

                        if (decoded.length > 20)
                            item.videoTitle = decoded.substring(0, 20) + "..."
                        else
                            item.videoTitle = decoded;
                        item.title = decoded;
                    } else {
                        item.videoTitle = "Ad";
                    }
                }

                this.setState({ list: response }, resolve);
            })
        })
    }

    blacklist(item) {
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
                actionName="Add to blacklist"
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

class ListItem extends Component {
    constructor(props) {
        super(props);
        this.full = props.full;
        this.callAction = props.onAction;
        this.whitelist = props.whitelist;
        this.actionName = props.actionName || "Remove from whitelist";
        this.actionDOM = props.actionDOM;

        this.state = {
            channelId: props.channelId,
            url: this.getUrl(props.channelId)
        };

        this.action = this.action.bind(this);
        this.open = this.open.bind(this);
    }

    componentWillReceiveProps(nextProps) {
        if (this.state.channelId.id !== nextProps.channelId.id) {
            this.setState({
                channelId: nextProps.channelId,
                url: this.getUrl(this.props.channelId)
            })
        }
    }
    getUrl(item) {
        return "https://youtube.com/channel/" + item.id + (this.whitelist ? "?igno=re&disableadblock=1" : "");
    }

    action() {
        this.callAction(this.state.channelId);
    }

    open(event) {
        if (event.button === 0 || event.button === 1) {
            event.preventDefault();
            browser.tabs.create({
                url: this.state.url
            })
        }
    }

    mousedown(event) {
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
                        title={this.actionName}>
                        {this.actionDOM || <i className="fas fa-minus-circle" />}
                    </button>
                </td>
            </tr>
        } else {
            return <tr>
                <td>
                    <button className="bold link" onMouseUp={this.open} onMouseDown={this.mousedown}>
                        {this.state.channelId.display}
                    </button>
                </td>
                <td>
                    <button className="link remove" onClick={this.action} title={this.actionName}>
                        {this.actionDOM || <i className="fas fa-minus-circle" />}
                    </button>
                </td>
            </tr>
        }
    }
}


if (!window.browser) {
    window.browser = chrome;
}

document.addEventListener("DOMContentLoaded", () =>
    ReactDOM.render(
        <Main full={location.href.indexOf("/settings.html") !== -1} />,
        document.getElementById('root')
    )
)
