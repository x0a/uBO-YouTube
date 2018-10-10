"use strict";

(function (window, document, console, undefined) {

    const VIDEO = 1;
    const CHANNEL = 2;
    const SEARCH = 3;
    const ALLELSE = -1;
    const RELATED = 1;
    const LPOLY = 2; // new polymer layout
    const LBASIC = 1; // old basic layout, less and less supported as time goes on

    /* ---------------------------- */

    const agent = new MessageAgent();

    let settings = { whitelisted: [], blacklisted: [] };
    let accessURLs = {};

    agent.send("getSettings").then(response => {
        settings = response.settings;
        accessURLs = response.accessURLs;

        if (document.readyState === "complete" || document.readyState === "loaded" || document.readyState === "interactive") {
            init(); // DOMContentAlreadyLoaded
        } else {
            document.addEventListener("DOMContentLoaded", init);
        }
    });

    function init() {
        let layout = document.querySelector("ytd-app") ? LPOLY : LBASIC; // dirty, but just for the initial load
        let mode = getMode();
        let prevurl = location.href;
        let adWasPlaying = false;
        // in case of settings change due to activity in another tab
        agent.on("settingsUpdate", updated => {
            settings = updated.settings;
            updatePage(mode, layout, true, updated.isOriginator); // force update
        });

        let isPlayerUpdate = mutation => {
            let player;

            if (mutation.target.id === "movie_player") {
                player = mutation.target;
            } else if (mutation.target.id === "player-container" && mutation.addedNodes.length) {
                for (let node of mutation.addedNodes) {
                    if (node.id === "movie_player") {
                        player = node;
                        break;
                    }
                }
            }

            if (player)
                return player;
            else
                return false;
        }

        let isPolyUserInfo = mutation => {
            if (
                (
                    mutation.target.id === "owner-name"
                    && mutation.addedNodes.length
                ) || (
                    mutation.type === "attributes"
                    && mutation.target.parentNode
                    && mutation.target.parentNode.id === "owner-name"
                    && mutation.attributeName === "href"
                )
            ) {
                return mutation.target.closest("ytd-video-owner-renderer");
            } else {
                return false;
            }
        }

        let isBasicUserInfo = mutation => {
            if (mutation.target.id === "watch7-container" && mutation.addedNodes.length) {
                for (let node of mutation.addedNodes) {
                    if (node.id === "watch7-main-container") {
                        return node;
                    }
                }
            }

            return false;
        }

        let isRelatedUpdate = mutation => {
            return (
                mutation.type === "attributes"
                && mutation.target.id === "continuations"
                && mutation.attributeName === "hidden"
            );
        }

        let hasNewItems = mutation => {
            return (
                mutation.type === "attributes"
                && mutation.target.localName === "yt-page-navigation-progress"
                && mutation.attributeName === "hidden"
                && mutation.oldValue === null
            ) || (
                    mutation.type === "childList"
                    && (mutation.target.id === "items" || mutation.target.id === "contents")
                )
        }

        updatePage(mode, layout, false);

        let ytWatch = new MutationObserver(mutations => {
            if (location.href !== prevurl) {
                mode = getMode();
                prevurl = location.href;
            }

            for (let mutation of mutations) {
                if (mode === VIDEO) {
                    let player, userInfo;

                    if (player = isPlayerUpdate(mutation)) {
                        if (player.classList.contains("ad-showing")) {
                            if (!adWasPlaying) {
                                agent.send("mute", {mute: true});
                                adWasPlaying = true;
                            }
                            updateAdShowing(player);
                        } else if (adWasPlaying) {
                            adWasPlaying = false;
                            updateAdDone(player);
                        }
                    } else if (userInfo = isPolyUserInfo(mutation)) {
                        updateVideoPage(LPOLY, userInfo);
                    } else if (userInfo = isBasicUserInfo(mutation)) {
                        updateVideoPage(LBASIC, userInfo);
                    } else if (isRelatedUpdate(mutation)) {
                        updateRelated(LPOLY);
                    }
                } else if (mode === CHANNEL || mode === SEARCH || mode === ALLELSE) {
                    let loadedDesign = 0;

                    if (hasNewItems(mutation)) { // new items in videolist
                        loadedDesign = LPOLY;
                    } else {
                        for (let node of mutation.removedNodes) {
                            if (node.id === "progress") {
                                loadedDesign = LBASIC; // old layout, progress bar removed
                                break;
                            }
                        }
                    }

                    if (loadedDesign) {
                        if (mode === CHANNEL)
                            updateChannelPage(loadedDesign);
                        else if (mode === SEARCH)
                            updateSearchPage(loadedDesign);
                        else if (mode === ALLELSE)
                            updateVideoLists(loadedDesign);
                        break;
                    }
                }

            }
        })

        ytWatch.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["hidden", "href"],
            attributeOldValue: true
        });
    }

    function getMode() {
        if (location.href.indexOf("youtube.com/watch?") !== -1) {
            return VIDEO;
        } else if (location.href.indexOf("youtube.com/channel/") !== -1 || location.href.indexOf("youtube.com/user/") !== -1) {
            return CHANNEL;
        } else if (location.href.indexOf("youtube.com/results?") !== -1) {
            return SEARCH;
        } else {
            return ALLELSE;
        }
    }
    function getUsername(string) {
        let matches = string.match(/\/user\/(.+)/);
        if (matches && matches.length > 1)
            return matches[1];
    }
    function getChannelId(from, mode, layout) {
        let channelId = { id: "", username: "", display: "" };

        if (!mode) mode = getMode();

        if (layout === LPOLY) {

            if (mode === VIDEO) {
                if (!from) from = document.querySelector("ytd-video-owner-renderer");
                if (!from) return false;

                channelId.username = getUsername(objGet(from, "data.navigationEndpoint.browseEndpoint.canonicalBaseUrl")) || ""
                channelId.id = objGet(from, "data.navigationEndpoint.browseEndpoint.browseId") || "";
                channelId.display = objGet(from, "data.title.runs[0].text") || "";
            } else if (mode === CHANNEL) {
                if (!from) from = document.querySelector("ytd-browse");

                channelId.username = objGet(from, "data.metadata.channelMetadataRenderer.doubleclickTrackingUsername") || "";
                channelId.display = objGet(from, "data.metadata.channelMetadataRenderer.title") || "";
                channelId.id = objGet(from, "data.metadata.channelMetadataRenderer.externalId") || "";
            } else if (mode === SEARCH) {
                if (!from) throw "Search element required to get channelId under search mode";

                channelId.display = objGet(from, "data.title.simpleText") || "";
                channelId.id = objGet(from, "data.channelId") || "";
                channelId.username = getUsername(objGet(from, "data.longBylineText.runs[0].navigationEndpoint.browseEndpoint.canonicalBaseUrl")) || "";
            }
        } else if (layout === LBASIC) {
            let links, link;

            if (!from) from = document;

            if (mode === VIDEO) {
                //links from the underbar
                links = from.closest("#watch7-user-header").querySelectorAll("a");
            } else if (mode === SEARCH) {
                links = from.querySelectorAll("a");
                channelId.display = from.querySelector("h3.yt-lockup-title a").getAttribute("title") || "";
                channelId.id = from.querySelector(".yt-uix-button-subscription-container .yt-uix-subscription-button").getAttribute("data-channel-external-id") || "";
            } else if (mode === CHANNEL) {
                //metadata link from the header, should contain the ID/username if we set it previously
                links = [location];
                link = document.querySelector("link[rel='canonical']");

                if (link) {
                    links.push(link);
                    channelId.username = link.getAttribute("username") || "";
                }
                //get the display name while we are at it
                channelId.display = document.querySelector(".branded-page-header-title-link").textContent || "";
            } else return false;

            for (let link of links) {
                if (!link.href) continue;
                let matches;

                if (matches = link.href.match(/\/(user|channel)\/([\w-]+)(?:\/|$|\?)/)) {
                    if (matches[1] === "user") {
                        channelId.username = matches[2] //we can safely assume that /user/$1 is a username
                    } else if (matches[1] === "channel") {
                        channelId.id = matches[2];

                        if (link.textContent) { //to weed out the metadata link on channel pages
                            channelId.display = link.textContent;
                        }
                    }
                }
            }
        }

        if (channelId.id || channelId.username)
            return channelId;
        else
            return false;
    }

    function updateLinks(from, mode, layout, channelId) {
        let links, whitelisted = channelId && inwhitelist(channelId) !== -1;

        if (layout === LPOLY) {
            if (mode === VIDEO) {
                links = from.querySelectorAll("a");
            }
        } else if (layout === LBASIC) {
            if (mode === VIDEO) {
                links = from.querySelectorAll("a");
            }
        }

        for (let link of links) {
            // this link hasn't been looked at
            // or the channel changed
            // or the whitelist state changed
            // or the link changed to something that we didnt set it to
            if (!link.channelId || link.channelId !== channelId.id || link.whitelisted !== whitelisted || link.sethref !== link.href) {
                link.href = link.sethref = reflectURLFlag(link.href, whitelisted);
                link.whitelisted = whitelisted;
                link.channelId = channelId.id;
            }
        }
    }

    function objGet(object, key) {
        let levels = key.split(/[\[\]\.]+/);
        let current = object;

        for (let level of levels) {
            if (level.length === 0) continue;
            if (current[level] !== undefined) {
                current = current[level];
            } else {
                // console.log("Failed at", level);
                return;
            }
        }

        return current;
    }

    function updateURL(channelId, verify) {
        if (!channelId) throw "No channel ID passed to updateURL";

        if (location.href.indexOf("&disableadblock=1") !== -1) {
            // ads are enabled, should we correct that?
            if (inwhitelist(channelId) === -1) {
                window.history.replaceState(history.state, "", reflectURLFlag(location.href, false));
                return false;
            } else return true;
        } else {
            // ads are not enabled, lets see if they should be
            if (inwhitelist(channelId) !== -1) {
                window.history.replaceState(history.state, "", reflectURLFlag(location.href, true));

                if (verify) verifyDisabled();
                return true;
            } else return false;
        }
    }

    function reflectURLFlag(url, shouldContain) {
        // take url, return url with flags removed if add is off
        // return url with flags added if add is on
        let search = /((?!\?)igno=re&disableadblock=1&?)|(&disableadblock=1)/g

        if (shouldContain) {
            url = reflectURLFlag(url, false); // remove first, then add
            let paramsStart = url.indexOf("?");
            return url + (paramsStart === -1 ? "?igno=re" : (paramsStart === url.length - 1 ? "igno=re" : "")) + "&disableadblock=1"

        } else {
            return url.replace(search, "");
        }
    }

    function verifyDisabled() {
        setTimeout(() =>
            fetch("https://www.youtube.com/favicon.ico?ads=true").catch(() =>
                prompt("Ads may still be blocked, make sure you've added the following rule to your uBlock Origin whitelist", "*youtube.com/*&disableadblock=1")
            )
            , 300);
    }

    function updatePage(mode, layout, forceUpdate, verify) {
        if (mode === VIDEO) updateVideoPage(layout, undefined, forceUpdate, verify);
        else if (mode === CHANNEL) updateChannelPage(layout, forceUpdate, verify);
        else if (mode === SEARCH) updateSearchPage(layout, forceUpdate);
        else if (mode === ALLELSE) updateVideoLists(layout, undefined, forceUpdate);
    }

    function whitelistButton(layout, toggled, ref) {
        if (ref) {
            // button already exists, update whitelist toggle on pre-existing button rather than create new one
            if (!toggled) {
                if (ref.classList.contains("yt-uix-button-toggled"))
                    ref.classList.remove("yt-uix-button-toggled");
            } else {
                if (!ref.classList.contains("yt-uix-button-toggled"))
                    ref.classList.add("yt-uix-button-toggled");
            }

            return;
        }

        let button = document.createElement("button");
        button.className = "UBO-button";
        button.addEventListener("click", event => {
            let mode = getMode();
            let channelEl = mode === SEARCH ? event.target.closest("ytd-channel-renderer") : null;
            let channelId = getChannelId(channelEl, mode, layout), button = event.target; // allow parent scope to be discarded

            if (inwhitelist(channelId) !== -1) {
                agent.send("setSettings", { channelId: channelId, type: "remove-white" });
                button.classList.remove("yt-uix-button-toggled");
            } else {
                agent.send("setSettings", { channelId: channelId, type: "add-white" });
                button.classList.add("yt-uix-button-toggled");
            }

        }, false);

        if (layout === LPOLY) {
            let buttonContainer;
            button.className += " UBO-poly " + (toggled ? " yt-uix-button-toggled" : "");
            button.innerHTML = "ADS";
            buttonContainer = document.createElement("div");
            buttonContainer.appendChild(button);

            return buttonContainer;
        } else if (layout === LBASIC) {
            button.className += " UBO-old yt-uix-button yt-uix-button-size-default yt-uix-button-subscribed-branded hover-enabled" + (toggled ? " yt-uix-button-toggled" : "");
            button.innerHTML = "Ads";

            return button;
        }
    }
    function updateVideoPage(layout, container, forceUpdate, verify) {
        if (!container) {
            if (layout === LPOLY) {
                container = document.querySelector("ytd-video-owner-renderer")
            } else if (layout === LBASIC) {
                container = document.querySelector("#watch7-subscription-container")
            }
        }

        if (!container) return;

        let channelId = getChannelId(container, VIDEO, layout);
        let whitelisted = updateURL(channelId, verify);
        let button;

        if (button = whitelistButton(layout, whitelisted, container.parentNode.querySelector(".UBO-button"))) {
            // add the new button, otherwise the status was updated on a pre-existing button
            if (container.nextSibling) {
                container.parentNode.insertBefore(button, container.nextSibling);
            } else {
                container.parentNode.appendChild(button);
            }
        }

        updateLinks(container, VIDEO, layout, channelId);

        updateRelated(layout, forceUpdate);
    }

    function updateRelated(layout, forceUpdate) {
        if (layout === LPOLY) {
            // update via local JS variables on the page
            updatePolyVideos(RELATED, null, forceUpdate)
        } else if (layout === LBASIC) {
            // update via information available on the DOM
            let videos = document.querySelectorAll(".video-list-item");
            for (let vid of videos) {
                if (!forceUpdate && vid.processed) continue;
                let user = vid.querySelector("[data-ytid]");
                if (!user)
                    continue;
                else
                    user = user.getAttribute("data-ytid");
                let inwhite = inwhitelist(user, true) !== -1
                let links = vid.querySelectorAll("a[href^='/watch?']");
                if (inwhite || forceUpdate) {
                    for (let link of links) {
                        link.setAttribute("href", reflectURLFlag(link.getAttribute("href"), inwhite));
                    }
                }
                vid.processed = true;
            }
        }
    }

    function updateChannelPage(layout, forceUpdate, verify) {
        let channelId = getChannelId(null, CHANNEL, layout);
        let whitelisted = updateURL(channelId, verify);
        let container, button;

        if (layout === LPOLY)
            container = document.querySelector("#edit-buttons");
        else if (layout === LBASIC)
            container = document.querySelector(".primary-header-actions");

        if (!container) return;

        if (button = whitelistButton(layout, whitelisted, container.querySelector(".UBO-button")))
            container.appendChild(button); // add only if it doesn't already exist

        if (whitelisted || forceUpdate) {
            updateVideoLists(layout, channelId, forceUpdate);
        }
    }

    function updateSearchPage(layout, forceUpdate) {
        // add whitelist buttons to any available channels

        let channels, query;

        if (layout === LPOLY) {
            channels = document.querySelectorAll("ytd-channel-renderer");
            query = "#subscribe-button";
        } else if (layout === LBASIC) {
            channels = document.querySelectorAll(".yt-lockup-channel")
            query = ".yt-uix-button-subscription-container";
        }

        if (!channels) return;

        for (let channel of channels) {
            let channelId = getChannelId(channel, SEARCH, layout);

            if (channelId) {
                let container = channel.querySelector(query);
                let button;

                if (button = whitelistButton(layout, inwhitelist(channelId) !== -1, container.querySelector(".UBO-button")))
                    container.insertBefore(button, container.firstChild);
            }
        }
        // now parse the videos
        updateVideoLists(layout, null, forceUpdate);
    }

    function updateVideoLists(layout, channelId, forceUpdate) {
        // videos from places like the home page, channel page, search results, etc.
        // basically anything that isn't the /watch?v= page
        if (layout === LPOLY) {
            if (channelId)
                updatePolyVideos(CHANNEL, channelId, forceUpdate);
            else
                updatePolyVideos(ALLELSE, null, forceUpdate);
        } else if (layout === LBASIC) {
            let videos = document.querySelectorAll(".yt-lockup-video");

            for (let vid of videos) {
                if (!forceUpdate && vid.processed) continue;

                let user = vid.querySelector(".stat.attribution span");
                let values = { username: "" };

                if (!user || !(values.username = user.textContent))
                    if (channelId)
                        values = channelId;
                    else
                        continue;
                let inwhite = inwhitelist(values) !== -1
                if (inwhite || forceUpdate) { // exists
                    let links = vid.querySelectorAll("a[href^='/watch?']");

                    for (let link of links) {
                        link.setAttribute("href", reflectURLFlag(link.getAttribute("href"), inwhite));
                    }
                }
                vid.processed = true;
            }
        }
    }

    function updatePolyVideos(mode, channelId, forceUpdate) {
        let videos;
        if (mode === RELATED) {
            videos = document.querySelectorAll("ytd-compact-video-renderer,ytd-playlist-panel-video-renderer");
        } else if (mode === ALLELSE || mode === CHANNEL) {
            videos = document.querySelectorAll("ytd-grid-video-renderer,ytd-video-renderer,ytd-playlist-video-renderer");
        }

        for (let video of videos) {
            if (!forceUpdate && video.data.processed) continue;

            let id;

            if (id = objGet(video, "data.shortBylineText.runs[0].navigationEndpoint.browseEndpoint.browseId") || (mode === CHANNEL && channelId.id)) {

                let desturl, links = video.querySelectorAll("a[href^='/watch?']");

                if (!links.length) continue;

                if (inwhitelist(id, true) !== -1) {
                    if (video.data.originalhref)
                        desturl = video.data.originalhref;
                    else {
                        desturl = links[0].getAttribute("href");
                        video.data.originalhref = desturl;
                    }
                    desturl += "&disableadblock=1";
                } else if (video.data.originalhref) {
                    desturl = video.data.originalhref;
                } else {
                    video.data.processed = true;
                    continue;
                }

                for (let link of links)
                    link.href = desturl;

                if (objGet(video, "data.navigationEndpoint.webNavigationEndpointData.url"))
                    video.data.navigationEndpoint.webNavigationEndpointData.url = desturl;
                if (objGet(video, "data.navigationEndpoint.commandMetadata.webCommandMetadata.url"))
                    video.data.navigationEndpoint.commandMetadata.webCommandMetadata.url = desturl;

                video.data.processed = true;
            }
        }
    }

    function updateAdDone(player) {
        //console.log("ad finished playing");
        agent.send("mute", {mute: false});
    }

    function updateAdShowing(player) {
        let container, blacklistButton;

        if (!player.querySelector("#BLK-button")) {
            container = player.querySelector(".ytp-right-controls");

            if (!container) {
                console.error("Cannot find .ytp-right-controls");
                return;
            }
            // parseHTML('<button class="ytp-button" id="BLK-button"><span class="BLK-tooltip">Blacklist this advertiser</span><div class="BLK-container"><img src="' +  + '"></div></button>').querySelector("#BLK-button");
            blacklistButton = (() => {
                let el = document.createElement("button");
                el.setAttribute("id", "BLK-button");
                el.setAttribute("class", "ytp-button");
                el.appendChild((() => {
                    let el = document.createElement("span");
                    el.setAttribute("class", "BLK-tooltip");
                    el.appendChild(document.createTextNode("Blacklist this advertiser"));
                    return el;
                })());

                /*el.appendChild(() => {
                    let el = document.createElement("div");
                    el.setAttribute("class", "BLK-context-menu");

                });*/

                el.appendChild((() => {
                    let el = document.createElement("div");
                    el.setAttribute("class", "BLK-container");
                    el.appendChild((() => {
                        let el = document.createElement("img");
                        el.setAttribute("src", accessURLs.ICO);
                        return el;
                    })());
                    return el;
                })());

                el.addEventListener("click", () => {
                    agent.send("blacklist", { /*  find corroborating ad info and put in here  */ }).then(response => {
                        if (!response.err)
                            location.reload();
                        else
                            console.log(response.err);
                    })
                })
                return el;
            })();
            container.insertBefore(blacklistButton, container.firstChild);
        }
    }

    function MessageAgent(identifier) {
        let instance = identifier || Math.random().toString(36).substring(7); // used to differentiate between us and others
        let resolvers = [];
        let events = {};

        this.on = (event, listener) => {
            if (typeof listener !== "function") throw "Listener must be a function";
            if (!events[event]) events[event] = [];
            events[event].push(listener);

            return this;
        }

        this.send = (event, message) => {
            let callbackId = Math.random().toString(36).substring(7);
            window.postMessage({ event: event, message: message, callbackId: callbackId, instance: instance }, "*");

            return new Promise((resolve, reject) => {
                resolvers.push({ id: callbackId, resolver: resolve, rejector: reject });
            })
        }

        window.addEventListener("message", (e) => {
            let revent = e.data;
            let promises = [];

            if (revent.instance && revent.instance !== instance) { // do not process if the event came from ourselves
                if (revent.event && revent.event in events) {
                    for (let i = 0; i < events[revent.event].length; i++) {
                        let response = events[revent.event][i](revent.message); // execute listener
                        if (response && typeof response.then === "function") // if a promise
                            promises.push(response); // wait til resolved
                        else
                            promises.push(Promise.resolve(response)) // resolve immediately
                    }

                    Promise.all(promises).then(messages => { // send messages as single array once all promises are resolved
                        window.postMessage({ callbackId: revent.callbackId, message: messages.length === 1 ? messages[0] : messages, instance: instance }, "*");
                    });
                } else if (revent.callbackId) { // we received a response to a message we sent
                    let index = resolvers.map(val => val.id).indexOf(revent.callbackId);
                    if (index === -1) return;
                    let callback = resolvers[index];
                    callback.resolver(revent.message); // execute callback
                    resolvers.splice(index, 1); // remove resolver from array
                }
            }
        });
    }

    function inwhitelist(search, idOnly) {
        if (!search) return;

        if (idOnly) {
            search = { id: search, username: "" };
        }

        for (let index in settings.whitelisted) {
            if (
                (search.id.length > 4 && settings.whitelisted[index].id === search.id)
                ||
                (search.username.length > 4 && settings.whitelisted[index].username === search.username)
            ) {
                return index;
            }
        }
        return -1;
    }
})(window, document, console)
