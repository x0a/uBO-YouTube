'use strict';
import MessageAgent from './agent';
import icons from './icons';

import {
    Channel, Settings, AccessURL,
    Action, MutationElement, ChannelList,
    MenuItem, InfoLink, VideoPoly, VideoBasic, Ad
} from './typings';

const enum Layout {
    Polymer,
    Basic
}
const enum PageType {
    Video,
    Channel,
    Search,
    Any
}

type WhitelistButtonInstance = WhitelistButtonBasic | WhitelistButtonPoly;
type WhitelistButtonFactory = typeof WhitelistButtonBasic | typeof WhitelistButtonPoly;

interface ChannelElement extends HTMLDivElement {
    whitelistButton: WhitelistButtonPoly;
}

/* ---------------------------- */

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
            attributeFilter: ['hidden', 'href', 'style'],
            attributeOldValue: true
        });
    }

    isPlayerUpdate(mutation: MutationElement): HTMLElement {
        if (mutation.target.id === 'movie_player') {
            return mutation.target;
        } else if (mutation.target.id === 'player-container' && mutation.addedNodes.length) {
            for (let node of mutation.addedNodes) {
                if (node.id === 'movie_player') {
                    return node as HTMLElement;
                }
            }
        }
    }
    isPlayerErrorChange(mutation: MutationElement): null | boolean {
        for (const node of mutation.addedNodes)
            if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('ytp-error'))
                return true;
        for (const node of mutation.removedNodes)
            if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('ytp-error'))
                return false;
        return null;
    }
    isPlayerDurationUpdate(mutation: MutationElement) {
        return mutation.target.className === 'ytp-time-duration'
            && mutation.addedNodes.length;
    }

    isPolyUserInfo(mutation: MutationElement): HTMLElement {
        if (
            (
                mutation.target.id === 'owner-name'
                && mutation.addedNodes.length
            ) || (
                mutation.type === 'attributes'
                && mutation.target.parentNode
                && (mutation.target.parentNode as HTMLElement).id === 'owner-name'
                && mutation.attributeName === 'href'
            )
        ) {
            return mutation.target.closest('ytd-video-owner-renderer') as HTMLElement;
        } else {
            return null;
        }
    }

    isBasicUserInfo(mutation: MutationElement): HTMLElement {
        if (mutation.target.id === 'watch7-container' && mutation.addedNodes.length) {
            for (let node of mutation.addedNodes) {
                if (node.id === 'watch7-main-container') {
                    return node.querySelector('#watch7-user-header') as HTMLElement;
                }
            }
        } else if (mutation.target.id === 'watch7-user-header') {
            return mutation.target as HTMLElement;
        }

        return null;
    }

    isRelatedUpdate(mutation: MutationElement) {
        return (
            mutation.type === 'attributes'
            && mutation.target.id === 'continuations'
            && mutation.attributeName === 'hidden'
        );
    }

    hasNewItems(mutation: MutationElement) {
        return (
            mutation.type === 'attributes'
            && mutation.target.localName === 'yt-page-navigation-progress'
            && mutation.attributeName === 'hidden'
            && mutation.oldValue === null
        ) || (
                mutation.type === 'childList'
                && (mutation.target.id === 'items' || mutation.target.id === 'contents')
            )
    }

    finishedLoadingBasic(mutation: MutationElement): boolean {
        for (let node of mutation.removedNodes) {
            if (node.id === 'progress') {
                return true; // old layout, progress bar removed
            }
        }
        return false;
    }

    isOverlayAd(mutation: MutationElement): HTMLButtonElement {
        return mutation.type === 'childList'
            && mutation.target.classList.contains('ytp-ad-module')
            && mutation.addedNodes.length
            && mutation.target.querySelector('button.ytp-ad-overlay-close-button')
    }

    isAdSkipContainer(mutation: MutationElement): HTMLElement {
        return (
            mutation.target.classList.contains('ytp-ad-skip-button-container')
            && mutation.target
        ) || (
                mutation.type === 'childList'
                && mutation.target.classList.contains('video-ads')
                && mutation.addedNodes.length
                && mutation.target.querySelector('.ytp-ad-skip-button-container')
            );
    }

    adSkipButton(container: HTMLElement): HTMLButtonElement {
        return container.style.display !== 'none'
            && container.querySelector('button');
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
    //** For debugging: Helps identify where/when element was added, removed, or changed */
    findInjection(mutation: MutationRecord, selector: string) {
        const target = mutation.target as HTMLElement;
        if (target.matches(selector)) {
            if (mutation.type === 'attributes') {
                console.log(
                    `%c[${selector}].${mutation.attributeName}` +
                    ` = %c"${mutation.oldValue}"` +
                    ` -> %c"${target.getAttribute(mutation.attributeName || "")}"`,
                    'font-weight: bold',
                    'font-weight: normal; color: red;',
                    'color: green;'
                );
            }
            else {
                console.log(`%c[${selector}] >`, 'font-weight: bold;', mutation);
            }
        }
        else if (mutation.type === 'childList') {
            for (let node of mutation.addedNodes as NodeListOf<HTMLElement>) {
                if (node.nodeType !== Node.ELEMENT_NODE)
                    continue;
                if (node.matches(selector)) {
                    console.log(
                        `<${this.getSelector(target)}>.addedNodes = [...,` +
                        `%c<${selector}>%c, ...]`, 'color: green;', mutation
                    );
                }
                else if (node.querySelector(selector)) {
                    console.log(
                        `<${this.getSelector(target)}>.addedNodes = [...,` +
                        `%c<${this.getSelector(node)}>%c.querySelector("%c${selector}"%c),...]`,
                        'color: green;',
                        '',
                        'color: green; font-weight: bold;',
                        mutation
                    );
                }
            }
            for (let node of mutation.removedNodes as NodeListOf<HTMLElement>) {
                if (node.nodeType !== Node.ELEMENT_NODE)
                    continue;
                if (node.matches(selector)) {
                    console.log(
                        `<${this.getSelector(target)}>.removedNodes = [..., <%c${selector}%c>, ...]`,
                        'color: red',
                        ''
                    );
                }
                else if (node.querySelector(selector)) {
                    console.log(
                        `<${this.getSelector(target)}>.removedNodes = [..., ` +
                        `%c<${this.getSelector(node)}>.querySelector("${selector}"), ...] `,
                        'color: red'
                    );
                }
            }
        }
    }
    getSelector(el: HTMLElement) {
        const classes = Array.from(el.classList);
        return el.tagName.toLowerCase()
            + (classes.length ? '.' + classes.join('.') : '')
            + (el.id.length ? '#' + el.id : '')
    }
    onMutation(mutations: Array<MutationElement>) {
        let mode = pages.getMode();

        for (let mutation of mutations) {
            //this.findInjection(mutation, '.ytp-error');
            if (mode === PageType.Video) {
                let player, userInfo, skipContainer, overlaySkipButton: HTMLButtonElement;

                if (userInfo = this.isPolyUserInfo(mutation)) {
                    pages.video.setDataNode(userInfo)
                    pages.video.updatePage();
                } else if (userInfo = this.isBasicUserInfo(mutation)) {
                    pages.video.setDataNode(userInfo)
                    pages.video.updatePage();
                } else if (this.isRelatedUpdate(mutation)) {
                    this.pollUpdate(pages.video.updateVideos);
                } else if (player = this.isPlayerUpdate(mutation)) {
                    pages.video.updateAdPlaying(player, !!player.classList.contains('ad-showing'));
                    let errorState = this.isPlayerErrorChange(mutation);
                    if (errorState !== null) {
                        pages.video.onVideoError(errorState);
                    }
                } else if (this.isPlayerDurationUpdate(mutation)) {
                    pages.video.durationUpdate(mutation.target.textContent);
                } else if (skipContainer = this.isAdSkipContainer(mutation)) {
                    pages.video.skipButtonUpdate(this.adSkipButton(skipContainer));
                } else if (overlaySkipButton = this.isOverlayAd(mutation)) {
                    overlaySkipButton.click();
                }
            } else {
                if (mode === PageType.Channel) {
                    let player, skipContainer;
                    if (player = this.isPlayerUpdate(mutation)) {
                        pages.channel.updateAdPlaying(player, !!player.classList.contains('ad-showing'));
                        let errorState = this.isPlayerErrorChange(mutation);
                        if (errorState !== null) {
                            pages.channel.onVideoError(errorState);
                        }
                    } else if (this.isPlayerDurationUpdate(mutation)) {
                        pages.channel.durationUpdate(mutation.target.textContent);
                    } else if (skipContainer = this.isAdSkipContainer(mutation)) {
                        pages.channel.skipButtonUpdate(this.adSkipButton(skipContainer));
                    }
                }
                if (this.hasNewItems(mutation) || this.finishedLoadingBasic(mutation)) { // new items in videolist
                    if (mode === PageType.Channel) {
                        this.pollUpdate(pages.channel.updatePage);
                    } else if (mode === PageType.Search) {
                        this.pollUpdate(pages.search.updatePage);
                    } else if (mode === PageType.Any) {
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

        this.button = document.createElement('button');
        this.button.className = 'UBO-wl-btn';
        this.button.title = 'Enable ads for this channel';
        this.button.addEventListener('click', onClick);

        this.buttonContainer = document.createElement('div');
        this.buttonContainer.className = 'UBO-wl-container';
    }

    off() {
        if (!this.toggled) return;

        this.toggled = false;
        this.button.title = 'Enable ads for this channel';
        this.button.classList.remove('yt-uix-button-toggled');
    }

    on() {
        if (this.toggled) return;

        this.toggled = true;
        this.button.title = 'Ads enabled for this channel';
        this.button.classList.add('yt-uix-button-toggled');
    }


}

class WhitelistButtonPoly extends WhitelistButton {
    constructor(onClick: EventListener, toggled: boolean) {
        super(onClick, toggled);
        this.button.className += ' UBO-wl-poly ' + (toggled ? ' yt-uix-button-toggled' : '');
        this.button.innerHTML = 'ADS';
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
        this.button.className += ' UBO-old yt-uix-button yt-uix-button-size-default yt-uix-button-subscribed-branded hover-enabled' + (toggled ? ' yt-uix-button-toggled' : '');
        this.button.innerHTML = 'Ads';
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
        this.unMuteIcon = this.generateIcon(icons.unMute);
        this.muteIcon = this.generateIcon(icons.mute)
        this.muteButton = this.generateMenuItem(
            'Mute advertiser',
            'Automatically mute all ads from this advertiser',
            this.muteIcon,
            onMute
        )

        this.skipButton = this.generateMenuItem(
            'Force skip',
            'Attempt to skip this ad',
            icons.fastForward,
            () => {
                this.closeMenu();
                onSkip()
            }
        )
        this.blacklistButton = this.generateMenuItem(
            'Block advertiser',
            'Block all ads from this advertiser',
            icons.block,
            onBlacklist
        );

        this.menu = (() => {
            let el = document.createElement('div');
            el.setAttribute('class', 'UBO-menu hidden');
            el.appendChild(this.blacklistButton);
            el.appendChild(this.muteButton);
            el.appendChild(this.skipButton);
            el.addEventListener('focusin', () => this.menuFocused = true);
            el.addEventListener('focusout', () => {
                this.menuFocused = false;
                this.lostFocus();
            });
            return el;
        })();

        ;

        this.optionsButton = (() => {
            let el = document.createElement('button');
            el.setAttribute('class', 'UBO-ads-btn ytp-button hidden');

            el.appendChild(this.tooltip = (() => {
                let el = document.createElement('span');
                el.setAttribute('class', 'UBO-ads-tooltip');
                return el;
            })());

            el.appendChild((() => {
                let el = document.createElement('div');
                el.setAttribute('class', 'UBO-icon-container');
                el.appendChild((() => {
                    let el = document.createElement('img');
                    el.setAttribute('src', accessURLs.ICO);
                    return el;
                })());
                return el;
            })());

            el.addEventListener('click', this.toggleMenu);
            el.addEventListener('focusin', () => this.buttonFocused = true);
            el.addEventListener('focusout', () => {
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

        let el: MenuItem = document.createElement('button') as MenuItem;
        let currentIcon = defaultIcon;
        let itemText = document.createTextNode(text);
        let tooltipText = document.createTextNode(description);

        el.setAttribute('class', 'UBO-menu-item');
        el.appendChild(currentIcon);
        el.appendChild(itemText);
        el.appendChild((() => {
            let el = document.createElement('span');
            el.setAttribute('class', 'UBO-ads-tooltip');
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
        el.addEventListener('click', onClick);
        return el;
    }

    generateIcon(iconVector: string): Element {
        return (() => {
            let el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            el.setAttribute('viewBox', '0 0 512 512');
            el.setAttribute('class', 'UBO-icon');
            el.appendChild((() => {
                let el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                el.setAttributeNS(null, 'fill', 'currentColor');
                el.setAttributeNS(null, 'd', iconVector);
                return el;
            })());
            return el;
        })()
    }

    set muteTab(shouldMute: boolean) {
        if (shouldMute) {

            agent.send('mute', true)
                .then(resp => {
                    this.muted = true;
                    this.muteButton.setIcon(this.unMuteIcon);
                    this.muteButton.setText('Unmute advertiser');
                    this.muteButton.setDescription('Remove advertiser from mutelist');
                })
                .catch(error => {
                    console.error('Error muting:', error);
                });

        } else {
            const done = () => {
                this.muted = false;
                this.muteButton.setDefaults();
            }
            agent.send('mute', false).then(done).catch(done); // replicate .finally
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
        this.tooltip.textContent = 'Options for this advertiser';
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
        this.menu.classList.add('hidden');
        this.tooltip.classList.remove('hidden');
        this.menuOpen = false;
    }

    openMenu() {
        this.menu.classList.remove('hidden');
        this.tooltip.classList.add('hidden');
        this.menu.style.left = (this.optionsButton.offsetLeft - (this.menu.offsetWidth / 2) + (this.optionsButton.offsetWidth / 2)) + 'px';
        this.menu.style.bottom = '49px';
        this.menuOpen = true;
    }

    show() {
        this.optionsButton.classList.remove('hidden');
    }

    hide() {
        this.closeMenu();
        this.optionsButton.classList.add('hidden');
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
    videoError: boolean;
    skipButton: HTMLButtonElement;
    currentPlayer: HTMLVideoElement;

    constructor(ButtonFactory: WhitelistButtonFactory) {
        this.dataNode = null
        this.buttonParent = null;
        this.whitelistButton = new ButtonFactory(this.toggleWhitelist.bind(this), false);
        this.adOptions = new AdOptions(this.addBlacklist.bind(this), this.toggleMute.bind(this), this.attemptSkip.bind(this));
        this.channelId = null;
        this.currentAd = null;
        this.currentDuration = '';
        this.firstRun = true;
        this.adPlaying = false;
        this.adConfirmed = false;
        this.awaitingSkip = false;
        this.videoError = false;
        this.skipButton = null;
        this.currentPlayer = null;
        this.adOptions.muteTab = false;
        console.log(this);
    }

    updatePage(forceUpdate?: boolean, verify?: boolean) {
        if (!this.dataNode && !this.setDataNode()) return;// console.error('Container not available');

        this.channelId = this.getChannelId(this.dataNode);
        if (!this.channelId) throw 'Channel ID not available';

        let whitelisted = pages.updateURL(this.channelId, verify);

        whitelisted ? this.whitelistButton.on() : this.whitelistButton.off();

        if (!this.whitelistButton.exists()) {
            this.insertButton(this.whitelistButton);
            // if whitelistButton doesn't exist, is there a chance that AdOptions doesn't exist either?
            if (this.firstRun) {
                let player = document.querySelector('#movie_player') as HTMLElement;

                if (player) {
                    this.updateAdPlaying(player, !!player.classList.contains('ad-showing'), true);
                }

                this.firstRun = false;
            }
        }

        this.updateAdButton();
        this.updateVideos(whitelisted, forceUpdate);
    }

    updateAdPlaying(player: HTMLElement, playing: boolean, firstRun = false) {
        if (playing && !this.adPlaying) {
            let container = player.querySelector('.ytp-right-controls');
            if (!container) return console.error('Can\'t find .ytp-right-controls');

            let options = this.adOptions.renderButton();
            let menu = this.adOptions.renderMenu();

            if (!container.contains(options)) {
                container.insertBefore(options, container.firstChild);
            }
            if (!player.contains(menu)) {
                player.appendChild(menu);
            }
            if (this.currentPlayer = player.querySelector('video')) {
                this.adOptions.skipOption = true;
                this.adOptions.show();
            }
            if (firstRun) {
                let duration = player.querySelector('.ytp-time-duration');
                this.currentDuration = (duration && duration.textContent) || '';

                agent.send('recent-ad').then(message => {
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
    onVideoError(error: boolean) {
        this.videoError = error;

        if (this.videoError && this.adPlaying && this.skipButton)
            this.attemptSkip();
    }
    updateAdInformation(ad: Ad) {
        if (this.currentAd) {
            this.adConfirmed = false;
        }
        this.currentAd = ad;
        this.updateAdButton();
    }

    updateAdButton() {
        if (!this.adConfirmed && this.adPlaying && this.currentAd && this.withinSpec(this.currentDuration, this.currentAd.length_seconds)) {
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
        } else if (this.adPlaying && this.currentPlayer && settings.muteAll) {
            this.adOptions.muteTab = true;
        }
    }
    attemptSkip() {
        if (!this.currentPlayer || !this.adPlaying) return;
        if (this.skipButton) {
            return this.skipButton.click();
        }

        this.awaitingSkip = true;
        this.adOptions.muteTab = true;
        this.currentPlayer.currentTime = this.getPlaybackLimit(this.currentPlayer) - 1;
        this.currentPlayer.playbackRate = 5;
    }
    getPlaybackLimit(video: HTMLVideoElement): number {
        // const ranges = video.buffered;
        // if(ranges.length){
        //     return ranges.end(ranges.length - 1) || video.duration;
        // }

        return video.duration;
    }
    skipButtonUpdate(skipButton: HTMLElement) {
        this.skipButton = skipButton as HTMLButtonElement;

        if (this.skipButton && (this.awaitingSkip || this.videoError)) {
            this.skipButton.click();
        }
    }
    durationUpdate(duration: string) {
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
        if (typeof durationText !== 'string') return;

        let durationParts = durationText.split(':');
        let seconds = 0, level = durationParts.length;

        for (let i = 0; i < durationParts.length; i++) {
            seconds += ~~durationParts[i] * Math.pow(60, --level);
        }

        return seconds;
    }

    addBlacklist() {
        if (!this.currentAd.channelId) throw ('Channel ID not available for blacklisting');
        agent.send('set-settings', { param: this.currentAd.channelId, type: 'add-black' })
            .then(() => this.attemptSkip())
            .catch(error => console.error('Error blacklisting:', error))
    }

    toggleMute() {
        if (!this.currentAd.channelId) throw 'Ad channel ID not available for muting';
        let shouldMute = ChannelID.inmutelist(this.currentAd.channelId) === -1;
        let action = shouldMute ? 'add-mute' : 'remove-mute';

        agent.send('set-settings', { param: this.currentAd.channelId, type: action })
            .then(() => agent.send('mute', shouldMute))
            .catch(error => console.error('Error setting settings', error));
    }

    toggleWhitelist() {
        this.channelId = this.getChannelId(this.dataNode);
        if (!this.channelId) throw 'Channel ID not available';

        if (ChannelID.inwhitelist(this.channelId) !== -1) {
            agent.send('set-settings', { param: this.channelId, type: 'remove-white' });
            this.whitelistButton.off();
        } else {
            agent.send('set-settings', { param: this.channelId, type: 'add-white' });
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
        return this.dataNode = container || this.dataNode || document.querySelector('ytd-video-owner-renderer');
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
        let relatedVideos = document.querySelectorAll('ytd-compact-video-renderer,ytd-playlist-panel-video-renderer') as NodeListOf<VideoPoly>;

        pages.updateVideos(relatedVideos, forceUpdate)
    }

    updateInfobar(container: HTMLElement, whitelisted: boolean, channelId = this.channelId) {
        container = this.setDataNode(container);
        if (!container) return false;
        if (!channelId) return false;

        let links = container.querySelectorAll('a') as NodeListOf<InfoLink>;

        for (let link of links) {
            // this link hasn't been looked at
            // or the channel changed
            // or the whitelist state changed
            // or the link changed to something that we didnt set it to
            if (!link.href) continue;
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

        channelId.username = ChannelID.getUsernameFromURL(oGet(container, 'data.navigationEndpoint.browseEndpoint.canonicalBaseUrl')) || ''
        channelId.id = oGet(container, 'data.navigationEndpoint.browseEndpoint.browseId') || '';
        channelId.display = oGet(container, 'data.title.runs[0].text') || '';

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
        return this.dataNode = container || this.dataNode || document.querySelector('#watch7-user-header');
    }
    setParentNode(parent?: HTMLElement) {
        if (parent) {
            return this.buttonParent = parent;
        } else {
            if (!this.buttonParent || this.buttonParent && this.dataNode && this.buttonParent.parentElement !== this.dataNode) {
                if (this.dataNode) {
                    return this.buttonParent = this.dataNode.querySelector('#watch7-subscription-container')
                } else {
                    return this.buttonParent = document.querySelector('#watch7-subscription-container');
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

        let links = this.dataNode.querySelectorAll('a') as ArrayLike<any>;
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
        return this.dataNode = container || this.dataNode || document.querySelector('ytd-page-manager');//'ytd-browse');
    }

    setParentNode(parent?: HTMLElement) {
        return this.buttonParent = parent || this.buttonParent || document.querySelector('#edit-buttons');
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

        channelId.username = oGet(container, 'data.response.metadata.channelMetadataRenderer.doubleclickTrackingUsername') || '';
        channelId.display = oGet(container, 'data.response.metadata.channelMetadataRenderer.title') || '';
        channelId.id = oGet(container, 'data.response.metadata.channelMetadataRenderer.externalId') || '';

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
        return this.buttonParent = parent || this.buttonParent || document.querySelector('.primary-header-actions');
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
        let link = document.querySelector('link[rel="canonical"]') as any

        if (link) {
            links.push(link);
        }

        let channelId = ChannelID.extractFromLinks(links);
        channelId.username = (link && link.getAttribute('username')) || '';
        channelId.display = document.querySelector('.branded-page-header-title-link').textContent || '';
        return ChannelID.validate(channelId)
    }
}

class SearchPagePoly {
    constructor() {
        this.updatePage = this.updatePage.bind(this);
    }
    updatePage(forceUpdate?: boolean) {
        let channelElements: NodeListOf<ChannelElement> = document.querySelectorAll('ytd-channel-renderer');

        if (!channelElements) return;

        for (let channelElement of channelElements) {
            let channelId = this.getChannelId(channelElement);
            let whitelisted = ChannelID.inwhitelist(channelId) !== -1;

            if (channelElement.whitelistButton && channelElement.whitelistButton.exists()) {
                if (forceUpdate)
                    whitelisted ? channelElement.whitelistButton.on() : channelElement.whitelistButton.off();
            } else {
                let button = new WhitelistButtonPoly(this.toggleWhitelist.bind(this, channelElement), whitelisted);
                let container = channelElement.querySelector('#subscribe-button');

                container.insertBefore(button.render(), container.firstChild);
                channelElement.whitelistButton = button;
            }
        }

        pages.updateAllVideos(forceUpdate)
    }
    toggleWhitelist(dataNode: HTMLElement) {
        let channelId = this.getChannelId(dataNode);
        if (!channelId) throw 'Channel ID not available';

        if (ChannelID.inwhitelist(channelId) !== -1) {
            ChannelID.whitelistRemove(channelId);
        } else {
            ChannelID.whitelistAdd(channelId);
        }
    }
    getChannelId(container: HTMLElement) {
        let channelId = ChannelID.createNew();
        if (!container) throw 'Search element required to get channelId under search mode';

        channelId.display = oGet(container, 'data.title.simpleText') || '';
        channelId.id = oGet(container, 'data.channelId') || '';
        channelId.username = ChannelID.getUsernameFromURL(oGet(container, 'data.longBylineText.runs[0].navigationEndpoint.browseEndpoint.canonicalBaseUrl')) || '';

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
        return { id: '', username: '', display: '' };
    }
    static getUsernameFromURL(url: string): string {
        if (!url) return '';

        let matches = url.match(/\/user\/(.+)/);

        if (matches && matches.length > 1) {
            return matches[1];
        } else {
            return '';
        }
    }
    static whitelistRemove(channelId: Channel) {
        return agent.send('set-settings', { param: channelId, type: 'remove-white' });
    }
    static whitelistAdd(channelId: Channel) {
        return agent.send('set-settings', { param: channelId, type: 'add-white' });
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
            username = '';
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
                if (matches[1] === 'user') {
                    channelId.username = matches[2] //we can safely assume that /user/$1 is a username
                } else if (matches[1] === 'channel') {
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

    constructor(design: Layout) {
        if (design === Layout.Polymer) {
            this.video = new VideoPagePoly();
            this.channel = new ChannelPagePoly();
            this.search = new SearchPagePoly();
        } else if (design === Layout.Basic) {
            this.video = new VideoPageBasic();
            this.channel = new ChannelPageBasic();
            this.search = new SearchPageBasic();
        }

        this.currentURL = '';
        this.updateAllVideos = this.updateAllVideos.bind(this);
    }
    static getDesign() {
        if ((window as any).Polymer || document.querySelector('ytd-app')) {
            return Layout.Polymer;
        } else {
            return Layout.Basic;
        }
    }
    getMode(): PageType {
        let newURL = location.href;

        if (newURL !== this.currentURL) {
            this.currentURL = newURL;
            return this.mode = this.determineMode(newURL);
        } else {
            return this.mode;
        }
    }
    determineMode(url = location.href): PageType {
        if (url.indexOf('youtube.com/watch?') !== -1) {
            return PageType.Video;
        } else if (url.indexOf('youtube.com/channel/') !== -1 || url.indexOf('youtube.com/user/') !== -1) {
            return PageType.Channel;
        } else if (url.indexOf('youtube.com/results?') !== -1) {
            return PageType.Search;
        } else {
            return PageType.Any;
        }
    }

    update(forceUpdate?: boolean, verify?: boolean) {
        let mode = this.getMode();

        if (mode === PageType.Video) {
            this.video.updatePage(forceUpdate, verify);
        } else if (mode === PageType.Channel) {
            this.channel.updatePage(forceUpdate, verify);
        } else if (mode === PageType.Search) {
            this.search.updatePage(forceUpdate);
        } else if (mode === PageType.Any) {
            this.updateAllVideos(forceUpdate)
        }
    }

    updateAd(ad: any, mode = this.getMode()) {
        if (mode === PageType.Video) {
            this.video.updateAdInformation(ad);
        } else if (mode === PageType.Channel) {
            this.channel.updateAdInformation(ad);
        }
    }
    updateVideos(videos: NodeListOf<VideoPoly>, forceUpdate?: boolean, channelId?: Channel) {
        for (let video of videos) {
            if (!forceUpdate && video.data.processed) continue;

            let id = oGet(video, 'data.shortBylineText.runs[0].navigationEndpoint.browseEndpoint.browseId') ||
                (channelId && channelId.id);

            if (id) {
                let links = video.querySelectorAll('a[href^="/watch?"]') as NodeListOf<HTMLAnchorElement>;
                if (!links.length) continue;

                let destURL = video.data.originalHref;

                if (ChannelID.inwhitelist(id, true) !== -1) {
                    if (!video.data.originalHref) {
                        destURL = links[0].getAttribute('href');
                        video.data.originalHref = destURL;
                    }
                    destURL += '&disableadblock=1';
                } else {
                    if (!destURL) {
                        video.data.processed = true;
                        continue;
                    }
                }

                for (let link of links)
                    link.href = destURL;

                if (oGet(video, 'data.navigationEndpoint.webNavigationEndpointData.url'))
                    video.data.navigationEndpoint.webNavigationEndpointData.url = destURL;
                if (oGet(video, 'data.navigationEndpoint.commandMetadata.webCommandMetadata.url'))
                    video.data.navigationEndpoint.commandMetadata.webCommandMetadata.url = destURL;

                video.data.processed = true;
            }
        }
    }
    updateAllVideos(forceUpdate?: boolean, channelId?: Channel) {
        const query = 'ytd-grid-video-renderer,ytd-video-renderer,ytd-playlist-video-renderer';
        const videos = document.querySelectorAll(query) as NodeListOf<VideoPoly>;

        return this.updateVideos(videos, forceUpdate, channelId);
    }

    updateAllVideosBasic(whitelisted: boolean, forceUpdate = false) {
        let videos: NodeListOf<VideoBasic> = document.querySelectorAll('.yt-lockup-video');

        for (let vid of videos) {
            if (!forceUpdate && vid.processed) continue;
            let inwhite;

            if (whitelisted !== null) {
                inwhite = whitelisted;
            } else {
                let user = vid.querySelector('.stat.attribution span');
                let values = ChannelID.createNew();

                if (!user || !(values.username = user.textContent))
                    continue;
                inwhite = ChannelID.inwhitelist(values) !== -1
            }
            if (inwhite || forceUpdate) { // exists
                let links = vid.querySelectorAll('a[href^="/watch?"]');

                for (let link of links) {
                    link.setAttribute('href', pages.reflectURLFlag(link.getAttribute('href'), inwhite));
                }
            }
            vid.processed = true;
        }
    }
    updateRelatedBasic(forceUpdate: boolean) {
        // This function really doesn't work anymore as YT
        // removed the data-ytid attribute from video elements
        // So there's really no way to get the UCID anymore,
        // short of wasting time chasing some Google API.
        let videos: NodeListOf<VideoBasic> = document.querySelectorAll('.video-list-item');

        for (let vid of videos) {
            if (!forceUpdate && vid.processed) continue;

            let user, userNode = vid.querySelector('[data-ytid]');

            if (!user) {
                continue;
            } else {
                user = userNode.getAttribute('data-ytid');
            }
            let inwhite = ChannelID.inwhitelist(user, true) !== -1
            let links = vid.querySelectorAll('a[href^="/watch?"]');
            if (inwhite || forceUpdate) {
                for (let link of links) {
                    link.setAttribute('href', this.reflectURLFlag(link.getAttribute('href'), inwhite));
                }
            }
            vid.processed = true;
        }
    }
    updateURL(channelId: Channel, verify: boolean) {
        if (!channelId) throw 'No channel ID passed to updateURL';

        if (location.href.indexOf('&disableadblock=1') !== -1) {
            // ads are enabled, should we correct that?
            if (ChannelID.inwhitelist(channelId) === -1) {
                window.history.replaceState(history.state, '', pages.reflectURLFlag(location.href, false));
                return false;
            } else return true;
        } else {
            // ads are not enabled, lets see if they should be
            if (ChannelID.inwhitelist(channelId) !== -1) {
                window.history.replaceState(history.state, '', pages.reflectURLFlag(location.href, true));

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
            let paramsStart = url.indexOf('?');
            return url + (paramsStart === -1 ? '?igno=re' : (paramsStart === url.length - 1 ? 'igno=re' : '')) + '&disableadblock=1'

        } else {
            return url.replace(search, '');
        }
    }

    confirmDisabled(): void {
        setTimeout(() =>
            fetch('https://www.youtube.com/favicon.ico?ads=true').catch(() =>
                prompt('Ads may still be blocked, make sure you\'ve added the following rule to your uBlock Origin whitelist', '*youtube.com/*&disableadblock=1')
            )
            , 300);
    }
}


/**
 * Access deeply nested objects without throwing errors
 * @param object Reference to object literal
 * @param keyString Location to key item
 */
function oGet(object: any, keyString: string) {
    const props = keyString.split(/[\[\]\.]+/);
    let current = object;

    for (let prop of props) {
        if (prop.length === 0) continue;
        if (current[prop] !== undefined) current = current[prop];
        else return // console.log('Failed at', level);            
    }

    return current;
}

class LoadHastener {
    // This class helps us process the page 82% sooner than waiting for DOMContentLoaded
    // By watching HTML elements as they are first added, we can determine what design was
    // used sooner and can begin processing the page after 600 ms, as opposed to the
    // 3500 ms it can take to wait for DOMContentLoaded.
    watcher: MutationObserver;
    designConfirmed: (design: Layout) => void;

    constructor() {
        this.watcher = new MutationObserver(mutations => {
            for (let mutation of mutations) {
                if (mutation.type === 'childList') {
                    for (let node of mutation.addedNodes) {
                        if (node.nodeName === 'BODY') {
                            return this.switchToBody();
                        } else if (node.nodeName === 'SCRIPT') {
                            if ((node as HTMLScriptElement).src.indexOf('polymer.js') !== -1) {
                                return this.confirmDesign(Layout.Polymer);
                            }
                        } else if ((node as Element).localName === 'ytd-app') {
                            return this.confirmDesign(Layout.Polymer);
                        }
                    }
                }
            }
        });
        this.designConfirmed = null;
        this.contentLoaded = this.contentLoaded.bind(this)
    }

    getDesign(): Promise<Layout> {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            return Promise.resolve(Page.getDesign());
        } else {
            return new Promise(resolve => {
                this.designConfirmed = resolve;
                this.watcher.observe(document.body || document.documentElement, { childList: true });
                document.addEventListener('DOMContentLoaded', this.contentLoaded);
            })
        }
    }
    confirmDesign(design: Layout): void {
        this.watcher.disconnect();
        document.removeEventListener('DOMContentLoaded', this.contentLoaded)
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

function init(design: Layout) {
    pages = new Page(design || Page.getDesign());
    watcher = new MutationWatcher();
    pages.update(true);
    watcher.start();

    agent
        .on('settings-update', (updated: any) => {
            settings = updated.settings;
            pages.update(true, updated.initiator)
        })
        .on('ad-update', (ad: any) => {
            pages.updateAd(ad);
        })
        .on('destroy', () => {
            console.log('Detaching inject script..');

            agent.destroy();
            watcher.destroy();
            domCleanup();
            agent = null;
            watcher = null;
            pages = null;
        })
        .send('ready');

    function domCleanup() {
        let nodes = document.querySelectorAll('.UBO-ads-btn,.UBO-wl-btn,.UBO-wl-container,.UBO-menu');

        for (let node of nodes) {
            node.remove();
        }
    }
}
// MAIN ENTRY POINT
agent = new MessageAgent();
agent.send('get-settings').then(response => {
    settings = response.settings;
    accessURLs = response.accessURLs;

    let load = new LoadHastener();
    load.getDesign().then(design => init(design));
});