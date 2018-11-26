"use strict";

(function (window, document, console, undefined) {

    const VIDEO = 1;
    const CHANNEL = 2;
    const SEARCH = 3;
    const ALLELSE = -1;
    const LPOLY = 2; // new polymer layout
    const LBASIC = 1; // old basic layout, less and less supported as time goes on

    /* ---------------------------- */

    let settings = { whitelisted: [], blacklisted: [], muted: [] };
    let accessURLs = {};
    let pages, watcher, agent;

    class MutationWatcher {
        constructor() {
            this.watcher = new MutationObserver(this.onMutation.bind(this));
            this.pendingActions = {};
        }

        start() {
            this.watcher.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["hidden", "href", "style"],
                attributeOldValue: true
            });
        }

        isPlayerUpdate(mutation) {
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

        isPlayerDurationUpdate(mutation) {
            return mutation.target.className === "ytp-time-duration"
                && mutation.addedNodes.length;
        }

        isPolyUserInfo(mutation) {
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
        isBasicUserInfo(mutation) {
            if (mutation.target.id === "watch7-container" && mutation.addedNodes.length) {
                for (let node of mutation.addedNodes) {
                    if (node.id === "watch7-main-container") {
                        return node;
                    }
                }
            }

            return false;
        }

        isRelatedUpdate(mutation) {
            return (
                mutation.type === "attributes"
                && mutation.target.id === "continuations"
                && mutation.attributeName === "hidden"
            );
        }

        hasNewItems(mutation) {
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
        finishedLoadingBasic(mutation) {
            for (let node of mutation.removedNodes) {
                if (node.id === "progress") {
                    return true; // old layout, progress bar removed
                }
            }
            return false;
        }
        isAdSkipButton(mutation) {
            return mutation.type === "attributes"
                && mutation.target.classList.contains("videoAdUiSkipContainer")
                && mutation.target.style.display !== "none"
                && mutation.target.querySelector("button");
        }
        queueUpdate(method) {
            if (this.pendingActions[method]) {
                clearTimeout(this.pendingActions[method]);
            }
            this.pendingActions[method] = setTimeout(() => {
                delete this.pendingActions[method];
                method();
            }, 50);
        }
        onMutation(mutations) {
            let mode = pages.getMode();

            for (let mutation of mutations) {
                if (mode === VIDEO) {
                    let player, userInfo, skipButton;

                    if (player = this.isPlayerUpdate(mutation)) {
                        pages.video.updateAdPlaying(player, !!player.classList.contains("ad-showing"))
                    } else if (userInfo = this.isPolyUserInfo(mutation)) {
                        pages.video.setDataNode(userInfo)
                        pages.video.updatePage();
                    } else if (userInfo = this.isBasicUserInfo(mutation)) {
                        pages.video.setDataNode(userInfo)
                        pages.video.updatePage();
                    } else if (this.isRelatedUpdate(mutation)) {
                        this.queueUpdate(pages.channel.updateVideos);
                    } else if (this.isPlayerDurationUpdate(mutation)) {
                        pages.video.updateDuration(mutation.target.textContent);
                    } else if (skipButton = this.isAdSkipButton(mutation)) {
                        pages.video.updateSkip(skipButton);
                    }
                } else if (mode === CHANNEL || mode === SEARCH || mode === ALLELSE) {
                    if (this.hasNewItems(mutation) || this.finishedLoadingBasic(mutation)) { // new items in videolist
                        if (mode === CHANNEL) {
                            this.queueUpdate(pages.channel.updatePage);
                        } else if (mode === SEARCH) {
                            this.queueUpdate(pages.search.updatePage);
                        } else if (mode === ALLELSE) {
                            pages.updateAllVideos();
                        }
                    }
                }

            }
        }
        destroy() {
            this.watcher.disconnect();
        }
    }

    class WhitelistButton {
        constructor(onClick, toggled) {
            this.onClick = onClick;
            this.toggled = toggled;

            this.button = document.createElement("button");
            this.button.className = "UBO-button";
            this.button.addEventListener("click", this.onClick);

            this.buttonContainer = document.createElement("div");
            this.buttonContainer.className = "UBO-button-container";
            this.buttonContainer.appendChild(this.button);
        }

        off() {
            if (!this.toggled) return;

            this.toggled = false;
            this.button.classList.remove("yt-uix-button-toggled");
        }

        on() {
            if (this.toggled) return;

            this.toggled = true;
            this.button.classList.add("yt-uix-button-toggled");
        }


    }

    class WhitelistButtonPoly extends WhitelistButton {
        constructor(onClick, toggled) {
            super(onClick, toggled);
            this.button.className += " UBO-poly " + (toggled ? " yt-uix-button-toggled" : "");
            this.button.innerHTML = "ADS";
        }
        exists() {
            return !!this.buttonContainer.parentElement;
        }
        render() {
            return this.buttonContainer;
        }
    }

    class WhitelistButtonBasic extends WhitelistButton {
        constructor(onClick, toggled) {
            super(onClick, toggled);
            this.button.className += " UBO-old yt-uix-button yt-uix-button-size-default yt-uix-button-subscribed-branded hover-enabled" + (toggled ? " yt-uix-button-toggled" : "");
            this.button.innerHTML = "Ads";
        }
        exists() {
            return !!this.button.parentElement;
        }
        render() {
            return this.button;
        }
    }

    class AdOptions {
        constructor(onBlacklist, onMute, onSkip) {
            this.toggleMenu = this.toggleMenu.bind(this);
            this.unfocusedMenu = this.unfocusedMenu.bind(this);

            this.muteBlock = (() => {
                let el = document.createElement("span");
                el.appendChild((() => {
                    let el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                    el.setAttribute("data-icon", "volume-slash");
                    el.setAttribute("role", "img");
                    el.setAttribute("class", "UBO-icon");
                    el.setAttributeNS(null, "viewBox", "0 0 640 512");
                    el.appendChild((() => {
                        let el = document.createElementNS("http://www.w3.org/2000/svg", "path");
                        el.setAttributeNS(null, "fill", "currentColor");
                        el.setAttributeNS(null, "d", "M633.82 458.1l-69-53.33C592.42 360.8 608 309.68 608 256c0-95.33-47.73-183.58-127.65-236.03-11.17-7.33-26.18-4.24-33.51 6.95-7.34 11.17-4.22 26.18 6.95 33.51 66.27 43.49 105.82 116.6 105.82 195.58 0 42.78-11.96 83.59-33.22 119.06l-38.12-29.46C503.49 318.68 512 288.06 512 256c0-63.09-32.06-122.09-85.77-156.16-11.19-7.09-26.03-3.8-33.12 7.41-7.09 11.2-3.78 26.03 7.41 33.13C440.27 165.59 464 209.44 464 256c0 21.21-5.03 41.57-14.2 59.88l-39.56-30.58c3.38-9.35 5.76-19.07 5.76-29.3 0-31.88-17.53-61.33-45.77-76.88-11.58-6.33-26.19-2.16-32.61 9.45-6.39 11.61-2.16 26.2 9.45 32.61 11.76 6.46 19.12 18.18 20.4 31.06L288 190.82V88.02c0-21.46-25.96-31.98-40.97-16.97l-49.71 49.7L45.47 3.37C38.49-2.05 28.43-.8 23.01 6.18L3.37 31.45C-2.05 38.42-.8 48.47 6.18 53.9l588.36 454.73c6.98 5.43 17.03 4.17 22.46-2.81l19.64-25.27c5.41-6.97 4.16-17.02-2.82-22.45zM32 184v144c0 13.25 10.74 24 24 24h102.06l88.97 88.95c15.03 15.03 40.97 4.47 40.97-16.97V352.6L43.76 163.84C36.86 168.05 32 175.32 32 184z");
                        return el;
                    })());
                    return el;
                })())
                el.appendChild(document.createTextNode("Mute advertiser"));
                return el;
            })();

            this.unMuteBlock = (() => {
                let el = document.createElement("span");
                el.appendChild((() => {
                    let el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                    el.setAttribute("data-icon", "volume-up");
                    el.setAttribute("role", "img");
                    el.setAttribute("class", "UBO-icon");
                    el.setAttributeNS(null, "viewBox", "0 0 576 512");
                    el.appendChild((() => {
                        let el = document.createElementNS("http://www.w3.org/2000/svg", "path");
                        el.setAttributeNS(null, "fill", "currentColor");
                        el.setAttributeNS(null, "d", "M215.03 71.05L126.06 160H24c-13.26 0-24 10.74-24 24v144c0 13.25 10.74 24 24 24h102.06l88.97 88.95c15.03 15.03 40.97 4.47 40.97-16.97V88.02c0-21.46-25.96-31.98-40.97-16.97zm233.32-51.08c-11.17-7.33-26.18-4.24-33.51 6.95-7.34 11.17-4.22 26.18 6.95 33.51 66.27 43.49 105.82 116.6 105.82 195.58 0 78.98-39.55 152.09-105.82 195.58-11.17 7.32-14.29 22.34-6.95 33.5 7.04 10.71 21.93 14.56 33.51 6.95C528.27 439.58 576 351.33 576 256S528.27 72.43 448.35 19.97zM480 256c0-63.53-32.06-121.94-85.77-156.24-11.19-7.14-26.03-3.82-33.12 7.46s-3.78 26.21 7.41 33.36C408.27 165.97 432 209.11 432 256s-23.73 90.03-63.48 115.42c-11.19 7.14-14.5 22.07-7.41 33.36 6.51 10.36 21.12 15.14 33.12 7.46C447.94 377.94 480 319.54 480 256zm-141.77-76.87c-11.58-6.33-26.19-2.16-32.61 9.45-6.39 11.61-2.16 26.2 9.45 32.61C327.98 228.28 336 241.63 336 256c0 14.38-8.02 27.72-20.92 34.81-11.61 6.41-15.84 21-9.45 32.61 6.43 11.66 21.05 15.8 32.61 9.45 28.23-15.55 45.77-45 45.77-76.88s-17.54-61.32-45.78-76.86z");
                        return el;
                    })());
                    return el;
                })())
                el.appendChild(document.createTextNode("Unmute advertiser"));
                return el;
            })();

            this.muteButton = (() => {
                let el = document.createElement("button");
                el.setAttribute("class", "UBO-menu-item");
                el.appendChild(this.muteBlock);
                el.appendChild((() => {
                    let el = document.createElement("span");
                    el.setAttribute("class", "BLK-tooltip");
                    el.appendChild(document.createTextNode("Mute all ads from this advertiser"));
                    return el;
                })())
                el.addEventListener("click", onMute)
                return el;
            })()
            this.skipButton = (() => {
                let el = document.createElement("button");
                el.setAttribute("class", "UBO-menu-item");
                el.appendChild((() => {
                    let el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                    el.setAttribute("data-icon", "fast-forward");
                    el.setAttribute("viewBox", "0 0 512 512");
                    el.setAttribute("class", "UBO-icon");
                    el.appendChild((() => {
                        let el = document.createElementNS("http://www.w3.org/2000/svg", "path");
                        el.setAttributeNS(null, "fill", "currentColor");
                        el.setAttributeNS(null, "d", "M512 76v360c0 6.6-5.4 12-12 12h-40c-6.6 0-12-5.4-12-12V284.1L276.5 440.6c-20.6 17.2-52.5 2.8-52.5-24.6V284.1L52.5 440.6C31.9 457.8 0 443.4 0 416V96c0-27.4 31.9-41.7 52.5-24.6L224 226.8V96c0-27.4 31.9-41.7 52.5-24.6L448 226.8V76c0-6.6 5.4-12 12-12h40c6.6 0 12 5.4 12 12z");
                        return el;
                    })());
                    return el;
                })())
                el.appendChild(document.createTextNode("Attempt skip"));
                el.appendChild((() => {
                    let el = document.createElement("span");
                    el.setAttribute("class", "BLK-tooltip");
                    el.appendChild(document.createTextNode("Try to skip this ad. If unskippable, it will play at 5x speed to the end."));
                    return el;
                })())
                el.addEventListener("click", () => {
                    this.closeMenu();
                    onSkip()
                })
                return el;
            })()

            this.menu = (() => {
                let el = document.createElement("div");
                el.setAttribute("class", "UBO-menu hidden");
                el.appendChild((() => {
                    let el = document.createElement("button");
                    el.setAttribute("class", "UBO-menu-item");
                    el.appendChild((() => {
                        let el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                        el.setAttribute("data-icon", "ban");
                        el.setAttribute("role", "img");
                        el.setAttribute("class", "UBO-icon");
                        el.setAttributeNS(null, "viewBox", "0 0 512 512");
                        el.appendChild((() => {
                            let el = document.createElementNS("http://www.w3.org/2000/svg", "path");
                            el.setAttributeNS(null, "fill", "currentColor");
                            el.setAttributeNS(null, "d", "M256 8C119.033 8 8 119.033 8 256s111.033 248 248 248 248-111.033 248-248S392.967 8 256 8zm141.421 106.579c73.176 73.175 77.05 187.301 15.964 264.865L132.556 98.615c77.588-61.105 191.709-57.193 264.865 15.964zM114.579 397.421c-73.176-73.175-77.05-187.301-15.964-264.865l280.829 280.829c-77.588 61.105-191.709 57.193-264.865-15.964z");
                            return el;
                        })());
                        return el;
                    })());
                    el.appendChild(document.createTextNode("Block advertiser"));
                    el.appendChild((() => {
                        let el = document.createElement("span");
                        el.setAttribute("class", "BLK-tooltip");
                        el.appendChild(document.createTextNode("Block all ads from this advertiser"));
                        return el;
                    })())
                    el.addEventListener("click", onBlacklist);
                    return el;
                })());
                el.appendChild(this.muteButton);
                el.appendChild(this.skipButton)
                el.addEventListener("focusin", () => this.menuFocused = true);
                el.addEventListener("focusout", () => {
                    this.menuFocused = false;
                    this.unfocusedMenu();
                });
                return el;
            })();

            ;

            this.optionsButton = (() => {
                let el = document.createElement("button");
                el.setAttribute("id", "BLK-button");
                el.setAttribute("class", "ytp-button hidden");

                el.appendChild(this.tooltip = (() => {
                    let el = document.createElement("span");
                    el.setAttribute("class", "BLK-tooltip");
                    el.appendChild(document.createTextNode("Options for this advertiser"));
                    return el;
                })());

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

                el.addEventListener("click", this.toggleMenu);
                el.addEventListener("focusin", () => this.buttonFocused = true);
                el.addEventListener("focusout", () => {
                    this.buttonFocused = false;
                    this.unfocusedMenu();
                });
                return el;
            })();
            this.menuOpen = false;
            this.menuFocused = false;
            this.buttonFocused = false;
            this.muted = false;
        }
        set advertiserName(title) {
            this.tooltip.textContent = `Manage ads from "${title}"`;
        }

        set muteToggled(state) {
            state = !!state;
            if (state === this.muted) return;

            if (this.muted) {
                this.muteButton.removeChild(this.unMuteBlock);
            } else {
                this.muteButton.removeChild(this.muteBlock);
            }

            this.muted = state;

            if (state) {
                agent.send("mute", { mute: true });
                this.muteButton.appendChild(this.unMuteBlock);
            } else {
                agent.send("mute", { mute: false });
                this.muteButton.appendChild(this.muteBlock);
            }
        }

        toggleMenu() {
            if (this.menuOpen) {
                this.closeMenu();
            } else {
                this.openMenu();
            }
        }
        unfocusedMenu() {
            setTimeout(() => {
                if (!this.menuFocused && !this.buttonFocused) {
                    this.closeMenu();
                }
            }, 0)

            return false;
        }
        closeMenu() {
            this.menu.classList.add("hidden");
            this.tooltip.classList.remove("hidden");
            this.menuOpen = false;
        }
        openMenu() {
            this.menu.classList.remove("hidden");
            this.tooltip.classList.add("hidden");
            this.menu.style.left = (this.optionsButton.offsetLeft - (this.menu.offsetWidth / 2) + (this.optionsButton.offsetWidth / 2)) + "px";
            this.menu.style.bottom = "49px";
            this.menuOpen = true;
        }
        show() {
            this.optionsButton.classList.remove("hidden");
        }
        hide() {
            this.closeMenu();
            this.optionsButton.classList.add("hidden");
        }
        renderButton() {
            return this.optionsButton;
        }
        renderMenu() {
            return this.menu;
        }
    }

    class SingleChannelPage {
        constructor(ButtonFactory) {
            this.dataNode = null
            this.buttonParent = null;
            this.whitelistButton = new ButtonFactory(this.toggleWhitelist.bind(this), false);
            this.adOptions = new AdOptions(this.addBlacklist.bind(this), this.toggleMute.bind(this), this.attemptSkip.bind(this));
            this.channelId = null;
            this.currentAd = null;
            this.currentDuration = "";
            this.firstRun = true;
            this.adPlaying = false;
            this.adConfirmed = false;
            this.skipButton = null;
            this.currentPlayer = null;
            this.awaitingSkip = false;
        }

        updatePage(forceUpdate, verify) {
            if (!this.dataNode && !this.setDataNode()) return;// console.error("Container not available");

            this.channelId = this.getChannelId(this.dataNode);
            if (!this.channelId) throw "Channel ID not available";

            let whitelisted = pages.updateURL(this.channelId, verify);

            whitelisted ? this.whitelistButton.on() : this.whitelistButton.off();
            if (!this.whitelistButton.exists()) {
                this.insertButton(this.whitelistButton);
                // if whitelistButton doesn't exist, is there a chance that AdOptions doesn't exist either?
                if (this.firstRun) {
                    let player = document.querySelector("#movie_player");

                    if (player) {
                        this.updateAdPlaying(player, !!player.classList.contains("ad-showing"), true);
                    }

                    this.firstRun = false;
                }
            }

            this.updateAdButton();
            this.updateVideos(whitelisted, forceUpdate);
        }

        updateAdPlaying(player, playing, firstRun = false) {
            if (playing && !this.adPlaying) {
                let container = player.querySelector(".ytp-right-controls");
                if (!container) return console.error("Can't find .ytp-right-controls");

                let options = this.adOptions.renderButton();
                let menu = this.adOptions.renderMenu();

                if (!container.contains(options)) {
                    container.insertBefore(options, container.firstChild);
                }
                if (!player.contains(menu)) {
                    player.appendChild(menu);
                }
                this.currentPlayer = player.querySelector("video");
                if (firstRun) {
                    let duration = player.querySelector(".ytp-time-duration");
                    this.currentDuration = (duration && duration.textContent) || "";

                    agent.send("recent-ad").then(message => {
                        if (message.error) return;
                        this.currentAd = message.ad;
                        this.updateAdButton();
                    })
                }

                this.adPlaying = true;
            } else if (!playing && this.adPlaying) {
                this.adOptions.muteToggled = false;
                this.adOptions.hide();
                this.adPlaying = false;
                this.adConfirmed = false;
                this.awaitingSkip = false;
                this.skipButton = null;
                this.currentPlayer = null;
                this.currentAd = null;
            }

            if (this.adPlaying) {
                this.updateAdButton();
            }
        }
        updateAdInformation(ad) {
            this.currentAd = ad;
            this.updateAdButton();
        }

        updateAdButton() {
            if (!this.adConfirmed && this.adPlaying && this.currentAd && this.withinSpec(this.currentDuration, this.currentAd.length_seconds)) {
                this.adConfirmed = true;
                this.adOptions.advertiserName = this.currentAd.channelId.display;
                this.adOptions.show();
            }

            if (this.adConfirmed) {
                this.adOptions.muteToggled = ChannelID.inmutelist(this.currentAd.channelId) !== -1;
            }
        }
        attemptSkip() {
            if (!this.currentPlayer) return// console.error("Player not available");
            if (this.skipButton) {
                return this.skipButton.click();
            }
            this.adOptions.muteToggled = true;
            this.awaitingSkip = true;
            this.currentPlayer.playbackRate = 5;
        }
        updateSkip(skipButton) {
            this.skipButton = skipButton;

            if (this.awaitingSkip) {
                this.skipButton.click();
            }
        }
        updateDuration(duration) {
            this.currentDuration = duration;
            this.updateAdButton()
        }

        withinSpec(durationText, target) {
            let duration = this.toSeconds(durationText);

            if (!duration) {
                return false;
            } else {
                return Math.abs(duration - target) < 2;
            }
        }

        toSeconds(durationText) {
            if (!durationText)
                return 0;
            else {
                let durationParts = durationText.split(":");
                let duration = 0;

                for (let i = 0; i < durationParts.length; i++) {
                    if (isNaN(durationParts[i])) return 0;
                    duration += ~~durationParts[i] * Math.pow(60, durationParts.length - i - 1)
                }

                return duration;
            }
        }

        addBlacklist() {
            if (!this.currentAd.channelId) throw ("Channel ID not available for blacklisting");
            agent.send("set-settings", { channelId: this.currentAd.channelId, type: "add-black" }).then(response => {
                if (!response.error)
                    location.reload();
                else
                    console.error(response.err);
            })
        }

        toggleMute() {
            if (!this.currentAd.channelId) throw "Ad channel ID not available for muting";
            let shouldMute = ChannelID.inmutelist(this.currentAd.channelId) === -1;
            let action = shouldMute ? "add-mute" : "remove-mute";

            agent.send("set-settings", { channelId: this.currentAd.channelId, type: action }).then(response => {
                if (!response.error)
                    agent.send("mute", { mute: shouldMute });
                else
                    console.error(response.err);
            })
        }

        toggleWhitelist() {
            this.channelId = this.getChannelId(this.dataNode);
            if (!this.channelId) throw "Channel ID not available";

            if (ChannelID.inwhitelist(this.channelId) !== -1) {
                agent.send("set-settings", { channelId: this.channelId, type: "remove-white" });
                this.whitelistButton.off();
            } else {
                agent.send("set-settings", { channelId: this.channelId, type: "add-white" });
                this.whitelistButton.on();
            }

        }
    }

    class VideoPagePoly extends SingleChannelPage {
        constructor() {
            super(WhitelistButtonPoly);
            this.toggleWhitelist = this.toggleWhitelist.bind(this);
            this.updatePage = this.updatePage.bind(this);
            this.updateVideos = this.updateVideos.bind(this);
        }

        setDataNode(container) {
            return this.dataNode = container || this.dataNode || document.querySelector("ytd-video-owner-renderer");
        }

        setParentNode(parent) {
            return this.buttonParent = parent || this.buttonParent;
        }
        insertButton(button) {
            this.setParentNode(this.dataNode.parentNode);

            if (this.dataNode.nextSibling) {
                this.buttonParent.insertBefore(button.render(), this.dataNode.nextSibling);
            } else {
                this.buttonParent.appendChild(button.render());
            }
        }
        updateVideos(whitelisted, forceUpdate) {
            this.updateInfobar(this.dataNode, whitelisted);
            let relatedVideos = document.querySelectorAll("ytd-compact-video-renderer,ytd-playlist-panel-video-renderer");

            pages.updateVideos(relatedVideos, forceUpdate)
        }

        updateInfobar(container, whitelisted, channelId = this.channelId) {
            container = this.setDataNode(container);
            if (!container) return false;
            if (!channelId) return false;

            let links = container.querySelectorAll("a");

            for (let link of links) {
                // this link hasn't been looked at
                // or the channel changed
                // or the whitelist state changed
                // or the link changed to something that we didnt set it to
                if (!link.channelId || link.channelId !== channelId.id || link.whitelisted !== whitelisted || link.sethref !== link.href) {
                    link.href = link.sethref = pages.reflectURLFlag(link.href, whitelisted);
                    link.whitelisted = whitelisted;
                    link.channelId = channelId.id;
                }
            }
        }

        getChannelId(container) {
            let channelId = ChannelID.createNew();
            container = this.setDataNode(container);

            if (!container) return false;

            channelId.username = ChannelID.getUsernameFromURL(oGet(container, "data.navigationEndpoint.browseEndpoint.canonicalBaseUrl")) || ""
            channelId.id = oGet(container, "data.navigationEndpoint.browseEndpoint.browseId") || "";
            channelId.display = oGet(container, "data.title.runs[0].text") || "";

            return ChannelID.validate(channelId);
        }
    }

    class VideoPageBasic extends SingleChannelPage {
        constructor() {
            super(WhitelistButtonBasic);
            this.toggleWhitelist = this.toggleWhitelist.bind(this);
            this.updatePage = this.updatePage.bind(this);
            this.updateVideos = this.updateVideos.bind(this);
        }
        setDataNode(container) {
            return this.dataNode = container || this.dataNode || document.querySelector("#watch7-user-header");
        }
        setParentNode(parent) {
            let tParent = parent || this.buttonParent;

            if (!tParent) {
                if (this.dataNode) {
                    tParent = this.dataNode.querySelector("#watch7-subscription-container")
                } else {
                    tParent = document.querySelector("#watch7-subscription-container");
                }
            }

            return this.buttonParent = tParent;
        }
        insertButton(button) {
            this.setParentNode();

            if (this.buttonParent.nextSibling) {
                this.buttonParent.parentNode.insertBefore(button.render(), this.buttonParent.nextSibling);
            } else {
                this.buttonParent.parentNode.appendChild(button.render());
            }
        }
        updateVideos(whitelisted, forceUpdate) {
            this.updateInfobar(this.dataNode, whitelisted);
            pages.updateRelatedBasic(forceUpdate);
        }
        updateInfobar(container, whitelisted, channelId = this.channelId) {

        }
        getChannelId(container) {
            this.setDataNode(container);
            let links = this.dataNode.querySelectorAll("a");
            return ChannelID.validate(ChannelID.extractFromLinks(links));
        }
    }

    class ChannelPagePoly extends SingleChannelPage {
        constructor() {
            super(WhitelistButtonPoly);

            this.toggleWhitelist = this.toggleWhitelist.bind(this);
            this.updatePage = this.updatePage.bind(this);
            this.updateVideos = this.updateVideos.bind(this);
        }

        setDataNode(container) {
            // ytd-page-manager contains data at .data.response.metadata
            // whereas ytd-browse contains data at .data.metadata
            return this.dataNode = container || this.dataNode || document.querySelector("ytd-page-manager");//"ytd-browse");
        }

        setParentNode(parent) {
            return this.buttonParent = parent || this.buttonParent || document.querySelector("#edit-buttons");
        }
        insertButton(button) {
            this.setParentNode();
            this.buttonParent.appendChild(button.render());
        }

        updateVideos(whitelisted, forceUpdate) {
            pages.updateAllVideos(forceUpdate, this.channelId);
        }

        getChannelId(container) {
            let channelId = ChannelID.createNew();
            container = this.setDataNode(container);
            if (!container) return false;

            channelId.username = oGet(container, "data.response.metadata.channelMetadataRenderer.doubleclickTrackingUsername") || "";
            channelId.display = oGet(container, "data.response.metadata.channelMetadataRenderer.title") || "";
            channelId.id = oGet(container, "data.response.metadata.channelMetadataRenderer.externalId") || "";

            return ChannelID.validate(channelId);
        }
    }

    class ChannelPageBasic extends SingleChannelPage {
        constructor() {
            super(WhitelistButtonBasic);
            this.toggleWhitelist = this.toggleWhitelist.bind(this);
            this.updatePage = this.updatePage.bind(this);
            this.updateVideos = this.updateVideos.bind(this);
        }
        setDataNode() {
            return true;
        }

        setParentNode(parent) {
            return this.buttonParent = parent || this.buttonParent || document.querySelector(".primary-header-actions");
        }
        insertButton(button) {
            this.setParentNode();
            this.buttonParent.appendChild(button.render());
        }

        updateVideos(whitelisted, forceUpdate) {
            pages.updateAllVideosBasic(whitelisted, forceUpdate);
        }
        getChannelId() {
            let links = [location]
            let link = document.querySelector("link[rel='canonical']");

            if (link) {
                links.push(link);
            }

            let channelId = ChannelID.extractFromLinks(links);
            channelId.username = (link && link.getAttribute("username")) || "";
            channelId.display = document.querySelector(".branded-page-header-title-link").textContent || "";
            return ChannelID.validate(channelId)
        }
    }

    class SearchPagePoly {
        constructor() {
            this.updatePage = this.updatePage.bind(this);
        }
        updatePage(forceUpdate) {
            let t = Math.random();
            let channelElements = document.querySelectorAll("ytd-channel-renderer");

            if (!channelElements) return;

            for (let channelElement of channelElements) {
                let channelId = this.getChannelId(channelElement);
                let whitelisted = ChannelID.inwhitelist(channelId) !== -1;

                if (channelElement.whitelistButton && channelElement.whitelistButton.exists()) {
                    if (forceUpdate)
                        whitelisted ? channelElement.whitelistButton.on() : channelElement.whitelistButton.off();
                } else {
                    let button = new WhitelistButtonPoly(this.toggleWhitelist.bind(this, channelElement), whitelisted);
                    let container = channelElement.querySelector("#subscribe-button");

                    container.insertBefore(button.render(), container.firstChild);
                    channelElement.whitelistButton = button;
                }
            }

            pages.updateAllVideos(forceUpdate)
        }
        toggleWhitelist(dataNode) {
            let channelId = this.getChannelId(dataNode);
            if (!channelId) throw "Channel ID not available";

            if (ChannelID.inwhitelist(channelId) !== -1) {
                ChannelID.whitelistRemove(channelId);
            } else {
                ChannelID.whitelistAdd(channelId);
            }
        }
        getChannelId(container) {
            let channelId = ChannelID.createNew();
            if (!container) throw "Search element required to get channelId under search mode";

            channelId.display = oGet(container, "data.title.simpleText") || "";
            channelId.id = oGet(container, "data.channelId") || "";
            channelId.username = ChannelID.getUsernameFromURL(oGet(container, "data.longBylineText.runs[0].navigationEndpoint.browseEndpoint.canonicalBaseUrl")) || "";

            return ChannelID.validate(channelId);
        }
    }

    class SearchPageBasic {
        constructor() {
            this.udpatePage = this.updatePage.bind(this);
        }
        updatePage(forceUpdate) {

        }
    }

    class ChannelID {
        static createNew() {
            return { id: "", username: "", display: "" };
        }
        static getUsernameFromURL(url) {
            if (!url) return "";
            let matches = url.match(/\/user\/(.+)/);
            if (matches && matches.length > 1)
                return matches[1];
        }
        static whitelistRemove(channelId) {
            return agent.send("set-settings", { channelId: channelId, type: "remove-white" });
        }
        static whitelistAdd(channelId) {
            return agent.send("set-settings", { channelId: channelId, type: "add-white" });
        }
        static inmutelist(search, idOnly) {
            return ChannelID.searchlist(settings.muted, search, idOnly);
        }

        static inwhitelist(search, idOnly) {
            return ChannelID.searchlist(settings.whitelisted, search, idOnly)
        }

        static searchlist(object, channelId, idOnly) {
            if (!channelId) return;

            let id, username;

            if (idOnly) {
                id = channelId;
                username = "";
            } else {
                id = channelId.id;
                username = channelId.username;
            }

            const validId = id.length > 4;
            const validUsername = username.length > 4;

            for (let i in object) {
                if ((validId && object[i].id === id) || (validUsername && object[i].username === username)) {
                    return i;
                }
            }
            return -1;
        }

        static validate(channelId) {
            if (channelId.id || channelId.username)
                return channelId;
            else
                return false;
        }

        static extractFromLinks(links) {
            let channelId = ChannelID.createNew();

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
            return channelId;
        }
    }

    class Page {
        constructor(design) {
            if (design === LPOLY) {
                this.video = new VideoPagePoly();
                this.channel = new ChannelPagePoly();
                this.search = new SearchPagePoly();
            } else if (design === LBASIC) {
                this.video = new VideoPageBasic();
                this.channel = new ChannelPageBasic();
                this.search = new SearchPageBasic();
            }

            this.currentURL = "";
            this.updateAllVideos = this.updateAllVideos.bind(this);
        }
        static getDesign() {
            if (window.Polymer || document.querySelector("ytd-app")) {
                return LPOLY;
            } else {
                return LBASIC;
            }
        }
        getMode() {
            let newURL = location.href;

            if (newURL !== this.currentURL) {
                this.currentURL = newURL;
                return this.mode = this.determineMode(newURL);
            } else {
                return this.mode;
            }
        }
        determineMode(url = location.href) {
            if (url.indexOf("youtube.com/watch?") !== -1) {
                return VIDEO;
            } else if (url.indexOf("youtube.com/channel/") !== -1 || url.indexOf("youtube.com/user/") !== -1) {
                return CHANNEL;
            } else if (url.indexOf("youtube.com/results?") !== -1) {
                return SEARCH;
            } else {
                return ALLELSE;
            }
        }

        update(forceUpdate, verify) {
            let mode = this.getMode();

            if (mode === VIDEO) {
                this.video.updatePage(forceUpdate, verify);
            } else if (mode === CHANNEL) {
                this.channel.updatePage(forceUpdate, verify);
            } else if (mode === SEARCH) {
                this.search.updatePage(forceUpdate);
            } else if (mode === ALLELSE) {
                this.updateAllVideos(forceUpdate)
            }
        }

        updateAd(ad, mode = this.getMode()) {
            if (mode === VIDEO) {
                this.video.updateAdInformation(ad);
            } else if (mode === CHANNEL) {
                this.channel.updateAdInformation(ad);
            }
        }
        updateVideos(videos, forceUpdate, channelId) {
            for (let video of videos) {
                if (!forceUpdate && video.data.processed) continue;

                let id = oGet(video, "data.shortBylineText.runs[0].navigationEndpoint.browseEndpoint.browseId") ||
                    (channelId && channelId.id);

                if (id) {
                    let links = video.querySelectorAll("a[href^='/watch?']");
                    if (!links.length) continue;

                    let destURL = video.data.originalHref;

                    if (ChannelID.inwhitelist(id, true) !== -1) {
                        if (!video.data.originalHref) {
                            destURL = links[0].getAttribute("href");
                            video.data.originalHref = destURL;
                        }
                        destURL += "&disableadblock=1";
                    } else {
                        if (!destURL) {
                            video.data.processed = true;
                            continue;
                        }
                    }

                    for (let link of links)
                        link.href = destURL;

                    if (oGet(video, "data.navigationEndpoint.webNavigationEndpointData.url"))
                        video.data.navigationEndpoint.webNavigationEndpointData.url = destURL;
                    if (oGet(video, "data.navigationEndpoint.commandMetadata.webCommandMetadata.url"))
                        video.data.navigationEndpoint.commandMetadata.webCommandMetadata.url = destURL;

                    video.data.processed = true;
                }
            }
        }
        updateAllVideos(forceUpdate, channelId) {
            let videos = document.querySelectorAll("ytd-grid-video-renderer,ytd-video-renderer,ytd-playlist-video-renderer");

            return this.updateVideos(videos, forceUpdate, channelId);
        }
        updateAllVideosBasic(whitelisted, forceUpdate = false) {
            let videos = document.querySelectorAll(".yt-lockup-video");

            for (let vid of videos) {
                if (!forceUpdate && vid.processed) continue;
                let inwhite;

                if (whitelisted !== null) {
                    inwhite = whitelisted;
                } else {
                    let user = vid.querySelector(".stat.attribution span");
                    let values = { username: "" };

                    if (!user || !(values.username = user.textContent))
                        continue;
                    inwhite = ChannelID.inwhitelist(values) !== -1
                }
                if (inwhite || forceUpdate) { // exists
                    let links = vid.querySelectorAll("a[href^='/watch?']");

                    for (let link of links) {
                        link.setAttribute("href", pages.reflectURLFlag(link.getAttribute("href"), inwhite));
                    }
                }
                vid.processed = true;
            }
        }
        updateRelatedBasic(forceUpdate) {
            let videos = document.querySelectorAll(".video-list-item");

            for (let vid of videos) {
                if (!forceUpdate && vid.processed) continue;

                let user, userNode = vid.querySelector("[data-ytid]");

                if (!user) {
                    continue;
                } else {
                    user = userNode.getAttribute("data-ytid");
                }
                let inwhite = ChannelID.inwhitelist(user, true) !== -1
                let links = vid.querySelectorAll("a[href^='/watch?']");
                if (inwhite || forceUpdate) {
                    for (let link of links) {
                        link.setAttribute("href", this.reflectURLFlag(link.getAttribute("href"), inwhite));
                    }
                }
                vid.processed = true;
            }
        }
        updateURL(channelId, verify) {
            if (!channelId) throw "No channel ID passed to updateURL";

            if (location.href.indexOf("&disableadblock=1") !== -1) {
                // ads are enabled, should we correct that?
                if (ChannelID.inwhitelist(channelId) === -1) {
                    window.history.replaceState(history.state, "", pages.reflectURLFlag(location.href, false));
                    return false;
                } else return true;
            } else {
                // ads are not enabled, lets see if they should be
                if (ChannelID.inwhitelist(channelId) !== -1) {
                    window.history.replaceState(history.state, "", pages.reflectURLFlag(location.href, true));

                    if (verify) this.confirmDisabled();
                    return true;
                } else return false;
            }
        }

        reflectURLFlag(url, shouldContain) {
            // take url, return url with flags removed if add is off
            // return url with flags added if add is on
            let search = /((?!\?)igno=re&disableadblock=1&?)|(&disableadblock=1)/g

            if (shouldContain) {
                url = this.reflectURLFlag(url, false); // remove first, then add
                let paramsStart = url.indexOf("?");
                return url + (paramsStart === -1 ? "?igno=re" : (paramsStart === url.length - 1 ? "igno=re" : "")) + "&disableadblock=1"

            } else {
                return url.replace(search, "");
            }
        }

        confirmDisabled() {
            setTimeout(() =>
                fetch("https://www.youtube.com/favicon.ico?ads=true").catch(() =>
                    prompt("Ads may still be blocked, make sure you've added the following rule to your uBlock Origin whitelist", "*youtube.com/*&disableadblock=1")
                )
                , 300);
        }
    }

    class MessageAgent {
        constructor(identifier) {
            this.instance = identifier || Math.random().toString(36).substring(7); //used to differentiate between us and others
            this.resolvers = [];
            this.events = {};
            this.messageListener = this.messageListener.bind(this);
            this.requestsPending = [];

            window.addEventListener("message", this.messageListener);
        }
        on(event, listener) {
            if (typeof listener !== "function") throw "Listener must be a function";
            if (!this.events[event]) this.events[event] = [];
            this.events[event].push(listener);

            return this;
        }

        send(event, message) {
            let callbackId = Math.random().toString(36).substring(7);
            window.postMessage({ event: event, message: message, callbackId: callbackId, instance: this.instance }, "*");

            return new Promise((resolve, reject) => {
                this.resolvers.push({ id: callbackId, resolver: resolve, rejector: reject });
            })
        }
        messageListener(e) {
            let revent = e.data;
            let promises = [];

            if (revent.instance && revent.instance !== this.instance) { //do not process if the event came from ourselves
                if (revent.event && revent.event in this.events) {
                    let done;

                    let pending = new Promise(resolve => {
                        done = resolve;
                    }).then(() => {
                        this.requestsPending.splice(this.requestsPending.findIndex(item => item === pending));
                    });

                    this.requestsPending.push(pending);

                    for (let i = 0; i < this.events[revent.event].length; i++) {
                        let response = this.events[revent.event][i](revent.message); //execute listener
                        if (response instanceof Promise) //if a promise
                            promises.push(response); //wait til resolved
                        else
                            promises.push(Promise.resolve(response)) //resolve immediately
                    }

                    Promise.all(promises).then(messages => { //send messages as single array once all promises are resolved
                        window.postMessage({
                            callbackId: revent.callbackId,
                            message: messages.length === 1 ? messages[0] : messages,
                            instance: this.instance
                        }, "*");
                    }).then(done);

                } else if (revent.callbackId) { //we received a response to a message we sent
                    let index = this.resolvers.findIndex(val => val.id === revent.callbackId);

                    if (index === -1) return;
                    let callback = this.resolvers[index];
                    this.resolvers.splice(index, 1); //remove resolver from array
                    callback.resolver(revent.message); //execute callback
                }
            }
        }
        destroy() {
            Object.keys(this.events).forEach(key => this.events[key] = []);
            return Promise.all(this.requestsPending.concat(this.resolvers)).then(() => {
                window.removeEventListener("message", this.messageListener);
                this.resolvers = null;
                this.events = null;
                this.instance = null;
            })
        }

    }

    function oGet(object, key) {
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

    function init() {
        pages = new Page(Page.getDesign());
        watcher = new MutationWatcher();
        pages.update(true);
        watcher.start();

        agent.on("settings-update", updated => {
            settings = updated.settings;
            pages.update(true, updated.initiator)
        }).on("ad-update", ad => {
            pages.updateAd(ad);
        }).on("destroy", () => {
            console.log("Detaching inject script..");

            agent.destroy();
            watcher.destroy();
            domCleanup();
            agent = null;
            watcher = null;
            pages = null;
        }).send("ready");

        function domCleanup() {
            let nodes = document.querySelectorAll("#BLK-button,.UBO-button,.UBO-button-container,.UBO-menu");

            for (let node of nodes) {
                node.remove();
            }
        }
    }

    agent = new MessageAgent();
    agent.send("get-settings").then(response => {
        settings = response.settings;
        accessURLs = response.accessURLs;

        if (document.readyState === "complete" || document.readyState === "interactive") {
            init(); // DOMContentAlreadyLoaded
        } else {
            document.addEventListener("DOMContentLoaded", init);
        }
    });

    return {
        Page: Page,
        VideoPageBasic: VideoPageBasic,
        VideoPagePoly: VideoPagePoly,
        MessageAgent: MessageAgent,
        WhitelistButton: WhitelistButton,
        WhitelistButtonBasic: WhitelistButtonBasic,
        whitelistButtonPoly: WhitelistButtonPoly,
        ChannelID: ChannelID,
        ChannelPageBasic: ChannelPageBasic,
        ChannelPagePoly: ChannelPagePoly,
        SingleChannelPage: SingleChannelPage,
        SearchPagePoly: SearchPagePoly,
        SearchPageBasic: SearchPageBasic,
        AdOptions: AdOptions,
        MutationWatcher: MutationWatcher
    }
})(window, document, console)
