"use strict";

import browser from "./browser";
import Development from "./dev-client"
import {
    Channel, ChannelList, Settings,
    Ad, PendingItem, ParsedURL
} from "./typings";

let settings: SettingsManager;
let ads: AdManager;

class SettingsManager {
    whitelisted: ChannelList;
    blacklisted: ChannelList;
    muted: ChannelList;
    muteAll: boolean;
    skipOverlays: boolean;

    constructor(settings: Settings) {
        if (!settings) settings = {} as Settings;
        if (!settings.whitelisted) settings.whitelisted = [];
        if (!settings.blacklisted) settings.blacklisted = [];
        if (!settings.muted) settings.muted = [];
        if (!settings.muteAll) settings.muteAll = false;
        if (!settings.skipOverlays) settings.skipOverlays = true;

        this.whitelisted = settings.whitelisted;
        this.blacklisted = settings.blacklisted;
        this.muted = settings.muted;
        this.muteAll = settings.muteAll
        this.skipOverlays = settings.skipOverlays;
    }

    updateAll(originTab: browser.tabs.Tab) {
        browser.tabs.query({}).then((tabs: Array<browser.tabs.Tab>) => {
            for (let tab of tabs) {
                const origin = (originTab && originTab.id === tab.id) || false;
                browser.tabs.sendMessage(tab.id, { action: "update", settings: settings, initiator: origin })
                    .then((response?: any) => {
                        //console.log(response);
                    });
            }
        });
    }

    static injectAll() {
        browser.tabs.query({}).then((tabs: any) => {
            for (let tab of tabs) {
                browser.tabs.executeScript(tab.id, { file: "content.js" }).then(result => { }).catch(err => { })
            }
        });
    }

    addToWhitelist(channelId: Channel) {
        if (this.inWhitelist(channelId.id) === -1) {
            this.whitelisted.push(channelId);
            return true;
        }
        return false;
    }

    addToBlacklist(channelId: Channel) {
        if (this.inBlacklist(channelId.id) === -1) {
            this.blacklisted.push(channelId);
            return true;
        }
        return false;
    }

    addToMutelist(channelId: Channel) {
        if (this.inMutelist(channelId.id) === -1) {
            this.muted.push(channelId);
            return true;
        }
        return false;
    }

    removeFromWhitelist(id: string) {
        let i = -1;
        let removeCount = 0;

        while ((i = this.inWhitelist(id)) !== -1) {
            this.whitelisted.splice(i, 1);
            removeCount++;
        }
        return removeCount;
    }
    removeFromBlacklist(id: string) {
        let i = -1;
        let removeCount = 0;

        while ((i = this.inBlacklist(id)) !== -1) {
            this.blacklisted.splice(i, 1);
            removeCount++;
        }
        return removeCount;
    }
    removeFromMutelist(id: string) {
        let i = -1;
        let removeCount = 0;

        while ((i = this.inMutelist(id)) !== -1) {
            this.muted.splice(i, 1);
            removeCount++;
        }
        return removeCount;
    }
    inWhitelist(id: string) {
        for (let index in this.whitelisted) {
            if (this.whitelisted[index].id === id)
                return ~~index;
        }
        return -1;
    }
    inBlacklist(id: string) {
        for (let index in this.blacklisted) {
            if (this.blacklisted[index].id === id)
                return ~~index;
        }
        return -1;
    }
    inMutelist(id: string) {
        for (let index in this.muted) {
            if (this.muted[index].id === id)
                return ~~index;
        }
        return -1;
    }
    toggleMuteAll(on: boolean) {
        this.muteAll = !!on;
    }
    toggleSkipOverlays(on: boolean) {
        this.skipOverlays = !!on;
    }
    get(): Settings {
        return {
            whitelisted: this.whitelisted,
            blacklisted: this.blacklisted,
            muted: this.muted,
            muteAll: this.muteAll,
            skipOverlays: this.skipOverlays
        };
    }
    save() {
        return new Promise((resolve, reject) => {
            browser.storage.sync.set(this.get() as any)
                .then(value => resolve())
            setTimeout(resolve, 800) // resolve anyway if it takes too long, for Edge
        })
    }
}

class AdManager {
    ads: Array<Ad>;
    pending: Array<PendingItem>
    apiAvailable: boolean;

    constructor() {
        this.ads = [];
        this.pending = [];
        this.apiAvailable = false;
        this.checkPermissions();
    }

    push(ad: Ad) {
        while (this.ads.length > 20) {
            this.ads.shift(); // just trim a little off the top fam
        }
        this.ads.push(ad);
    }

    queue(details: any): Array<Function> {
        let resolver, rejector;

        let promise = new Promise<Ad>((resolve, reject) => {
            resolver = resolve;
            rejector = reject;
        });

        this.pending.push({ details: details, promise: promise });

        promise.then((ad: Ad) => {
            this.pending.splice(this.pending.findIndex(item => promise === item.promise), 1)
            this.push(ad);
            this.sendToTab(ad.details.tabId, ad);
        }).catch(ad => {
            console.error("No UCID available", ad)
        });

        return [resolver, rejector];
    }

    get(): Promise<Array<Ad>> {
        let promises = []
        for (let i = this.pending.length - 1; i > -1; i--) {
            promises.push(this.pending[i].promise)
        }
        return Promise.all(promises).then(() => this.ads);
    }

    sendToTab(tabId: number, ad: Ad) {
        browser.tabs.query({}).then((tabs: Array<browser.tabs.Tab>) => {
            for (let tab of tabs) {
                if (tab.id !== tabId) continue;
                browser.tabs.sendMessage(tab.id, { action: "ad-update", ad: ad })
                    .then((response?: any) => { });
                return;
            }
        });
    }

    getLastAdFromTab(tabId: number): Promise<Ad> {
        for (let i = this.pending.length - 1; i > -1; i--) {
            if (this.pending[i].details.tabId === tabId) {
                return this.pending[i].promise;
            }
        }

        for (let i = this.ads.length - 1; i > -1; i--) {
            if (this.ads[i].details.tabId === tabId) {
                return Promise.resolve(this.ads[i]);
            }
        }

        return Promise.reject();
    }

    findChannelFromPreviousAd(id: string): Channel {
        let ad = this.ads.find(item => item.channelId.id === id);

        if (ad) {
            return ad.channelId;
        }
    }

    findPrevAdByVideoId(videoId: string): Ad {
        for (let ad of this.ads) {
            if (ad.video_id === videoId) {
                return ad;
            }
        }
    }

    fetchChannelTitle(id: string): Promise<string> {
        if (this.apiAvailable) {
            // if user enabled the gAPI permission, use it because its 80% faster
            return fetch("https://content.googleapis.com/youtube/v3/channels?part=snippet&id=" + id + "&key=AIzaSyCPqJiD5cXWMilMdzmu4cvm8MjJuJsbYIo")
                .then(response => response.json())
                .then(json => {
                    if (json && json.items && json.items.length && json.items[0].snippet && json.items[0].snippet.title) {
                        return json.items[0].snippet.title;
                    } else {
                        return id;
                    }
                })
                .catch(err => {
                    console.log(err);
                    return id;
                })
        } else {
            return fetch("https://www.youtube.com/channel/" + id)
                .then(response => response.text())
                .then(text => {
                    let matches = text.match(/\<meta name=\"title\" content=\"(.+)\"\>/);
                    if (matches && matches[1]) {
                        return matches[1];
                    } else {
                        return id;
                    }
                }).catch(err => {
                    console.error(err);
                    return id;
                })
        }
    }

    getChannelFromURL(url: string): string {
        if (!url) return "";

        let matches = url.match(/\/channel\/([\w-]+)(?:\/|$|\?)/);

        if (matches && matches[1])
            return matches[1];
        else
            return "";
    }

    parseURL(url: string): ParsedURL {
        let pathname;
        let params = {} as Ad;
        let queryStart = url.indexOf("?");
        // read from the last instance of "/" until the "?" query marker
        pathname = url.substring(url.lastIndexOf("/", queryStart), queryStart)
        let queries = new URLSearchParams(url.substring(queryStart + 1));

        for (let [key, value] of queries.entries()) {
            params[key] = value;
        }

        return {
            pathname: pathname,
            params: params
        };
    }
    checkPermissions() {
        let neededPerms = { origins: ["*://*.content.googleapis.com/"] };
        browser.permissions.contains(neededPerms)
            .then((granted: boolean) => this.apiAvailable = granted);
    }
}

browser.storage.sync.get(null).then((items: any) => {

    settings = new SettingsManager(items as Settings);
    ads = new AdManager();

    browser.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
        let sendError = null;

        if (message.action === "get-lists") {
            sendResponse(settings.get());
        } else if (message.action === "set") {
            if (message.changes.type === "add-white") {
                settings.addToWhitelist(message.changes.channelId);
            } else if (message.changes.type === "add-mute") {
                settings.addToMutelist(message.changes.channelId)
                sendError = "";
            } else if (message.changes.type === "add-black") {
                if (settings.addToBlacklist(message.changes.channelId)) {
                    sendError = "";
                } else {
                    sendError = "Already in blacklist";
                }
            } else if (message.changes.type === "remove-mute") {
                settings.removeFromMutelist(message.changes.channelId.id);
                sendError = "";
            } else if (message.changes.type === "remove-white") {
                settings.removeFromWhitelist(message.changes.channelId.id)
            } else if (message.changes.type === "remove-black") {
                settings.removeFromBlacklist(message.changes.channelId.id);
            } else if (message.changes.type === "bulk") {
                settings = new SettingsManager(message.changes.settings);
            } else if (message.changes.type === "mute-all") {
                settings.toggleMuteAll(message.changes.value);
            } else if (message.changes.type === "skip-overlays") {
                settings.toggleSkipOverlays(message.changes.skipOverlays);
            }

            settings.save();

            if (!sender.tab || sender.tab.id === -1 || sendError !== null) {
                sendResponse({ action: "update", settings: settings, error: sendError });
            }

            settings.updateAll(sender.tab);

        } else if (message.action === "get-ads") {
            if (message.type === "all") {
                ads.get().then(adList => sendResponse(adList));
                return true;
            } else if (message.type === "current-tab") {
                ads.getLastAdFromTab(sender.tab.id)
                    .then(ad => {
                        sendResponse({ ad: ad })
                    })
                    .catch(() => {
                        sendResponse({ error: "Ad not found" });
                    })
                return true;
            }
        } else if (message.action === "mute") {
            browser.tabs.update(sender.tab.id, {
                muted: message.mute
            });
            sendResponse({ error: "" });
        } else if (message.action = "permission") {
            if (message.type = "google-api") {
                ads.checkPermissions();
            }
            sendResponse({ error: "" });
        }
    });

    browser.webRequest.onBeforeSendHeaders.addListener((details: any) => {
        if (details.tabId === -1) return; //probably came from an extension, which we don't want to process

        let request = new XMLHttpRequest();
        let url = ads.parseURL(details.url);
        let ad: Ad = {};
        let [done, failed] = ads.queue(details);
        let shouldCancel = false;
        let gotChannelTitle;

        if (url.pathname === "/get_video_info" && url.params.video_id) {
            let prevAd = ads.findPrevAdByVideoId(url.params.video_id);

            if (prevAd) { // at this point, all we have is the vID, no channel information, unless we've seen this specific vid before
                if (settings.inBlacklist(prevAd.channelId.id) !== -1) {
                    shouldCancel = true;
                }

                ad = cloneObject(prevAd);
                gotChannelTitle = Promise.resolve();
            } else { //get more information by accessing the url ourselves
                request.open('GET', details.url, false);  // `false` makes the request synchronous
                request.send(null);

                if (request.status === 200) {
                    ad = ads.parseURL("?" + request.responseText).params;

                    ad.channelId = {
                        id: ad.ucid || ads.getChannelFromURL(ad.channel_url),
                        display: "",
                        username: ""
                    };

                    if (ad.channelId.id) {
                        if (settings.inBlacklist(ad.channelId.id) !== -1) {
                            shouldCancel = true;
                        }

                        if (ad.author) {
                            ad.channelId.display = ad.author;
                            gotChannelTitle = Promise.resolve();
                        } else {
                            let prevChannel = ads.findChannelFromPreviousAd(ad.channelId.id);
                            if (prevChannel && prevChannel.display !== prevChannel.id) {
                                //found a recent ad where we already got the display title
                                ad.channelId.display = prevChannel.display
                                gotChannelTitle = Promise.resolve();
                            } else {
                                //asynchrously get the author title, very messy but it's the best way 
                                //the json method requires sending special headers
                                ad.channelId.display = ad.channelId.id;

                                gotChannelTitle = ads.fetchChannelTitle(ad.channelId.id)
                                    .then(title => ad.channelId.display = title)
                                    .catch(title => ad.channelId.display = title);
                            }
                        }
                    }
                }
            }

            ad.details = details;
            ad.blocked = shouldCancel;

            if (ad.channelId.id) {
                gotChannelTitle
                    .then(() => done(ad))
                    .catch(() => done(ad));
            } else {
                failed(ad);
            }

        } else {
            failed("Invalid request: " + url);
        }

        return { cancel: shouldCancel };

    }, { urls: ["*://www.youtube.com/get_video_info?*"] }, ["blocking"])
});

SettingsManager.injectAll();

if (Development && Development.detectedDevMode()) { // set to false in production builds
    const started = Date.now();
    const client = new Development();

    client
        .on("reload", () => {
            client.close();
            browser.runtime.reload();
        })
        .on("partialreload", () => {
            SettingsManager.injectAll();
            console.log("Re-injected scripts");
        })
    client.connect();

    (window as any).s = (() => client.originalLog("Started", (Date.now() - started) / 60000, "minutes ago")) as any;
    console.log("[", started, "]: Development mode");
}

function cloneObject(obj: any) {
    return JSON.parse(JSON.stringify(obj));
}
