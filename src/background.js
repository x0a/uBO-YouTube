"use strict";

(function (window, browser, undefined) {
    const devMode = isDevMode();
    let settings;
    let recentads = [];
    let blacklisted = [];

    let saveSettings = () => {
        return new Promise((resolve, reject) => {
            browser.storage.sync.set(settings, resolve)
            setTimeout(resolve, 800) // resolve anyway if it takes too long, for Edge
        })
    }

    browser.storage.sync.get(null, items => {
        settings = items ? items : {};

        if (!settings.whitelisted) settings.whitelisted = [];
        if (!settings.blacklisted) settings.blacklisted = [];

        browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === "get") {
                sendResponse(settings);
            } else if (message.action === "set") {
                if (message.changes.type === "add-white") {
                    if (inwhitelist(message.changes.channelId.id) === -1) {
                        settings.whitelisted.push(message.changes.channelId);
                    }
                } else if (message.changes.type === "add-black") {
                    if (inblacklist(message.changes.channelId.id) === -1) {
                        settings.blacklisted.push(message.changes.channelId);
                    }
                } else if (message.changes.type === "remove-white") {
                    let i = -1;

                    while ((i = inwhitelist(message.changes.channelId.id)) !== -1) {
                        settings.whitelisted.splice(i, 1);
                    }
                } else if (message.changes.type === "remove-black") {
                    let i = -1;
                    while ((i = inblacklist(message.changes.channelId.id)) !== -1) {
                        settings.blacklisted.splice(i, 1);
                    }
                } else if (message.changes.type === "bulk") {
                    settings = message.changes.settings;
                }

                saveSettings();

                if (!sender.tab || sender.tab.id === -1) {
                    sendResponse({ action: "update", settings: settings });
                }

                browser.tabs.query({}, tabs => {
                    for (let tab of tabs) {
                        const origin = (sender.tab && sender.tab.id === tab.id) || false;
                        browser.tabs.sendMessage(tab.id, { action: "update", settings: settings, isOriginator: origin }, response => {
                            //console.log(response);
                        });
                    }
                });


            } else if (message.action === "recentads") {
                sendResponse(recentads);
            } else if (message.action === "blacklist") {
                //find the last intercepted ad from this tab
                for (let ad of recentads.slice().reverse()) {
                    if (ad.details.tabId === sender.tab.id) {
                        if (inblacklist(ad.channelId.id) !== -1) {
                            sendResponse({ error: "Advertiser already blacklisted" });
                            return; //already exists in blacklist, or UCID not available
                        }

                        settings.blacklisted.push(ad.channelId);
                        saveSettings();
                        sendResponse({ error: "", info: ad });
                        return; //also break;
                    }
                }
                sendResponse({ error: "Ad not found" });
            } else if (message.action === "mute") {
                return; // TODO
                browser.tabs.update(sender.tab.id, {
                    muted: message.mute
                }).then(() => {
                    sendResponse({ error: "" });
                })
            }
        });

        browser.webRequest.onBeforeSendHeaders.addListener((details) => {
            if (details.tabId === -1) return; //probably came from an extension, which we don't want to process

            let request = new XMLHttpRequest();
            let url = parseURL(details.url);
            let cancel = false;
            let adinfo = { params: {} };

            if (url.pathname === "/get_video_info" && url.params.video_id) {
                let blacklistedItem = blacklisted.find(obj => obj.video_id === url.params.video_id);

                if (blacklistedItem) {
                    cancel = true;
                    adinfo.params.channelId = blacklistedItem.channelId;
                } else {
                    request.open('GET', details.url, false);  // `false` makes the request synchronous
                    request.send(null);

                    if (request.status === 200) {
                        adinfo = parseURL("?" + request.responseText);
                        adinfo.params.channelId = { id: adinfo.params.ucid || parseChannel(adinfo.params.channel_url), display: "", username: "" };

                        if (adinfo.params.channelId.id) {
                            if (inblacklist(adinfo.params.channelId.id) !== -1) {
                                //block, and also add video id to the list so that we dont do this synchrous request again
                                blacklisted.push({ video_id: url.params.video_id, channelId: adinfo.params.channelId });
                                cancel = true;
                            }

                            if (!adinfo.params.author) {
                                let prev = recentads.find(item => item.channelId.id === adinfo.params.channelId.id);

                                if (prev && prev.channelId.display !== prev.channelId.id) {
                                    //found a recent ad where we already got the display title
                                    adinfo.params.channelId.display = prev.channelId.display
                                } else {
                                    //asynchrously get the author title, very messy but it's the best way 
                                    //the json method requires sending special headers
                                    adinfo.params.channelId.display = adinfo.params.channelId.id;

                                    request.open("GET", "https://www.youtube.com/channel/" + adinfo.params.channelId.id, true);
                                    request.onreadystatechange = function () {
                                        if (this.readyState === 4 && this.status === 200) {
                                            let matches = request.responseText.match(/\<meta name=\"title\" content=\"(.+)\"\>/);
                                            if (matches && matches[1]) {
                                                adinfo.params.channelId.display = matches[1];
                                            }
                                        }
                                    };
                                    request.send();
                                }
                            } else
                                adinfo.params.channelId.display = decodeURIComponent(adinfo.params.author);
                        }
                    }
                }

                adinfo.params.details = details;
                adinfo.params.blocked = cancel;

                if (adinfo.params.channelId.id) {
                    while (recentads.length > 20)
                        recentads.shift(); //just trim a little off the top fam
                    recentads.push(adinfo.params);
                } else
                    console.log(adinfo.params)

            } else {
                console.log("Invalid request", url);
            }

            return { cancel: cancel };

        }, { urls: ["*://www.youtube.com/get_video_info?*"] }, ["blocking"])
    });

    browser.tabs.query({}, tabs => {
        for (let tab of tabs) {
            try {
                browser.tabs.executeScript(tab.id, { file: "content.js" }, () => {
                    void browser.runtime.lastError;
                })
            } catch (e) { }
        }
    });

    if (false && devMode) {
        // make it easier to reload extension during development		
        let log = console.log, error = console.error, timeoutInt, ws;
        function prepareConnection() {
            ws = new WebSocket("ws://127.0.0.1:3050");

            ws.addEventListener("open", event => {
                timeoutInt = null;
                console.log = function () {
                    ws.send(JSON.stringify({
                        log: Array.from(arguments).join(", ")
                    }))
                }
                console.error = function () {
                    ws.send(JSON.stringify({
                        error: Array.from(arguments).join(", ")
                    }))
                }
                ws.send(JSON.stringify({
                    userAgent: navigator.userAgent
                }));
                console.log("Hello");
            });

            ws.addEventListener("message", event => {
                if (event.data === "reload")
                    ws.close(1000);
                browser.runtime.reload();
            });

            ws.addEventListener("error", event => {
                if (timeoutInt)
                    clearInterval(timeoutInt);

                timeoutInt = setTimeout(prepareConnection, 1500)
            });

            ws.addEventListener("close", () => {
                console.log = log;
                console.error = error;

                if (timeoutInt)
                    clearInterval(timeoutInt);


                timeoutInt = setTimeout(prepareConnection, 1500);
            });
        }

        prepareConnection();

        console.log("[", Date.now(), "]: Development mode");
    }

    function inblacklist(search) {
        for (let index in settings.blacklisted) {
            if (settings.blacklisted[index].id === search)
                return index;
        }
        return -1;
    }
    function inwhitelist(search) {
        for (let index in settings.whitelisted) {
            if (settings.whitelisted[index].id === search)
                return index;
        }
        return -1;
    }

    function parseChannel(search) {
        if (!search) return false;

        let matches = search.match(/\/(user|channel)\/([\w-]+)(?:\/|$|\?)/);

        if (matches && matches[2])
            return matches[2];
        else
            return false;
    }

    function parseURL(url) {
        let parser = document.createElement('a'),
            params = {},
            queries;
        // Let the browser do the work
        parser.href = url.replace(/\+/g, '%20');
        // Convert query string to object
        queries = parser.search.replace(/^\?/, '').split('&');
        for (let i = 0; i < queries.length; i++) {
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

    function isDevMode() {
        return browser.runtime.getManifest && !('update_url' in browser.runtime.getManifest());
    }
})(window, (() => { let api; try { api = browser; } catch (e) { api = chrome }; return api })())

