import { Component, Fragment } from "react";
import { clickEvents, deepCopy } from "./Common.jsx"

class SettingsTools extends Component {
    constructor(props) {
        super(props);
        this.fileImport = null;
        this.state = {
            settings: { blacklisted: [], whitelisted: [] }
        }

        this.isLinuxOrFirefox = !!(browser.runtime.getBrowserInfo || window.navigator.platform.indexOf("Win") === -1);
        this.pushSettings = props.receivedSettings;
        this.full = props.full;
        this.showAlert = props.askConfirm;
        this.requestRefresh = props.requestRefresh;

        this.export = this.export.bind(this);
        this.import = this.import.bind(this);
        this.clearSettings = this.clearSettings.bind(this);
        this.fileChange = this.fileChange.bind(this);
        this.getList = this.getList.bind(this);
    }

    componentDidMount() {
        this.downloadLink = document.createElement("a");
        this.downloadLink.download = "ublock-youtube.json";
        this.downloadLink.classList.add("hidden");
        document.body.appendChild(this.downloadLink);

        browser.runtime.onMessage.addListener((requestData, sender, sendResponse) => {
            this.setSettings(requestData, true);
        });
        this.getList();
    }

    componentWillUnmount() {
        document.body.removeChild(this.downloadLink);
    }

    getList() {
        return new Promise((resolve, reject) => {
            browser.runtime.sendMessage({ action: "get" }, response => {
                this.setSettings(response);
                resolve();
            })
        })
    }

    openSettings() {
        browser.tabs.create({
            active: true,
            url: 'settings.html'
        }, null);
        window.close();
    }

    setSettings(settings, response = false) {
        return new Promise((resolve, reject) => {
            if (response) {
                if (settings && settings.action === "update") {
                    settings = settings.settings;
                } else {
                    return;
                }
            }
            console.log("Settings:", settings);
            this.setState({ settings: settings });
            this.pushSettings(settings)
                .then(resolve)
                .catch(reject);
        })

    }

    setBulkSettings(settings) {
        browser.runtime.sendMessage({ action: "set", changes: { type: "bulk", settings: settings } }, response => {
            this.setSettings(response, true);
        })
    }

    export() {
        let fileBlob = new Blob([JSON.stringify(this.state.settings)], { type: 'application/json' });
        this.downloadLink.href = URL.createObjectURL(fileBlob);
        this.downloadLink.click();
    }

    import() {
        if (this.fileImport) {
            this.fileImport.click();
        }
    }

    importSettings(settings) {
        this.showAlert(["Add", settings.whitelisted.length, "items to whitelist and", settings.blacklisted.length, "to blacklist?"].join(" "), true).then(() => {
            let newSettings = deepCopy(this.state.settings);

            for (let channel of settings.whitelisted)
                newSettings.whitelisted.push(channel);
            for (let channel of settings.blacklisted)
                newSettings.blacklisted.push(channel);

            this.setBulkSettings(newSettings);
        });
    }

    error(text) {
        this.showAlert(text, false, false);
    }

    clearSettings() {
        this.showAlert("This will delete " + this.state.settings.whitelisted.length + " whitelisted items, and " + this.state.settings.blacklisted.length + " blacklisted items. You can backup your settings if you don't want to lose them. Do you want to continue?", true, true).then(() => {
            let newSettings = deepCopy(this.state.settings);
            newSettings.blacklisted = [];
            newSettings.whitelisted = [];
            this.setBulkSettings(newSettings);
        });
    }

    removeWhite(item) {
        return new Promise((resolve, reject) => {
            this.showAlert("Are you sure you want to remove '" + item.display + "' from whitelist?", true, false).then(() =>
                browser.runtime.sendMessage({ action: "set", changes: { type: "remove-white", channelId: item } }, response => {
                    this.setSettings(response, true)
                        .then(resolve)
                        .catch(reject)
                })
            ).catch(reject);
        })

    }

    removeBlack(item) {
        this.showAlert("Are you sure you want to remove '" + item.display + "' from blacklist?", true, false).then(() =>
            browser.runtime.sendMessage({ action: "set", changes: { type: "remove-black", channelId: item } }, response => {
                this.setSettings(response, true)
            })
        )
    }

    addBlacklist(item) {
        browser.runtime.sendMessage({ action: "set", changes: { type: "add-black", channelId: item } }, response => {
            this.setSettings(response, true)
        })
    }

    addWhite(item) {
        return new Promise((resolve, reject) => {
            browser.runtime.sendMessage({ action: "set", changes: { type: "add-white", channelId: item } }, response => {
                this.setSettings(response, true)
                    .then(resolve)
                    .catch(reject);
            })
        })

    }

    inblacklist(channelId) {
        for (let channel = 0; channel < this.state.settings.blacklisted.length; channel++) {
            if (this.state.settings.blacklisted[channel].id === channelId)
                return channel;
        }
        return -1;
    }

    inwhitelist(channelId) {
        for (let channel = 0; channel < this.state.settings.whitelisted.length; channel++) {
            if (this.state.settings.whitelisted[channel].id === channelId)
                return channel;
        }
        return -1;
    }

    fileChange(event) {
        if (!event.target.files.length) return;

        const file = event.target.files[0];

        if (file.type === "application/json" || file.type === "") {
            let reader = new FileReader();
            reader.onload = () => {
                let results;

                if ((results = JSON.parse(reader.result)) && typeof results === "object" && results.blacklisted && results.whitelisted) {
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
                    if (!results.whitelisted.length && !results.blacklisted.length)
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

        if (!this.full && this.isLinuxOrFirefox) {
            return <div className="bottom">
                <button className="btn btn-primary btn-sm align-right" onClick={this.openSettings}>
                    <i className="fas fa-cog space" />
                    Settings
                    </button>
            </div>
        }

        let refreshBtn;

        if (this.full) {
            refreshBtn = <button className={this.full ? "btn btn-primary" : "link refresh"}
                onClick={this.requestRefresh}
                ref={clickEvents}>
                <i className="fas fa-sync" />
                {this.full ? " Refresh" : ""}
            </button>
        }

        return <Fragment>
            {refreshBtn}
            <div className={this.full ? "import-export float-right" : "bottom"}>
                {this.props.children}
                <button
                    className={"btn btn-primary" + size}
                    type="button"
                    onClick={this.export}
                    title="Export settings to file">
                    <i className="fas fa-upload space" />
                    {this.full ? " Export lists" : " Export"}
                </button>
                <button
                    className={"btn btn-primary" + size}
                    type="button"
                    onClick={this.import}
                    title="Import settings from file">
                    <i className="fas fa-download" />
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
        </Fragment>
    }
}

export default SettingsTools;
