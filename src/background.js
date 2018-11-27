// @ts-check
"use strict";

(function (window, browser, undefined) {
    let settings; // :SettingsManager
    let ads; // :AdManager

    class SettingsManager {
        constructor(settings) {
            if (!settings) settings = {};
            if (!settings.whitelisted) settings.whitelisted = [];
            if (!settings.blacklisted) settings.blacklisted = [];
            if (!settings.muted) settings.muted = [];

            this.whitelisted = settings.whitelisted;
            this.blacklisted = settings.blacklisted;
            this.muted = settings.muted;
        }

        updateAll(originTab) {
            browser.tabs.query({}, tabs => {
                for (let tab of tabs) {
                    const origin = (originTab && originTab.id === tab.id) || false;
                    browser.tabs.sendMessage(tab.id, { action: "update", settings: settings, initiator: origin }, response => {
                        //console.log(response);
                    });
                }
            });
        }

        static injectAll() {
            browser.tabs.query({}, tabs => {
                for (let tab of tabs) {
                    try {
                        browser.tabs.executeScript(tab.id, { file: "content.js" }, () => {
                            void browser.runtime.lastError;
                        })
                    } catch (e) { }
                }
            });
        }

        addToWhitelist(channelId) {
            if (this.inWhitelist(channelId.id) === -1) {
                this.whitelisted.push(channelId);
                return true;
            }
            return false;
        }

        addToBlacklist(channelId) {
            if (this.inBlacklist(channelId.id) === -1) {
                this.blacklisted.push(channelId);
                return true;
            }
            return false;
        }

        addToMutelist(channelId) {
            if (this.inMutelist(channelId.id) === -1) {
                this.muted.push(channelId);
                return true;
            }
            return false;
        }

        removeFromWhitelist(id) {
            let i = -1;
            let removeCount = 0;

            while ((i = this.inWhitelist(id)) !== -1) {
                this.whitelisted.splice(i, 1);
                removeCount++;
            }
            return removeCount;
        }
        removeFromBlacklist(id) {
            let i = -1;
            let removeCount = 0;

            while ((i = this.inBlacklist(id)) !== -1) {
                this.blacklisted.splice(i, 1);
                removeCount++;
            }
            return removeCount;
        }
        removeFromMutelist(id) {
            let i = -1;
            let removeCount = 0;

            while ((i = this.inMutelist(id)) !== -1) {
                this.muted.splice(i, 1);
                removeCount++;
            }
            return removeCount;
        }
        inWhitelist(id) {
            for (let index in this.whitelisted) {
                if (this.whitelisted[index].id === id)
                    return ~~index;
            }
            return -1;
        }
        inBlacklist(id) {
            for (let index in this.blacklisted) {
                if (this.blacklisted[index].id === id)
                    return ~~index;
            }
            return -1;
        }
        inMutelist(id) {
            for (let index in this.muted) {
                if (this.muted[index].id === id)
                    return ~~index;
            }
            return -1;
        }

        get() {
            return {
                whitelisted: this.whitelisted,
                blacklisted: this.blacklisted,
                muted: this.muted
            };
        }
        save() {
            return new Promise((resolve, reject) => {
                browser.storage.sync.set(this.get(), resolve)
                setTimeout(resolve, 800) // resolve anyway if it takes too long, for Edge
            })
        }
    }

    class AdManager {
        constructor() {
            this.ads = [];
            this.pending = [];
            this.apiAvailable = false;
            this.checkPermissions();
        }

        push(ad) {
            while (this.ads.length > 20) {
                this.ads.shift(); // just trim a little off the top fam
            }
            this.ads.push(ad);
        }

        queue(details) {
            let resolver, rejector;

            let promise = new Promise((resolve, reject) => {
                resolver = resolve;
                rejector = reject
            }).then(ad => {
                this.pending.splice(this.pending.findIndex(item => promise === item.promise), 1)
                this.push(ad);
                this.sendToTab(ad.details.tabId, ad);
            }).catch(ad => {
                console.error("No UCID available", ad)
            });

            this.pending.push({ details: details, promise: promise });

            return [resolver, rejector];
        }
        get() {
            let promises = []
            for (let i = this.pending.length - 1; i > -1; i--) {
                promises.push(this.pending[i].promise)
            }
            return Promise.all(promises).then(() => this.ads);
        }
        sendToTab(tabId, ad) {
            browser.tabs.query({}, tabs => {
                for (let tab of tabs) {
                    if (tab.id !== tabId) continue;
                    browser.tabs.sendMessage(tab.id, { action: "ad-update", ad: ad }, response => { });
                    return;
                }
            });
        }
        getLastAdFromTab(tabId) /** :Promise */ {
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

        findChannelFromPreviousAd(id) {
            return this.ads.find(item => item.channelId.id === id)
        }

        findPrevAdByVideoId(videoId) {
            for (let ad of this.ads) {
                if (ad.video_id === videoId) {
                    return ad;
                }
            }
            return false;
        }

        fetchChannelTitle(id) {
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

        getChannelFromURL(url) {
            if (!url) return false;

            let matches = url.match(/\/channel\/([\w-]+)(?:\/|$|\?)/);

            if (matches && matches[1])
                return matches[1];
            else
                return false;
        }

        parseURL(url) {
            let parser = document.createElement('a');
            let params = {}
            let queries;

            parser.href = url.replace(/\+/g, '%20'); // Let the browser do the work
            queries = parser.search.replace(/^\?/, '').split('&');

            for (let i = 0; i < queries.length; i++) {
                // Convert query string to object
                let split = queries[i].split('=');
                params[split[0]] = split[1];
            }

            return {
                protocol: parser.protocol,
                host: parser.host,
                hostname: parser.hostname,
                port: parser.port,
                pathname: parser.pathname,
                search: parser.search,
                params: params,
                hash: parser.hash
            };
        }
        checkPermissions(){
            let neededPerms = { origins: ["*://*.content.googleapis.com/"] };
            gCall(browser.permissions.contains, neededPerms, granted => this.apiAvailable = granted);
        }
    }

    browser.storage.sync.get(null, items => {

        settings = new SettingsManager(items);
        ads = new AdManager();

        browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
            } else if (message.action = "permission"){
                if(message.type = "google-api"){
                    ads.checkPermissions();
                }
                sendResponse({ error: "" });
            }
        });

        browser.webRequest.onBeforeSendHeaders.addListener(details => {
            if (details.tabId === -1) return; //probably came from an extension, which we don't want to process
            
            let request = new XMLHttpRequest();
            let url = ads.parseURL(details.url);
            let ad = {};
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
                                ad.channelId.display = decodeURIComponent(ad.author);
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

    class Development {
        constructor(server) {
            this.developmentServer = server || "ws://127.0.0.1:3050";
            this.originalLog = console.log;
            this.originalErr = console.error;
            this.reconnectInterval = 1500;
            this.timeoutInt = null;
            this.ws = null;

            this.connect = this.connect.bind(this);
        }
        connect() {
            this.ws = new WebSocket(this.developmentServer);
            this.ws.addEventListener("open", event => {
                this.timeoutInt = null;
                this.prepareDevEnv();

                this.ws.send(JSON.stringify({
                    userAgent: navigator.userAgent
                }));

                console.log("Hello world");
            });

            this.ws.addEventListener("message", event => {
                if (event.data === "reload") {
                    this.ws.close(1000);
                    browser.runtime.reload();
                } else if (event.data === "partialreload") {
                    SettingsManager.injectAll();
                    console.log("Re-injected scripts");
                }
            });

            this.ws.addEventListener("error", event => this.queueConnection());

            this.ws.addEventListener("close", () => {
                this.removeDevEnv();
                this.queueConnection();
            });

        }

        queueConnection() {
            if (this.timeoutInt)
                clearInterval(this.timeoutInt);
            this.timeoutInt = setTimeout(this.connect, this.reconnectInterval);
        }

        prepareDevEnv() {
            console.log = (function () {
                this.ws.send(JSON.stringify({
                    log: Array.from(arguments)
                }))
            }).bind(this);
            console.error = (function () {
                this.ws.send(JSON.stringify({
                    error: Array.from(arguments)
                }))
            }).bind(this);
        }

        removeDevEnv() {
            console.log = this.originalLog;
            console.error = this.originalErr;
        }
        static detectedDevMode() {
            return browser.runtime.getManifest && !('update_url' in browser.runtime.getManifest());
        }
    }

    if (false && Development.detectedDevMode()) { // set to false in production builds
        let devClient = new Development();
        devClient.connect();
        console.log("[", Date.now(), "]: Development mode");
    }

    function gCall(func, args, callback) {
        let ret = func(args, callback);
        if (ret instanceof Promise) {
            ret.then(callback);
        }
    }

    function cloneObject(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
    //@ts-ignore
})(window, (() => { let api; try { api = browser; } catch (e) { api = chrome }; return api })())
