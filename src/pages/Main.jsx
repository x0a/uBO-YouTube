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
        if (response) {
            if (settings && settings.action === "update") {
                settings = settings.settings;
            } else {
                return;
            }
        }
        this.setState({ settings: settings });
    }

    toggleSearch() {
        this.setState({ showSearch: !this.state.showSearch })
    }

    removeBlack(item) {
        this.settingsComp.removeBlack(item);
    }

    removeWhite(item) {
        this.settingsComp.removeWhite(item);
    }

    addBlacklist(item) {
        this.settingsComp.addBlacklist(item);
    }

    addWhite(item) {
        this.settingsComp.addWhite(item);
    }

    toggleWhite(item) {
        if (this.state.settings.whitelisted.findIndex(i => i.id === item.id) !== -1) {
            this.removeWhite(item);
        } else {
            this.addWhite(item);
        }
    }

    refreshAll() {
        this.settingsComp.getList();
        this.adsComp.getList();
    }

    render() {
        const hideMain = this.state.alert.show || this.state.showSearch;
        const hideSearch = this.state.alert.show || !this.state.showSearch;

        let addBtn = <button
            className={this.full ? "btn btn-primary" : "link refresh"}
            onClick={this.toggleSearch}
            ref={clickEvents}>
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
                this.full ? <Fragment><td /><td /></Fragment> : <td />
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
