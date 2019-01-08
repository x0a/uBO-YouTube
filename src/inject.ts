"use strict";
import MessageAgent from "./agent";

import {
    Channel, Settings, AccessURL,
    Action, MutationElement, ChannelList,
    Design, Mode, MenuItem,
    InfoLink, VideoPoly, VideoBasic, Ad
} from "./typings";

const VIDEO = 1;
const CHANNEL = 2;
const SEARCH = 3;
const ALLELSE = -1;
const LPOLY = 2; // new polymer layout
const LBASIC = 1; // old basic layout, less and less supported as time goes on

/* ---------------------------- */
type WhitelistButtonInstance = WhitelistButtonBasic | WhitelistButtonPoly;
type WhitelistButtonFactory = typeof WhitelistButtonBasic | typeof WhitelistButtonPoly;

interface ChannelElement extends HTMLDivElement {
    whitelistButton: WhitelistButtonPoly;
}

let settings: Settings;
let accessURLs: AccessURL;
let pages: Page, watcher: MutationWatcher, agent: MessageAgent;

class MutationWatcher {

    watcher: MutationObserver;
    queuedActions: Map<Function, Action>;

    constructor() {
        this.watcher = new MutationObserver(this.onMutation.bind(this));
        this.queuedActions = new Map();
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

    isPlayerUpdate(mutation: MutationElement): HTMLElement {
        if (mutation.target.id === "movie_player") {
            return mutation.target;
        } else if (mutation.target.id === "player-container" && mutation.addedNodes.length) {
            for (let node of mutation.addedNodes) {
                if (node.id === "movie_player") {
                    return node as HTMLElement;
                }
            }
        }
    }

    isPlayerDurationUpdate(mutation: MutationElement) {
        return mutation.target.className === "ytp-time-duration"
            && mutation.addedNodes.length;
    }

    isPolyUserInfo(mutation: MutationElement): HTMLElement {
        if (
            (
                mutation.target.id === "owner-name"
                && mutation.addedNodes.length
            ) || (
                mutation.type === "attributes"
                && mutation.target.parentNode
                && (mutation.target.parentNode as HTMLElement).id === "owner-name"
                && mutation.attributeName === "href"
            )
        ) {
            return mutation.target.closest("ytd-video-owner-renderer") as HTMLElement;
        } else {
            return null;
        }
    }

    isBasicUserInfo(mutation: MutationElement): HTMLElement {
        if (mutation.target.id === "watch7-container" && mutation.addedNodes.length) {
            for (let node of mutation.addedNodes) {
                if (node.id === "watch7-main-container") {
                    return node.querySelector("#watch7-user-header") as HTMLElement;
                }
            }
        } else if (mutation.target.id === "watch7-user-header") {
            return mutation.target as HTMLElement;
        }

        return null;
    }

    isRelatedUpdate(mutation: MutationElement) {
        return (
            mutation.type === "attributes"
            && mutation.target.id === "continuations"
            && mutation.attributeName === "hidden"
        );
    }

    hasNewItems(mutation: MutationElement) {
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

    finishedLoadingBasic(mutation: MutationElement): boolean {
        for (let node of mutation.removedNodes) {
            if (node.id === "progress") {
                return true; // old layout, progress bar removed
            }
        }
        return false;
    }

    isAdSkipButton(mutation: MutationElement) {
        return mutation.type === "attributes"
            && mutation.target.classList.contains("videoAdUiSkipContainer")
            && mutation.target.style.display !== "none"
            && mutation.target.querySelector("button");
    }

    pollUpdate(method: Function) {
        // To prevent excessive updating, wait
        let ticket: Action;
        let action = () => {
            ticket.lastExecuted = Date.now();
            method();
        };

        if (this.queuedActions.has(method)) {
            ticket = this.queuedActions.get(method);

            if (ticket.timeoutId) {
                clearTimeout(ticket.timeoutId);
            }

            if (Date.now() - ticket.lastExecuted > 400) {
                action();
            } else {
                ticket.timeoutId = window.setTimeout(action, 50);
            }
        } else {
            ticket = {
                method: method,
                lastExecuted: Date.now(),
                timeoutId: window.setTimeout(action, 50)
            }
            this.queuedActions.set(method, ticket)
        }
    }

    findInjection(mutation: MutationElement, selector: string): void {
        if (mutation.type === "attributes") return;
        if (mutation.target.matches(selector)) {
            console.log("Target is the subject of mutation", mutation)
        } else if (mutation.type === "childList") {

            for (let node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;

                if (node.matches(selector)) {
                    console.log("Subject was added under mutation", mutation);
                } else if (node.querySelector(selector)) {
                    console.log("Subject was added under childNode of mutation", node, "with mutation", mutation)
                }
            }
            for (let node of mutation.removedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;

                if (node.matches(selector)) {
                    console.log("Subject was removed", mutation);
                }
            }
        }
    }

    onMutation(mutations: Array<MutationElement>) {
        let mode = pages.getMode();

        for (let mutation of mutations) {
            // this.findInjection(mutation, ".ad-container");
            if (mode === VIDEO) {
                let player, userInfo, skipButton;

                if (userInfo = this.isPolyUserInfo(mutation)) {
                    pages.video.setDataNode(userInfo)
                    pages.video.updatePage();
                } else if (userInfo = this.isBasicUserInfo(mutation)) {
                    pages.video.setDataNode(userInfo)
                    pages.video.updatePage();
                } else if (this.isRelatedUpdate(mutation)) {
                    this.pollUpdate(pages.video.updateVideos);
                } else if (player = this.isPlayerUpdate(mutation)) {
                    pages.video.updateAdPlaying(player, !!player.classList.contains("ad-showing"));
                } else if (this.isPlayerDurationUpdate(mutation)) {
                    pages.video.updateDuration(mutation.target.textContent);
                } else if (skipButton = this.isAdSkipButton(mutation)) {
                    pages.video.skipButtonAvailable(skipButton);
                }
            } else if (mode === CHANNEL || mode === SEARCH || mode === ALLELSE) {
                if (mode === CHANNEL) {
                    let player, skipButton;
                    if (player = this.isPlayerUpdate(mutation)) {
                        pages.channel.updateAdPlaying(player, !!player.classList.contains("ad-showing"));
                    } else if (this.isPlayerDurationUpdate(mutation)) {
                        pages.channel.updateDuration(mutation.target.textContent);
                    } else if (skipButton = this.isAdSkipButton(mutation)) {
                        pages.channel.skipButtonAvailable(skipButton);
                    }
                }
                if (this.hasNewItems(mutation) || this.finishedLoadingBasic(mutation)) { // new items in videolist
                    if (mode === CHANNEL) {
                        this.pollUpdate(pages.channel.updatePage);
                    } else if (mode === SEARCH) {
                        this.pollUpdate(pages.search.updatePage);
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
    toggled: boolean;
    button: HTMLButtonElement;
    buttonContainer: HTMLDivElement;

    constructor(onClick: EventListener, toggled: boolean) {
        this.toggled = toggled;

        this.button = document.createElement("button");
        this.button.className = "UBO-wl-btn";
        this.button.addEventListener("click", onClick);

        this.buttonContainer = document.createElement("div");
        this.buttonContainer.className = "UBO-wl-container";
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
    constructor(onClick: EventListener, toggled: boolean) {
        super(onClick, toggled);
        this.button.className += " UBO-wl-poly " + (toggled ? " yt-uix-button-toggled" : "");
        this.button.innerHTML = "ADS";
        this.buttonContainer.appendChild(this.button);
    }
    exists() {
        return !!this.buttonContainer.parentElement;
    }
    render() {
        return this.buttonContainer;
    }
}

class WhitelistButtonBasic extends WhitelistButton {
    constructor(onClick: EventListener, toggled: boolean) {
        super(onClick, toggled);
        this.button.className += " UBO-old yt-uix-button yt-uix-button-size-default yt-uix-button-subscribed-branded hover-enabled" + (toggled ? " yt-uix-button-toggled" : "");
        this.button.innerHTML = "Ads";
    }
    exists() {
        return document.body.contains(this.button);
    }
    render() {
        return this.button;
    }
}

class AdOptions {
    unMuteIcon: Element;
    muteIcon: Element;
    muteButton: MenuItem;
    skipButton: MenuItem;
    blacklistButton: MenuItem;
    menu: HTMLDivElement;
    optionsButton: HTMLButtonElement;
    tooltip: HTMLSpanElement;

    buttonFocused: boolean;
    menuFocused: boolean;
    menuOpen: boolean;
    muted: boolean;

    constructor(onBlacklist: EventListener, onMute: EventListener, onSkip: () => {}) {
        this.toggleMenu = this.toggleMenu.bind(this);
        this.lostFocus = this.lostFocus.bind(this);

        this.unMuteIcon = this.generateIcon("M215.03 71.05L126.06 160H24c-13.26 0-24 10.74-24 24v144c0 13.25 10.74 24 24 24h102.06l88.97 88.95c15.03 15.03 40.97 4.47 40.97-16.97V88.02c0-21.46-25.96-31.98-40.97-16.97zm233.32-51.08c-11.17-7.33-26.18-4.24-33.51 6.95-7.34 11.17-4.22 26.18 6.95 33.51 66.27 43.49 105.82 116.6 105.82 195.58 0 78.98-39.55 152.09-105.82 195.58-11.17 7.32-14.29 22.34-6.95 33.5 7.04 10.71 21.93 14.56 33.51 6.95C528.27 439.58 576 351.33 576 256S528.27 72.43 448.35 19.97zM480 256c0-63.53-32.06-121.94-85.77-156.24-11.19-7.14-26.03-3.82-33.12 7.46s-3.78 26.21 7.41 33.36C408.27 165.97 432 209.11 432 256s-23.73 90.03-63.48 115.42c-11.19 7.14-14.5 22.07-7.41 33.36 6.51 10.36 21.12 15.14 33.12 7.46C447.94 377.94 480 319.54 480 256zm-141.77-76.87c-11.58-6.33-26.19-2.16-32.61 9.45-6.39 11.61-2.16 26.2 9.45 32.61C327.98 228.28 336 241.63 336 256c0 14.38-8.02 27.72-20.92 34.81-11.61 6.41-15.84 21-9.45 32.61 6.43 11.66 21.05 15.8 32.61 9.45 28.23-15.55 45.77-45 45.77-76.88s-17.54-61.32-45.78-76.86z");
        this.muteIcon = this.generateIcon("M633.82 458.1l-69-53.33C592.42 360.8 608 309.68 608 256c0-95.33-47.73-183.58-127.65-236.03-11.17-7.33-26.18-4.24-33.51 6.95-7.34 11.17-4.22 26.18 6.95 33.51 66.27 43.49 105.82 116.6 105.82 195.58 0 42.78-11.96 83.59-33.22 119.06l-38.12-29.46C503.49 318.68 512 288.06 512 256c0-63.09-32.06-122.09-85.77-156.16-11.19-7.09-26.03-3.8-33.12 7.41-7.09 11.2-3.78 26.03 7.41 33.13C440.27 165.59 464 209.44 464 256c0 21.21-5.03 41.57-14.2 59.88l-39.56-30.58c3.38-9.35 5.76-19.07 5.76-29.3 0-31.88-17.53-61.33-45.77-76.88-11.58-6.33-26.19-2.16-32.61 9.45-6.39 11.61-2.16 26.2 9.45 32.61 11.76 6.46 19.12 18.18 20.4 31.06L288 190.82V88.02c0-21.46-25.96-31.98-40.97-16.97l-49.71 49.7L45.47 3.37C38.49-2.05 28.43-.8 23.01 6.18L3.37 31.45C-2.05 38.42-.8 48.47 6.18 53.9l588.36 454.73c6.98 5.43 17.03 4.17 22.46-2.81l19.64-25.27c5.41-6.97 4.16-17.02-2.82-22.45zM32 184v144c0 13.25 10.74 24 24 24h102.06l88.97 88.95c15.03 15.03 40.97 4.47 40.97-16.97V352.6L43.76 163.84C36.86 168.05 32 175.32 32 184z")
        this.muteButton = this.generateMenuItem(
            "Mute advertiser",
            "Automatically mute all ads from this advertiser",
            this.muteIcon,
            onMute
        )

        this.skipButton = this.generateMenuItem(
            "Force skip",
            "Attempt to skip this ad",
            "M512 76v360c0 6.6-5.4 12-12 12h-40c-6.6 0-12-5.4-12-12V284.1L276.5 440.6c-20.6 17.2-52.5 2.8-52.5-24.6V284.1L52.5 440.6C31.9 457.8 0 443.4 0 416V96c0-27.4 31.9-41.7 52.5-24.6L224 226.8V96c0-27.4 31.9-41.7 52.5-24.6L448 226.8V76c0-6.6 5.4-12 12-12h40c6.6 0 12 5.4 12 12z",
            () => {
                this.closeMenu();
                onSkip()
            }
        )
        this.blacklistButton = this.generateMenuItem(
            "Block advertiser",
            "Block all ads from this advertiser",
            "M256 8C119.033 8 8 119.033 8 256s111.033 248 248 248 248-111.033 248-248S392.967 8 256 8zm141.421 106.579c73.176 73.175 77.05 187.301 15.964 264.865L132.556 98.615c77.588-61.105 191.709-57.193 264.865 15.964zM114.579 397.421c-73.176-73.175-77.05-187.301-15.964-264.865l280.829 280.829c-77.588 61.105-191.709 57.193-264.865-15.964z",
            onBlacklist
        );

        this.menu = (() => {
            let el = document.createElement("div");
            el.setAttribute("class", "UBO-menu hidden");
            el.appendChild(this.blacklistButton);
            el.appendChild(this.muteButton);
            el.appendChild(this.skipButton);
            el.addEventListener("focusin", () => this.menuFocused = true);
            el.addEventListener("focusout", () => {
                this.menuFocused = false;
                this.lostFocus();
            });
            return el;
        })();

        ;

        this.optionsButton = (() => {
            let el = document.createElement("button");
            el.setAttribute("class", "UBO-ads-btn ytp-button hidden");

            el.appendChild(this.tooltip = (() => {
                let el = document.createElement("span");
                el.setAttribute("class", "UBO-ads-tooltip");
                return el;
            })());

            el.appendChild((() => {
                let el = document.createElement("div");
                el.setAttribute("class", "UBO-icon-container");
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
                this.lostFocus();
            });
            return el;
        })();

        this.menuOpen = false;
        this.menuFocused = false;
        this.buttonFocused = false;
        this.muted = false;
        this.reset();
    }

    generateMenuItem(text: string, description: string, iconVector: string | Element, onClick: EventListener): MenuItem {
        const defaultIcon = iconVector instanceof Element ? iconVector : this.generateIcon(iconVector);

        let el: MenuItem = document.createElement("button") as MenuItem;
        let currentIcon = defaultIcon;
        let itemText = document.createTextNode(text);
        let tooltipText = document.createTextNode(description);

        el.setAttribute("class", "UBO-menu-item");
        el.appendChild(currentIcon);
        el.appendChild(itemText);
        el.appendChild((() => {
            let el = document.createElement("span");
            el.setAttribute("class", "UBO-ads-tooltip");
            el.appendChild(tooltipText);
            return el;
        })())

        el.setIcon = newIcon => {
            el.replaceChild(newIcon, currentIcon);
            currentIcon = newIcon;
        }
        el.setText = newText => {
            itemText.data = newText;
        }
        el.setDescription = newDescription => {
            tooltipText.data = newDescription;
        }
        el.setDefaults = () => {
            el.setIcon(defaultIcon);
            el.setText(text);
            el.setDescription(description);
        }
        el.addEventListener("click", onClick);
        return el;
    }

    generateIcon(iconVector: string): Element {
        return (() => {
            let el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            el.setAttribute("viewBox", "0 0 512 512");
            el.setAttribute("class", "UBO-icon");
            el.appendChild((() => {
                let el = document.createElementNS("http://www.w3.org/2000/svg", "path");
                el.setAttributeNS(null, "fill", "currentColor");
                el.setAttributeNS(null, "d", iconVector);
                return el;
            })());
            return el;
        })()
    }

    set muteTab(state: boolean) {
        state = !!state;
        if (state === this.muted) return;

        this.muted = state;

        if (state) {
            agent.send("mute", { mute: true });
            this.muteButton.setIcon(this.unMuteIcon);
            this.muteButton.setText("Unmute advertiser");
            this.muteButton.setDescription("Remove advertiser from mutelist");
        } else {
            agent.send("mute", { mute: false });
            this.muteButton.setDefaults();
        }
    }

    set muteOption(enabled: boolean) {
        this.muteButton.disabled = !enabled;
    }

    set blacklistOption(enabled: boolean) {
        this.blacklistButton.disabled = !enabled;
    }

    set skipOption(enabled: boolean) {
        this.skipButton.disabled = !enabled;
    }

    set advertiserName(title: string) {
        this.tooltip.textContent = `Manage ads from "${title}"`;
    }

    reset() {
        this.tooltip.textContent = "Options for this advertiser";
        this.blacklistOption = false;
        this.muteOption = false;
        this.skipOption = false;
    }

    toggleMenu() {
        if (this.menuOpen) {
            this.closeMenu();
        } else {
            this.openMenu();
        }
    }

    lostFocus() {
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
    dataNode: HTMLElement;
    buttonParent: HTMLElement;
    whitelistButton: WhitelistButtonInstance;
    adOptions: AdOptions;
    channelId?: Channel;
    currentAd: Ad;
    currentDuration: string;
    firstRun: boolean;
    adPlaying: boolean;
    adConfirmed: boolean;
    awaitingSkip: boolean;
    skipButton: HTMLButtonElement;
    currentPlayer: HTMLVideoElement;

    constructor(ButtonFactory: WhitelistButtonFactory) {
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
        this.awaitingSkip = false;
        this.skipButton = null;
        this.currentPlayer = null;
        console.log(this);
    }

    updatePage(forceUpdate?: boolean, verify?: boolean) {
        if (!this.dataNode && !this.setDataNode()) return;// console.error("Container not available");

        this.channelId = this.getChannelId(this.dataNode);
        if (!this.channelId) throw "Channel ID not available";

        let whitelisted = pages.updateURL(this.channelId, verify);

        whitelisted ? this.whitelistButton.on() : this.whitelistButton.off();

        if (!this.whitelistButton.exists()) {
            this.insertButton(this.whitelistButton);
            // if whitelistButton doesn't exist, is there a chance that AdOptions doesn't exist either?
            if (this.firstRun) {
                let player = document.querySelector("#movie_player") as HTMLElement;

                if (player) {
                    this.updateAdPlaying(player, !!player.classList.contains("ad-showing"), true);
                }

                this.firstRun = false;
            }
        }

        this.updateAdButton();
        this.updateVideos(whitelisted, forceUpdate);
    }

    updateAdPlaying(player: HTMLElement, playing: boolean, firstRun = false) {
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
            if (this.currentPlayer = player.querySelector("video")) {
                this.adOptions.skipOption = true;
                this.adOptions.show();
            }

            if (firstRun) {
                let duration = player.querySelector(".ytp-time-duration");
                this.currentDuration = (duration && duration.textContent) || "";

                agent.send("recent-ad").then(message => {
                    if (message.error) return;
                    this.currentAd = message.ad as Ad;
                    this.updateAdButton();
                })
            }

            this.adPlaying = true;
        } else if (!playing && this.adPlaying) {
            this.adOptions.muteTab = false;
            this.adOptions.hide();
            this.adOptions.reset();
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
    updateAdInformation(ad: any) {
        this.currentAd = ad;
        this.updateAdButton(true);
    }

    updateAdButton(forceUpdate = false) {
        if ((forceUpdate || !this.adConfirmed) && this.adPlaying && this.currentAd && this.withinSpec(this.currentDuration, this.currentAd.length_seconds)) {
            this.adConfirmed = true;
            this.adOptions.muteOption = true;
            this.adOptions.blacklistOption = true;
            this.adOptions.advertiserName = this.currentAd.channelId.display;
            this.adOptions.show();
        }

        if (this.adConfirmed) {
            const inMutelist = ChannelID.inmutelist(this.currentAd.channelId) !== -1;
            const muteAll = !!settings.muteAll;

            // if muteAll && inmute should be false
            // if muteAll && !inmute should be true
            // if !muteAll && inmute should be true
            // if !muteAll && !inmute should be false
            // All of these conditions are met with muteAll !== inmute

            this.adOptions.muteTab = muteAll !== inMutelist;
        }
    }
    attemptSkip() {
        if (!this.currentPlayer) return;

        if (this.skipButton) {
            return this.skipButton.click();
        }
        this.adOptions.muteTab = true;
        this.awaitingSkip = true;
        this.currentPlayer.currentTime = this.currentPlayer.duration - 1;
        this.currentPlayer.playbackRate = 5;
    }
    skipButtonAvailable(skipButton: HTMLElement) {
        this.skipButton = skipButton as HTMLButtonElement;

        if (this.awaitingSkip) {
            this.skipButton.click();
        }
    }
    updateDuration(duration: string) {
        this.currentDuration = duration;
        this.updateAdButton()
    }

    withinSpec(durationText: string, target: number) {
        let duration = this.toSeconds(durationText);

        if (!duration) {
            return false;
        } else {
            return Math.abs(duration - target) < 2;
        }
    }

    toSeconds(durationText: string): number {
        if (typeof durationText !== "string") return;

        let durationParts = durationText.split(":");
        let seconds = 0, level = durationParts.length;

        for (let i = 0; i < durationParts.length; i++) {
            seconds += ~~durationParts[i] * Math.pow(60, --level);
        }

        return seconds;
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
    setDataNode(/* override */node?: HTMLElement) { return node }
    insertButton(/* override */button: WhitelistButtonInstance) { }
    updateVideos(/* override */whitelisted: boolean, forceUpdate: boolean) { }
    getChannelId(/* override */node: HTMLElement): Channel { return ChannelID.createNew(); }

}

class VideoPagePoly extends SingleChannelPage {
    constructor() {
        super(WhitelistButtonPoly);
        this.toggleWhitelist = this.toggleWhitelist.bind(this);
        this.updatePage = this.updatePage.bind(this);
        this.updateVideos = this.updateVideos.bind(this);
    }

    setDataNode(container: HTMLElement) {
        return this.dataNode = container || this.dataNode || document.querySelector("ytd-video-owner-renderer");
    }

    setParentNode(parent: HTMLElement) {
        return this.buttonParent = parent || this.buttonParent;
    }
    insertButton(button: WhitelistButtonInstance) {
        this.setParentNode(this.dataNode.parentNode as HTMLElement);

        if (this.dataNode.nextSibling) {
            this.buttonParent.insertBefore(button.render(), this.dataNode.nextSibling);
        } else {
            this.buttonParent.appendChild(button.render());
        }
    }
    updateVideos(whitelisted: boolean, forceUpdate: boolean) {
        this.updateInfobar(this.dataNode, whitelisted);
        let relatedVideos = document.querySelectorAll("ytd-compact-video-renderer,ytd-playlist-panel-video-renderer") as NodeListOf<VideoPoly>;

        pages.updateVideos(relatedVideos, forceUpdate)
    }

    updateInfobar(container: HTMLElement, whitelisted: boolean, channelId = this.channelId) {
        container = this.setDataNode(container);
        if (!container) return false;
        if (!channelId) return false;

        let links = container.querySelectorAll("a") as NodeListOf<InfoLink>;

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

    getChannelId(container: HTMLElement) {
        let channelId = ChannelID.createNew();
        container = this.setDataNode(container);

        if (!container) return null;

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
    setDataNode(container: HTMLElement) {
        return this.dataNode = container || this.dataNode || document.querySelector("#watch7-user-header");
    }
    setParentNode(parent?: HTMLElement) {
        if (parent) {
            return this.buttonParent = parent;
        } else {
            if (!this.buttonParent || this.buttonParent && this.dataNode && this.buttonParent.parentElement !== this.dataNode) {
                if (this.dataNode) {
                    return this.buttonParent = this.dataNode.querySelector("#watch7-subscription-container")
                } else {
                    return this.buttonParent = document.querySelector("#watch7-subscription-container");
                }
            } else {
                return this.buttonParent;
            }
        }
    }
    insertButton(button: WhitelistButtonInstance) {
        this.setParentNode();

        if (this.buttonParent.nextSibling) {
            this.buttonParent.parentNode.insertBefore(button.render(), this.buttonParent.nextSibling);
        } else {
            this.buttonParent.parentNode.appendChild(button.render());
        }
    }
    updateVideos(whitelisted: boolean, forceUpdate: boolean) {
        this.updateInfobar(this.dataNode, whitelisted);
        pages.updateRelatedBasic(forceUpdate);
    }
    updateInfobar(container: HTMLElement, whitelisted: boolean, channelId = this.channelId) {

    }
    getChannelId(container: HTMLElement) {
        this.setDataNode(container);

        let links = this.dataNode.querySelectorAll("a") as ArrayLike<any>;
        return ChannelID.validate(ChannelID.extractFromLinks(links as Array<any>));
    }
}

class ChannelPagePoly extends SingleChannelPage {
    constructor() {
        super(WhitelistButtonPoly);

        this.toggleWhitelist = this.toggleWhitelist.bind(this);
        this.updatePage = this.updatePage.bind(this);
        this.updateVideos = this.updateVideos.bind(this);
    }

    setDataNode(container: HTMLElement) {
        // ytd-page-manager contains data at .data.response.metadata
        // whereas ytd-browse contains data at .data.metadata
        return this.dataNode = container || this.dataNode || document.querySelector("ytd-page-manager");//"ytd-browse");
    }

    setParentNode(parent?: HTMLElement) {
        return this.buttonParent = parent || this.buttonParent || document.querySelector("#edit-buttons");
    }
    insertButton(button: WhitelistButtonInstance) {
        this.setParentNode();
        this.buttonParent.appendChild(button.render());
    }

    updateVideos(whitelisted: boolean, forceUpdate: boolean) {
        pages.updateAllVideos(forceUpdate, this.channelId);
    }

    getChannelId(container: HTMLElement) {
        let channelId = ChannelID.createNew();
        container = this.setDataNode(container);
        if (!container) return null;

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
    setDataNode(node?: HTMLElement) {
        return node;
    }

    setParentNode(parent?: HTMLElement) {
        return this.buttonParent = parent || this.buttonParent || document.querySelector(".primary-header-actions");
    }
    insertButton(button: WhitelistButtonBasic) {
        this.setParentNode();
        this.buttonParent.appendChild(button.render());
    }

    updateVideos(whitelisted: boolean, forceUpdate: boolean) {
        pages.updateAllVideosBasic(whitelisted, forceUpdate);
    }
    getChannelId() {
        let links = [location as any] as Array<any>
        let link = document.querySelector("link[rel='canonical']") as any

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
    updatePage(forceUpdate?: boolean) {
        let channelElements: NodeListOf<ChannelElement> = document.querySelectorAll("ytd-channel-renderer");

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
    toggleWhitelist(dataNode: HTMLElement) {
        let channelId = this.getChannelId(dataNode);
        if (!channelId) throw "Channel ID not available";

        if (ChannelID.inwhitelist(channelId) !== -1) {
            ChannelID.whitelistRemove(channelId);
        } else {
            ChannelID.whitelistAdd(channelId);
        }
    }
    getChannelId(container: HTMLElement) {
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
        this.updatePage = this.updatePage.bind(this);
    }
    updatePage(forceUpdate: boolean) {

    }
}
class ChannelID {
    static createNew(): Channel {
        return { id: "", username: "", display: "" };
    }
    static getUsernameFromURL(url: string): string {
        if (!url) return "";

        let matches = url.match(/\/user\/(.+)/);

        if (matches && matches.length > 1) {
            return matches[1];
        } else {
            return "";
        }
    }
    static whitelistRemove(channelId: Channel) {
        return agent.send("set-settings", { channelId: channelId, type: "remove-white" });
    }
    static whitelistAdd(channelId: Channel) {
        return agent.send("set-settings", { channelId: channelId, type: "add-white" });
    }
    static inmutelist(search: Channel | string, idOnly = false) {
        return ChannelID.searchlist(settings.muted, search, idOnly);
    }

    static inwhitelist(search: Channel | string, idOnly = false) {
        return ChannelID.searchlist(settings.whitelisted, search, idOnly)
    }

    static searchlist(object: ChannelList, channelId: Channel | string, idOnly?: boolean) {
        if (!channelId) return;

        let id: string, username: string;

        if (idOnly) {
            id = channelId as string;
            username = "";
        } else {
            id = (channelId as Channel).id;
            username = (channelId as Channel).username;
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

    static validate(channelId: Channel): Channel {
        if (channelId && (channelId.id || channelId.username))
            return channelId;
        else
            return null;
    }

    static extractFromLinks(links: Array<any>): Channel {
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
    video: VideoPagePoly | VideoPageBasic;
    channel: ChannelPagePoly | ChannelPageBasic;
    search: SearchPagePoly | SearchPageBasic;
    currentURL: string;
    mode: number;

    constructor(design: Design) {
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
        if ((window as any).Polymer || document.querySelector("ytd-app")) {
            return LPOLY;
        } else {
            return LBASIC;
        }
    }
    getMode(): Mode {
        let newURL = location.href;

        if (newURL !== this.currentURL) {
            this.currentURL = newURL;
            return this.mode = this.determineMode(newURL);
        } else {
            return this.mode;
        }
    }
    determineMode(url = location.href): Mode {
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

    update(forceUpdate?: boolean, verify?: boolean) {
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

    updateAd(ad: any, mode = this.getMode()) {
        if (mode === VIDEO) {
            this.video.updateAdInformation(ad);
        } else if (mode === CHANNEL) {
            this.channel.updateAdInformation(ad);
        }
    }
    updateVideos(videos: NodeListOf<VideoPoly>, forceUpdate?: boolean, channelId?: Channel) {
        for (let video of videos) {
            if (!forceUpdate && video.data.processed) continue;

            let id = oGet(video, "data.shortBylineText.runs[0].navigationEndpoint.browseEndpoint.browseId") ||
                (channelId && channelId.id);

            if (id) {
                let links = video.querySelectorAll("a[href^='/watch?']") as NodeListOf<HTMLAnchorElement>;
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
    updateAllVideos(forceUpdate?: boolean, channelId?: Channel) {
        const query = "ytd-grid-video-renderer,ytd-video-renderer,ytd-playlist-video-renderer";
        const videos = document.querySelectorAll(query) as NodeListOf<VideoPoly>;

        return this.updateVideos(videos, forceUpdate, channelId);
    }

    updateAllVideosBasic(whitelisted: boolean, forceUpdate = false) {
        let videos: NodeListOf<VideoBasic> = document.querySelectorAll(".yt-lockup-video");

        for (let vid of videos) {
            if (!forceUpdate && vid.processed) continue;
            let inwhite;

            if (whitelisted !== null) {
                inwhite = whitelisted;
            } else {
                let user = vid.querySelector(".stat.attribution span");
                let values = ChannelID.createNew();

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
    updateRelatedBasic(forceUpdate: boolean) {
        let videos: NodeListOf<VideoBasic> = document.querySelectorAll(".video-list-item");

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
    updateURL(channelId: Channel, verify: boolean) {
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

    reflectURLFlag(url: string, shouldContain: boolean): string {
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

    confirmDisabled(): void {
        setTimeout(() =>
            fetch("https://www.youtube.com/favicon.ico?ads=true").catch(() =>
                prompt("Ads may still be blocked, make sure you've added the following rule to your uBlock Origin whitelist", "*youtube.com/*&disableadblock=1")
            )
            , 300);
    }
}



function oGet(object: any, keyString: string) {
    // Access deeply nested objects without throwing errors
    // For example object obj = { toplevel : { middlelevel: { bottomlevel: "test" } } }
    // oGet(obj, "toplevel.middlelevel.bottomlevel")
    // yields "test", or undefined if no such property exists
    const props = keyString.split(/[\[\]\.]+/);
    let current = object;

    for (let prop of props) {
        if (prop.length === 0) continue;
        if (current[prop] !== undefined) current = current[prop];
        else return // console.log("Failed at", level);            
    }

    return current;
}

class LoadHastener {
    // This class helps us process the page 82% sooner than waiting for DOMContentLoaded
    // By watching HTML elements as they are first added, we can determine what design was
    // used sooner and can begin processing the page after 600 ms, as opposed to the
    // 3500 ms it can take to wait for DOMContentLoaded.
    watcher: MutationObserver;
    designConfirmed: (design: Design) => void;

    constructor() {
        this.watcher = new MutationObserver(mutations => {
            for (let mutation of mutations) {
                if (mutation.type === "childList") {
                    for (let node of mutation.addedNodes) {
                        if (node.nodeName === "BODY") {
                            return this.switchToBody();
                        } else if (node.nodeName === "SCRIPT") {
                            if ((node as HTMLScriptElement).src.indexOf("polymer.js") !== -1) {
                                return this.confirmDesign(LPOLY);
                            }
                        } else if ((node as Element).localName === "ytd-app") {
                            return this.confirmDesign(LPOLY);
                        }
                    }
                }
            }
        });
        this.designConfirmed = null;
        this.contentLoaded = this.contentLoaded.bind(this)
    }

    getDesign(): Promise<Design> {
        if (document.readyState === "complete" || document.readyState === "interactive") {
            return Promise.resolve(Page.getDesign());
        } else {
            return new Promise(resolve => {
                this.designConfirmed = resolve;
                this.watcher.observe(document.body || document.documentElement, { childList: true });
                document.addEventListener("DOMContentLoaded", this.contentLoaded);
            })
        }
    }
    confirmDesign(design: Design): void {
        this.watcher.disconnect();
        document.removeEventListener("DOMContentLoaded", this.contentLoaded)
        this.designConfirmed(design);
    }

    contentLoaded() {
        this.confirmDesign(Page.getDesign());
    }
    switchToBody() {
        this.watcher.disconnect();
        this.watcher.observe(document.body, { childList: true });
    }

}

function init(design: Design) {
    pages = new Page(design || Page.getDesign());
    watcher = new MutationWatcher();
    pages.update(true);
    watcher.start();

    agent.on("settings-update", (updated: any) => {
        settings = updated.settings;
        pages.update(true, updated.initiator)
    }).on("ad-update", (ad: any) => {
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
        let nodes = document.querySelectorAll(".UBO-ads-btn,.UBO-wl-btn,.UBO-wl-container,.UBO-menu");

        for (let node of nodes) {
            node.remove();
        }
    }
}
// MAIN ENTRY POINT
agent = new MessageAgent();
agent.send("get-settings").then(response => {
    settings = response.settings;
    accessURLs = response.accessURLs;

    let load = new LoadHastener();
    load.getDesign().then(design => init(design));
});