import * as React from "react";
import { Component, Fragment } from "react";
import { clickEvents, deepCopy } from "./Common"
import { Settings as _Settings, Channel } from "../typings";
import { Resolver } from "dns";

interface SettingsToolsState {
    settings: _Settings;
    refreshing: boolean;
}
interface SettingsToolsProps {
    receivedSettings: (settings: any | _Settings, response?: boolean) => Promise<void>;
    full: boolean;
    askConfirm: (text: string, confirm?: boolean, danger?: boolean) => Promise<void>;
    requestRefresh: () => Promise<[{}, {}]>;
}
interface SettingsResponse {
    action: string;
    settings: _Settings;
    error: boolean;
}
class SettingsTools extends Component<SettingsToolsProps, SettingsToolsState> {
    fileImport?: HTMLInputElement;
    isLinuxFirefoxOrEdge: boolean;
    full: boolean;
    downloadLink?: HTMLAnchorElement;
    showAlert: SettingsToolsProps["askConfirm"];
    requestRefresh: SettingsToolsProps["requestRefresh"];
    pushSettings: SettingsToolsProps["receivedSettings"];
    refreshing: boolean;

    constructor(props: SettingsToolsProps) {
        super(props);
        this.fileImport = null;
        this.state = {
            settings: {
                blacklisted: [],
                whitelisted: [],
                muted: [],
                muteAll: false,
                skipOverlays: true,
            },
            refreshing: false
        }

        this.isLinuxFirefoxOrEdge = !!(browser.runtime.getBrowserInfo || window.navigator.platform.indexOf("Win") === -1 || window.navigator.platform.indexOf("Edge/") !== -1);
        this.pushSettings = props.receivedSettings;
        this.full = props.full;
        this.showAlert = props.askConfirm;
        this.requestRefresh = props.requestRefresh;

        this.export = this.export.bind(this);
        this.import = this.import.bind(this);
        this.clearSettings = this.clearSettings.bind(this);
        this.fileChange = this.fileChange.bind(this);
        this.getList = this.getList.bind(this);
        this.refreshAll = this.refreshAll.bind(this);
        this.onResponse = this.onResponse.bind(this);
    }

    componentDidMount() {
        this.downloadLink = document.createElement("a");
        this.downloadLink.download = "ublock-youtube.json";
        this.downloadLink.classList.add("hidden");
        document.body.appendChild(this.downloadLink);

        browser.runtime.onMessage.addListener((requestData: SettingsResponse, sender: any, sendResponse: any) => {
            this.onResponse(requestData);
        });
        this.getList();
    }

    componentWillUnmount() {
        document.body.removeChild(this.downloadLink);
    }

    getList() {
        return new Promise((resolve, reject) => {
            browser.runtime.sendMessage({ action: "get-lists" } as any).then((response: _Settings) => {
                this.setSettings(response)
                    .then(resolve);
            })
        })
    }

    refreshAll() {
        this.setState({ refreshing: true });
        // wait til refresh is done, wait an additional 150 ms otherwise animation is too fast.
        console.log("refreshing");
        this.requestRefresh().then(() => {
            console.log("refreshed");
            setTimeout(() => this.setState({ refreshing: false }), 150);
        });
    }

    openSettings() {
        browser.tabs.create({
            active: true,
            url: 'settings.html'
        });
        window.close();
    }

    setSettings(settings: _Settings) {
        return new Promise((resolve, reject) => {
            console.log("Settings:", settings);
            this.setState({ settings: settings });
            return this.pushSettings(settings).then(resolve);
        });
    }

    onResponse(response: SettingsResponse) {
        if (response && response.action === "update")
            return this.setSettings(response.settings);
        else
            return Promise.reject();
    }

    setBulkSettings(settings: _Settings) {
        browser.runtime.sendMessage({ action: "set", changes: { type: "bulk", settings: settings } } as any)
            .then((response: SettingsResponse) => {
                this.onResponse(response);
            })
    }

    export() {
        let fileBlob = new Blob([JSON.stringify(this.state.settings, null, 2)], { type: 'application/json' });
        this.downloadLink.href = URL.createObjectURL(fileBlob);
        this.downloadLink.click();
    }

    import() {
        if (this.fileImport) {
            this.fileImport.click();
        }
    }

    importSettings(settings: _Settings) {
        this.showAlert(["Add", settings.whitelisted.length, "items to whitelist,", settings.blacklisted.length, "to blacklist, and ", settings.muted.length, " items to mutelist?"].join(" "), true).then(() => {
            let newSettings = deepCopy(this.state.settings);

            for (let channel of settings.whitelisted)
                newSettings.whitelisted.push(channel);
            for (let channel of settings.blacklisted)
                newSettings.blacklisted.push(channel);
            for (let channel of settings.muted)
                newSettings.muted.push(channel);
            newSettings.muteAll = settings.muteAll || false;
            newSettings.skipOverlays = settings.skipOverlays;
            this.setBulkSettings(newSettings);
        });
    }

    error(text: string) {
        this.showAlert(text, false, false);
    }

    clearSettings() {
        const question = "This will delete "
            + this.state.settings.whitelisted.length
            + " whitelisted items, "
            + this.state.settings.blacklisted.length
            + " blacklisted items, and "
            + this.state.settings.muted.length
            + " muted items."
            + " You can backup your settings if you don't want to lose them. Do you want to continue?";

        this.showAlert(question, true, true).then(() => {
            let newSettings = deepCopy(this.state.settings);
            newSettings.blacklisted = [];
            newSettings.whitelisted = [];
            newSettings.muted = [];
            this.setBulkSettings(newSettings);
        });
    }

    removeWhite(item: Channel) {
        return new Promise((resolve, reject) => {
            this.showAlert("Are you sure you want to remove '" + item.display + "' from whitelist?", true, false).then(() =>
                browser.runtime.sendMessage({ action: "set", changes: { type: "remove-white", channelId: item } } as any).then((response: SettingsResponse) => {
                    this.onResponse(response)
                        .then(resolve)
                        .catch(reject)
                })
            ).catch(reject);
        })

    }

    removeBlack(item: Channel) {
        this.showAlert("Are you sure you want to remove '" + item.display + "' from blacklist?", true, false).then(() =>
            browser.runtime.sendMessage({ action: "set", changes: { type: "remove-black", channelId: item } } as any).then((response: SettingsResponse) => {
                this.onResponse(response)
            })
        )
    }
    removeMute(item: Channel, allMuted: boolean) {
        const action = allMuted ? "remove mute exemption" : "stop muting ads"

        this.showAlert(`Are you sure you want to ${action} from '${item.display}'?`, true, false).then(() =>
            browser.runtime.sendMessage({ action: "set", changes: { type: "remove-mute", channelId: item } } as any).then((response: SettingsResponse) => {
                this.onResponse(response)
            })
        )
    }
    addBlacklist(item: Channel) {
        browser.runtime.sendMessage({ action: "set", changes: { type: "add-black", channelId: item } } as any).then((response: SettingsResponse) => {
            this.onResponse(response)
        })
    }

    addWhite(item: Channel) {
        return new Promise((resolve, reject) => {
            browser.runtime.sendMessage({ action: "set", changes: { type: "add-white", channelId: item } } as any).then((response: SettingsResponse) => {
                this.onResponse(response)
                    .then(resolve)
                    .catch(reject);
            })
        });

    }
    toggleMuteAll(on = false) {
        const alert = on ? this.showAlert("This will mute ads by default, and treat this as a list of exemptions (ads from channels on this list wont be muted).", true) : Promise.resolve();

        alert.then(() => {
            browser.runtime.sendMessage({ action: "set", changes: { type: "mute-all", value: on } } as any).then((response: SettingsResponse) => {
                this.onResponse(response)
            })
        })
    }
    toggleOverlays(on = false) {
        const alert = on ? this.showAlert("Auto-close all ad overlays?", true) : Promise.resolve();

        alert.then(() => {
            browser.runtime.sendMessage({ action: "set", changes: { type: "skip-overlays", value: on } } as any).then((response: SettingsResponse) => {
                this.onResponse(response)
            })
        })
    }
    inblacklist(channelId: string) {
        for (let channel = 0; channel < this.state.settings.blacklisted.length; channel++) {
            if (this.state.settings.blacklisted[channel].id === channelId)
                return channel;
        }
        return -1;
    }

    inwhitelist(channelId: string) {
        for (let channel = 0; channel < this.state.settings.whitelisted.length; channel++) {
            if (this.state.settings.whitelisted[channel].id === channelId)
                return channel;
        }
        return -1;
    }

    inmutelist(channelId: string) {
        for (let channel = 0; channel < this.state.settings.muted.length; channel++) {
            if (this.state.settings.muted[channel].id === channelId)
                return channel;
        }
        return -1;
    }

    fileChange(event: React.FormEvent<HTMLInputElement>) {
        if (!event.currentTarget.files.length) return;

        const file = event.currentTarget.files[0];

        if (file.type === "application/json" || file.type === "") {
            let reader = new FileReader();
            reader.onload = () => {
                let results;

                if ((results = JSON.parse(reader.result as string)) && typeof results === "object" && results.blacklisted && results.whitelisted) {
                    for (let i = 0; i < results.blacklisted.length; i++)
                        if (this.inblacklist(results.blacklisted[i].id) !== -1) {
                            results.blacklisted.splice(i, 1);
                            i--;
                        }
                    for (let i = 0; i < results.whitelisted.length; i++)
                        if (this.inwhitelist(results.whitelisted[i].id) !== -1) {
                            results.whitelisted.splice(i, 1);
                            i--;
                        }
                    for (let i = 0; i < results.muted.length; i++)
                        if (this.inmutelist(results.muted[i].id) !== -1) {
                            results.muted.splice(i, 1);
                            i--;
                        }
                    if (!results.whitelisted.length && !results.blacklisted.length && !results.muted.length)
                        this.error("No new items to add");
                    else
                        this.importSettings(results);
                } else {
                    this.error("File is likely not valid JSON, or missing data.")
                }
            }

            reader.readAsText(file);
        } else {
            this.error("File needs to be of type \"application/json\", detected \"" + file.type + "\" instead");
        }

        this.fileImport.value = "";
    }

    render() {
        const size = this.full ? "" : " btn-sm ";

        if (!this.full && this.isLinuxFirefoxOrEdge) {
            return <div className="bottom">
                <button className="btn btn-primary btn-sm align-right" onClick={this.openSettings}>
                    <i className="fas fa-cog space" />
                    Settings
                    </button>
            </div>
        }

        let refreshBtn;

        if (this.full) {
            refreshBtn = <button className={this.full ? "btn btn-secondary" : "link refresh"}
                onClick={this.refreshAll}
                ref={clickEvents.bind(this.full)}>
                <i className={"fas fa-sync " + (this.state.refreshing ? "fa-spin" : "")} />
                {this.full ? " Refresh" : ""}
            </button>
        }

        return <Fragment>
            <div className="row">
                <div className="col-md">
                    {refreshBtn}
                </div>
                <div className="col-md">
                    <div className={this.full ? "import-export float-right" : "bottom"}>
                        {this.props.children}
                        <button
                            className={"btn btn-primary" + size}
                            type="button"
                            onClick={this.export}
                            title="Export settings to file">
                            <i className="fas fa-download space" />
                            {this.full ? " Export lists" : " Export"}
                        </button>
                        <button
                            className={"btn btn-primary" + size}
                            type="button"
                            onClick={this.import}
                            title="Import settings from file">
                            <i className="fas fa-upload" />
                            {this.full ? " Import lists" : " Import"}
                        </button>
                        <button
                            className={"btn btn-danger" + size + (this.full ? "" : " align-right")}
                            type="button"
                            onClick={this.clearSettings}
                            title="Clear all settings"
                        >
                            <i className="fas fa-trash" />
                            {this.full ? " Delete All" : ""}
                        </button>
                        <input
                            id="import"
                            ref={element => this.fileImport = element}
                            type="file"
                            accept=".json"
                            onChange={this.fileChange}
                            className="hidden" />
                    </div>
                </div>
            </div>
        </Fragment>
    }
}

export default SettingsTools;
