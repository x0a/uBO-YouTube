import MessageAgent from '../agent';

import hookEvents from "./events";
import icons from './icons';
import AdOptions from './ad-options';
import { log, err } from './logging';
import { i18n, seti18n } from './i18n';
import { hookAdblock } from './adblock';
import Obj from './objutils';

import {
    Channel, Settings as _Settings,
    Action, MutationElement,
    InfoLink, VideoPoly, Ad, AutoSkipSeconds
} from '../typings';

const enum Layout {
    Polymer,
    Unknown
}
const enum PageType {
    Video,
    Channel,
    Search,
    Subscriptions,
    Any
}

type WhitelistButtonInstance = WhitelistButtonPoly;
type WhitelistButtonFactory = typeof WhitelistButtonPoly;

interface ChannelElement extends HTMLDivElement {
    whitelistButton: WhitelistButtonPoly;
}

/* ---------------------------- */

let settings: Settings;
let pages: Page, watcher: MutationWatcher, agent: MessageAgent, toast: (text: string) => void;

class MutationWatcher {

    watcher: MutationObserver;
    queuedActions: Map<Function, Action>;
    firstLoad: boolean;

    constructor() {
        this.watcher = new MutationObserver(this.onMutation.bind(this));
        this.queuedActions = new Map();
        this.firstLoad = false;
    }

    start() {
        this.watcher.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['hidden', 'href', 'style', 'class'], // we keep these to a minimum to avoid overwatching the page
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
    isFirstPageLoad(mutation: MutationElement): boolean {
        if (!this.firstLoad && mutation.type === 'childList'
            && mutation.target.localName === 'body'
            && (window as any).ytplayer?.config?.args?.author) {
            this.firstLoad = true;
            return true
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

    isPolyUserInfo(mutation: MutationElement): HTMLElement {
        if (
            (
                mutation.target.id === 'owner-name'
                && mutation.addedNodes.length
            ) || (
                mutation.type === 'attributes'
                && mutation.attributeName === 'href'
                && mutation.target.parentNode
                && (mutation.target.parentNode as HTMLElement).localName === 'ytd-video-owner-renderer'
            )
        ) {
            return mutation.target.closest('ytd-video-owner-renderer') as HTMLElement;
        } else if (mutation.target.localName === 'ytd-video-owner-renderer') {
            return mutation.target;
        } else {
            return null;
        }
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

    isOverlayAd(mutation: MutationElement): HTMLButtonElement {
        return mutation.type === 'childList'
            && (mutation.target.classList.contains('ytp-ad-module')
                || mutation.target.classList.contains('ytp-ubo-ad-module'))
            && mutation.addedNodes.length
            && mutation.target.querySelector('button.ytp-ad-overlay-close-button')
    }
    fixOverlayVideoAd(element: HTMLElement): boolean {
        if (element.classList.contains('ytp-ad-module') || element.classList.contains('ytp-ubo-ad-module')) {
            if (element.classList.contains('video-ads')) { // if .ytp-ad-module & .video-ads
                element.classList.remove('video-ads');
            }
            element.classList.replace('ytp-ad-module', 'ytp-ubo-ad-module');
            return true;
        }
        return element.classList.contains('video-ads'); // otherwise check if just .video-ads
    }
    isAdSkipContainer(mutation: MutationElement): HTMLElement {
        return (
            mutation.target.classList.contains('ytp-ad-skip-button-container')
            && mutation.target
        ) || (
                mutation.type === 'childList'
                && this.fixOverlayVideoAd(mutation.target)
                && mutation.addedNodes.length
                && mutation.target.querySelector('.ytp-ad-skip-button-container')
            );
    }
    isSubscribeBtn(mutation: MutationElement): boolean | undefined {
        return mutation.type === 'childList'
            && mutation.target.localName === 'yt-formatted-string'
            && mutation.target.parentElement.localName === 'paper-button'
            && mutation.target.parentElement.parentElement.localName === 'ytd-subscribe-button-renderer'
            ? !!mutation.target.parentElement.getAttribute('subscribed')
            : undefined
    }
    isChannelGrid(mutation: MutationElement) {
        return mutation.type === 'childList'
            && mutation.target.id === 'contents'
            && Array.from(mutation.addedNodes).some(el => el.localName === 'ytd-item-section-renderer');
    }
    static adSkipButton(container: HTMLElement): HTMLButtonElement {
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

        for (const mutation of mutations) {
            const type = pages.getType();
            // this.findInjection(mutation, 'paper-button.ytd-subscribe-button-renderer yt-formatted-string');
            if (type === PageType.Video) {
                let player, userInfo, skipContainer, overlaySkipButton: HTMLButtonElement, subscribeChange;

                if (userInfo = this.isPolyUserInfo(mutation)) {
                    pages.video.setParentNode(userInfo)
                    pages.video.updatePage();
                } else if (this.isRelatedUpdate(mutation)) {
                    this.pollUpdate(pages.video.updateVideos);
                } else if (this.isFirstPageLoad(mutation)) {
                    if (!pages.video.channelId) {
                        pages.video.updatePage();
                    }
                } else if (player = this.isPlayerUpdate(mutation)) {
                    pages.video.updateAdPlaying(player, player.classList.contains('ad-showing'));
                    let errorState = this.isPlayerErrorChange(mutation);
                    if (errorState !== null) {
                        pages.video.onVideoError(errorState);
                    }
                } else if (skipContainer = this.isAdSkipContainer(mutation)) {
                    pages.video.skipButtonUpdate(MutationWatcher.adSkipButton(skipContainer));
                } else if (overlaySkipButton = this.isOverlayAd(mutation)) {
                    if (settings.skipOverlays)
                        overlaySkipButton.click();
                } else if ((subscribeChange = this.isSubscribeBtn(mutation)) !== undefined) {
                    pages.video.updatePage();
                }
            } else if (type === PageType.Subscriptions) {
                if (this.isChannelGrid(mutation)) {
                    console.log('channel grid:', mutation)
                    pages.subscriptions.loadedChannels();
                }
            } else {
                if (type === PageType.Channel) {
                    let player, skipContainer, subscribeChange;
                    if (player = this.isPlayerUpdate(mutation)) {
                        pages.channel.updateAdPlaying(player, !!player.classList.contains('ad-showing'));
                        let errorState = this.isPlayerErrorChange(mutation);
                        if (errorState !== null) {
                            pages.channel.onVideoError(errorState);
                        }
                    } else if (skipContainer = this.isAdSkipContainer(mutation)) {
                        pages.channel.skipButtonUpdate(MutationWatcher.adSkipButton(skipContainer));
                    } else if ((subscribeChange = this.isSubscribeBtn(mutation)) !== undefined) {
                        pages.channel.updatePage();
                    }
                }
                if (this.hasNewItems(mutation)) { // new items in videolist
                    if (type === PageType.Channel) {
                        this.pollUpdate(pages.channel.updatePage);
                    } else if (type === PageType.Search) {
                        this.pollUpdate(pages.search.updatePage);
                    } else if (type === PageType.Any) {
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
        this.button.title = i18n('whitelistTooltip');
        this.button.addEventListener('click', onClick);

        this.buttonContainer = document.createElement('div');
        this.buttonContainer.className = 'UBO-wl-container';
    }

    off() {
        if (!this.toggled) return;

        this.toggled = false;
        this.button.title = i18n('whitelistTooltip');
        this.button.classList.remove('yt-uix-button-toggled');
    }

    on() {
        if (this.toggled) return;

        this.toggled = true;
        this.button.title = i18n('whitelistedTooltip');
        this.button.classList.add('yt-uix-button-toggled');
    }


}

class WhitelistButtonPoly extends WhitelistButton {
    constructor(onClick: EventListener, toggled: boolean) {
        super(onClick, toggled);
        this.button.className += ' UBO-wl-poly ' + (toggled ? ' yt-uix-button-toggled' : '');
        this.button.appendChild(AdOptions.generateIcon(icons.checkcircle))
        this.button.appendChild(document.createTextNode(i18n('adsEnableBtn').toUpperCase()));
        this.buttonContainer.appendChild(this.button);
    }
    exists() {
        return !!this.buttonContainer.parentElement;
    }
    render() {
        return this.buttonContainer;
    }
}

/** Class for dealing with pages with only one channel and thus only one Whitelisting button needed */
class SingleChannelPage {
    dataNode: HTMLElement;
    buttonParent: HTMLElement;
    whitelistButton: WhitelistButtonInstance;
    adOptions: AdOptions;
    channelId?: Channel;
    currentAd: Ad;
    firstRun: boolean;
    adPlaying: boolean;
    adConfirmed: boolean;
    videoError: boolean;
    awaitingSkip: boolean;
    pauseOrigin: boolean;
    skipButton: HTMLButtonElement;
    _currentPlayer: HTMLVideoElement;

    constructor(ButtonFactory: WhitelistButtonFactory) {
        this.dataNode = null
        this.buttonParent = null;
        this.whitelistButton = new ButtonFactory(this.toggleWhitelist.bind(this), false);
        this.adOptions = new AdOptions(
            this.addBlacklist.bind(this),
            this.toggleMute.bind(this),
            this.attemptSkip.bind(this)
        );
        this.channelId = null;
        this.currentAd = null;
        this.firstRun = true;
        this.adPlaying = false;
        this.adConfirmed = false;
        this.awaitingSkip = false;
        this.videoError = false;
        this.skipButton = null;
        this.muteTab(false);
        this.onKeyboard = this.onKeyboard.bind(this);
        document.addEventListener('keyup', this.onKeyboard);

        log('uBO-YT-Log', this);
    }

    updatePage(forceUpdate?: boolean, verify?: boolean) {
        if (!this.dataNode && !this.setDataNode()) return // console.error('Container not available');
        this.channelId = this.getChannelId(this.dataNode);
        if (!this.channelId) return err('Channel ID not available');

        const whitelisted = settings.asWl(this.channelId, this.isSubscribed());

        pages.updateURL(whitelisted, verify);

        whitelisted ? this.whitelistButton.on() : this.whitelistButton.off();

        if (verify && whitelisted) {
            // toast("Channel added to whitelist");
        }

        if (!settings.asWl(this.channelId) && this.adPlaying && !this.awaitingSkip) {
            log('Ad playing that should not be playing, attempting skip');
            this.attemptSkip();
        }

        if (!this.whitelistButton.exists() && this.insertButton(this.whitelistButton)) {
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
    set currentPlayer(nextPlayer: HTMLVideoElement) {
        if (nextPlayer && this._currentPlayer !== nextPlayer) {
            let src = nextPlayer.getAttribute('src');
            const fn = () => {
                // if (!src) src = nextPlayer.getAttribute('src');
                if (isNaN(nextPlayer.duration)) return;
                // if (nextPlayer.getAttribute('src') !== src) return;

                const shouldAutoSkip = settings.autoSkip
                    && nextPlayer.currentTime > settings.autoSkipSeconds
                    && nextPlayer.duration > settings.autoSkipSeconds

                if (this.awaitingSkip) {
                    log('Re-attempting skip')
                    this.forceAhead(nextPlayer);
                } else if (this.adPlaying && shouldAutoSkip) {
                    log('Automatically skipping per settings');
                    this.attemptSkip();
                }
            }
            nextPlayer.addEventListener('timeupdate', fn)
            nextPlayer.addEventListener('durationchange', fn)
            this._currentPlayer = nextPlayer;

        }
    }
    get currentPlayer() {
        return this._currentPlayer;
    }
    updateAdPlaying(player: HTMLElement, playing: boolean, firstRun = false) {
        if (playing && !this.adPlaying) {
            let container = player.querySelector('.ytp-right-controls');
            if (!container) return err('Can\'t find .ytp-right-controls');

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

                if (settings.autoSkip) {
                    // this.adOptions.overrideTooltip(i18n('autoSkipTooltip', settings.autoSkipSeconds));
                }

                if (checkAdblock() && this.channelId && !settings.asWl(this.channelId)) {
                    this.adPlaying = true;
                    this.attemptSkip();
                }
                this.onVideoPlayable(this.currentPlayer)
                    .then(() => this.updateAdButton());
            }
            if (firstRun) {
                agent.send('recent-ad').then(message => {
                    this.currentAd = message.response as Ad;
                    this.updateAdButton();
                })
                const skipContainer = player.querySelector(".ytp-ad-skip-button-container") as HTMLElement;
                if (skipContainer) {
                    const skipButton = MutationWatcher.adSkipButton(skipContainer);
                    if (skipButton)
                        this.skipButtonUpdate(skipButton);
                    const adContainer = skipContainer.closest('.ytp-ad-module');

                    if (adContainer) {
                        adContainer.classList.remove('video-ads');
                        adContainer.classList.replace('ytp-ad-module', 'ytp-ubo-ad-module');
                    }

                }
            }

            this.adPlaying = true;
        } else if (!playing && this.adPlaying) {
            this.adOptions.hide();
            this.adOptions.reset();
            this.adPlaying = false;
            this.adConfirmed = false;
            this.awaitingSkip = false;
            this.skipButton = null;
            this.currentAd = null;
            if (this.shouldPause()) {
                this.schedulePause()
            } else {
                this.muteTab(false);
            }
        }

        if (this.adPlaying) {
            this.updateAdButton();
        }
    }
    onKeyboard(event: KeyboardEvent) {
        if (!settings.keyboardSkip) return;

        if (event.key === 'ArrowRight'
            && this.adPlaying
            && !this.awaitingSkip
            && !event.composedPath().find((node: Element) =>
                node instanceof HTMLElement &&
                (node.tagName === 'TEXTAREA'
                    || node.tagName === 'INPUT'
                    || node.getAttribute('contenteditable')))) {
            this.attemptSkip();
        }
    }
    onVideoError(error: boolean) {
        this.videoError = error;

        if (this.videoError && this.adPlaying && this.skipButton && settings.skipAdErrors)
            this.attemptSkip(false);
    }
    updateAdInformation(ad: Ad) {
        if (this.currentAd && this.currentAd.video_id !== ad.video_id) {
            this.adConfirmed = false;
            this.adOptions.reset();
            this.adOptions.skipOption = true;
        }

        this.currentAd = ad;

        if (this.currentPlayer) {
            this.onVideoPlayable(this.currentPlayer)
                .then(() => this.updateAdButton());
        }
    }
    schedulePause() {
        let pageTitle: string;
        let intervalId: number;
        let titleChanges = 0;

        this.onVideoPlayable(this.currentPlayer)
            .then(() => {
                this.currentPlayer.pause();
                this.muteTab(false);
                this.pauseOrigin = true;

                pageTitle = document.title;
                intervalId = setInterval(() => {
                    document.title = ++titleChanges % 2 ? "[❚❚] " + pageTitle : "[❚❚]";
                }, 800);

                agent.send('highlight-tab');
                return pages.onPageFocus();
            })
            .then(() => {
                clearInterval(intervalId);
                document.title = pageTitle;
                this.currentPlayer.play();
                this.pauseOrigin = false;
            })
    }
    shouldPause() {
        return this.adOptions.muted && settings.pauseAfterAd && document.hidden && !this.awaitingSkip;
    }
    updateAdButton() {
        if (!this.adConfirmed && this.adPlaying && this.currentAd && this.verifyAd()) {
            this.adConfirmed = true;
            this.adOptions.muteOption = true;
            this.adOptions.blacklistOption = true;
            this.adOptions.advertiserName = this.currentAd.channelId.display;
            this.adOptions.show();
        }

        if (this.adConfirmed) {
            const inMutelist = settings.muted.has(this.currentAd.channelId);
            const muteAll = !!settings.muteAll;

            // if muteAll && inmute should be false
            // if muteAll && !inmute should be true
            // if !muteAll && inmute should be true
            // if !muteAll && !inmute should be false
            // All of these conditions are met with muteAll !== inmute

            this.muteTab(muteAll !== inMutelist);

            if (settings.blacklisted.has(this.currentAd.channelId)) {
                this.attemptSkip();
            }
        } else if (this.adPlaying && this.currentPlayer) {
            this.muteTab(settings.muteAll);
        }
    }
    attemptSkip(mute = true) {
        if (!this.currentPlayer || !this.adPlaying) return;

        if (this.skipButton) {
            return this.skipButton.click();
        }

        this.awaitingSkip = true;
        this.muteTab(mute);
        this.forceAhead(this.currentPlayer)
        this.currentPlayer.playbackRate = 5;
    }

    forceAhead(player: HTMLVideoElement) {
        const limit = this.getPlaybackLimit(player)

        if (isNaN(limit)) {
            this.onVideoPlayable(player, false)
                .then(() => {
                    player.currentTime = this.getPlaybackLimit(player) - 1
                })
                .catch(() => err('Src no longer matches'));
        } else {
            const target = limit - 1;

            if (player.currentTime < target)
                player.currentTime = target;
        }
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
        const shouldSkip = this.awaitingSkip || (this.videoError && settings.skipAdErrors);

        if (this.skipButton && shouldSkip) {
            this.skipButton.click();
        }
    }
    verifyAd() {
        //console.log(!!this.currentPlayer, typeof this.currentPlayer.src === 'string' && this.currentPlayer.src);
        return this.matchAdCompanion()
            || (typeof this.currentPlayer.src === 'string'
                && this.currentPlayer.src.indexOf('blob:') === 0);
        // if all else fails, just go with the fact that the ad is streaming from YT
        // and not some third party
    }

    onVideoPlayable(video: HTMLVideoElement, resolveAnySrc = true) {
        if (!!(video.currentTime > 0 && !video.paused && !video.ended && video.readyState > 2)) // is already playable
            return Promise.resolve();
        const lastSrc = video.src;

        return new Promise((resolve, reject) => {
            const listener = () => {
                video.removeEventListener('playing', listener);
                if (!resolveAnySrc && video.src !== lastSrc) return reject();
                resolve();
            }
            video.addEventListener('playing', listener);
            setTimeout(() => {
                reject();
                listener();
            }, 4000);
        })
    }
    matchAdCompanion() {
        const companion = document.querySelector('ytd-companion-slot-renderer');

        return companion
            && Obj.get(companion, 'data.actionCompanionAdRenderer.adVideoId') === this.currentAd.video_id
    }

    addBlacklist() {
        if (!this.currentAd.channelId) throw ('Channel ID not available for blacklisting');
        agent.send('set-settings', { param: this.currentAd.channelId, type: 'add-black' })
            .then(() => this.attemptSkip())
            .catch(error => err('Error blacklisting:', error))
    }
    muteTab(shouldMute: boolean) {
        if (shouldMute) {
            agent.send('mute-tab', true)
                .then(resp => this.adOptions.muted = true)
                .catch(error => {
                    err('Error muting:', error);
                });

        } else {
            const done = () => this.adOptions.muted = false;
            agent.send('mute-tab', false)
                .then(done)
                .catch(done); // replicate .finally
        }
    }
    toggleMute() {
        if (!this.currentAd.channelId) throw 'Ad channel ID not available for muting';
        const shouldMute = !settings.muted.has(this.currentAd.channelId);
        const action = shouldMute
            ? settings.muted.add(this.currentAd.channelId)
            : settings.muted.remove(this.currentAd.channelId);

        action
            .then(() => agent.send('mute-tab', shouldMute))
            .catch((error: any) => err('Error setting settings', error));
    }
    toggleWhitelist() {
        this.channelId = this.getChannelId(this.dataNode);
        if (!this.channelId) throw 'Channel ID not available';

        if (settings.toggleWl(this.channelId, this.isSubscribed())) {
            this.whitelistButton.on();
        } else {
            this.whitelistButton.off();
        }
    }
    setDataNode(/* override */node?: HTMLElement) { return node }
    insertButton(/* override */button: WhitelistButtonInstance): boolean { return false }
    updateVideos(/* override */whitelisted: boolean, forceUpdate: boolean) { }
    getChannelId(/* override */node: HTMLElement): Channel { return Channels.empty(); }
    isSubscribed(/* override */): boolean { return false };

}

class VideoPagePoly extends SingleChannelPage {
    secondaryDataNode: HTMLElement;
    constructor() {
        super(WhitelistButtonPoly);
        this.toggleWhitelist = this.toggleWhitelist.bind(this);
        this.updatePage = this.updatePage.bind(this);
        this.updateVideos = this.updateVideos.bind(this);
    }

    setDataNode(container: HTMLElement) {
        this.secondaryDataNode = document.querySelector('ytd-video-secondary-info-renderer');
        return this.dataNode = container || this.dataNode || document.querySelector('ytd-app');
    }

    setParentNode(parent?: HTMLElement) {
        return this.buttonParent = parent || this.buttonParent || document.querySelector('ytd-video-owner-renderer');
    }
    insertButton(button: WhitelistButtonInstance): boolean {
        this.setParentNode();
        if (!this.buttonParent) return false;

        if (this.buttonParent.nextSibling) {
            this.buttonParent.parentElement.insertBefore(button.render(), this.buttonParent.nextSibling);
        } else {
            this.buttonParent.appendChild(button.render());
        }
        return true;
    }
    updateVideos(whitelisted: boolean, forceUpdate: boolean) {
        this.updateInfobar(this.buttonParent, whitelisted);
        let relatedVideos = document.querySelectorAll('ytd-compact-video-renderer,ytd-playlist-panel-video-renderer') as NodeListOf<VideoPoly>;

        pages.updateVideos(relatedVideos, forceUpdate)
    }

    updateInfobar(container: HTMLElement, whitelisted: boolean, channelId = this.channelId) {
        container = this.setParentNode(container);
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
    isSubscribed() {
        if (!this.secondaryDataNode) return false;
        return Obj.get(this.secondaryDataNode, 'data.subscribeButton.subscribeButtonRenderer.subscribed') || false;
    }
    getChannelId(container: HTMLElement) {
        let channelId = Channels.empty();
        container = this.setDataNode(container);

        if (!container) return null;
        const prevId = this.channelId ? Channels.valid(this.channelId) : null;

        channelId.id = Obj.get(container, 'data.playerResponse.videoDetails.channelId') || (!prevId ? (window as any).ytplayer?.config?.args?.ucid : null);
        channelId.display = Obj.get(container, 'data.playerResponse.videoDetails.author') || (!prevId ? (window as any).ytplayer?.config?.args?.author : null);


        // channelId.username = Channels.fromURL(Obj.get(container, 'data.owner.videoOwnerRenderer.navigationEndpoint.browseEndpoint.canonicalBaseUrl')) || ''
        // channelId.id = Obj.get(container, 'data.owner.videoOwnerRenderer.navigationEndpoint.browseEndpoint.browseId') || '';
        // channelId.display = Obj.get(container, 'data.owner.videoOwnerRenderer.title.runs[0].text') || '';

        return Channels.valid(channelId);
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
    insertButton(button: WhitelistButtonInstance): boolean {
        this.setParentNode();
        if (!this.buttonParent) return false;
        this.buttonParent.appendChild(button.render());
        return true;
    }

    updateVideos(whitelisted: boolean, forceUpdate: boolean) {
        pages.updateAllVideos(forceUpdate, this.channelId);
    }

    getChannelId(container: HTMLElement) {
        let channelId = Channels.empty();
        container = this.setDataNode(container);
        if (!container) return null;

        channelId.username = Obj.get(container, 'data.response.metadata.channelMetadataRenderer.doubleclickTrackingUsername') || '';
        channelId.display = Obj.get(container, 'data.response.metadata.channelMetadataRenderer.title') || '';
        channelId.id = Obj.get(container, 'data.response.metadata.channelMetadataRenderer.externalId') || '';

        return Channels.valid(channelId);
    }
    isSubscribed() {
        return Obj.get(this.dataNode, 'data.response.header.c4TabbedHeaderRenderer.subscribeButton.subscribeButtonRenderer.subscribed') || false;
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
            let whitelisted = settings.asWl(channelId, this.isSubscribed(channelElement));

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

        settings.toggleWl(channelId, this.isSubscribed(dataNode));
    }
    isSubscribed(dataNode: HTMLElement): boolean {
        return Obj.get(dataNode, 'data.subscriptionButton.subscribed') || false;
    }
    getChannelId(container: HTMLElement) {
        let channelId = Channels.empty();
        if (!container) throw 'Search element required to get channelId under search mode';

        channelId.display = Obj.get(container, 'data.title.simpleText') || '';
        channelId.id = Obj.get(container, 'data.channelId') || '';
        channelId.username = Channels.fromURL(Obj.get(container, 'data.longBylineText.runs[0].navigationEndpoint.browseEndpoint.canonicalBaseUrl')) || '';

        return Channels.valid(channelId);
    }
}
class ChannelFeedPoly {
    // #grid-container 's contain the channels
    // if there are multiple pages, there will be multiple grid containers
    // if they are hidden, then window.dispatchEvent(new UIEvent('resize')) triggers the load of the next page
    // if there is a next page #continuations will have children.
    capture: boolean;
    container: HTMLElement;
    timeout: number;
    constructor() {
        this.capture = false;
    }
    updatePage(force: boolean = false) {
        if (this.capture) return;
        if (location.href.indexOf('?uBO-YT-extract') !== -1) {
            log('Capturing channels...');
            this.capture = true;
            this.insertCSS();
            this.instantAnimation();

            this.container = document.querySelector('ytd-section-list-renderer');
            if (!this.container) return settings.whitelisted.suggest(undefined)
            this.loadedChannels();
        }
    }
    insertCSS() {
        const nextCSS = document.createElement('style');
        nextCSS.textContent = '#grid-container { display: none !important }'
        document.documentElement.appendChild(nextCSS);
    }
    instantAnimation() {
        const origRAF = window.requestAnimationFrame;
        (window as any).requestAnimationFrame = function (fn: any) {
            fn(performance.now());
            return Math.random(); //shouldn't be much consequence to this, since the page will be closed immediately after
        }
        return () => {
            window.requestAnimationFrame = origRAF;
        }
    }
    loadedChannels() {
        if (!this.capture) return;

        const grids = document.querySelectorAll('#grid-container');
        if (!grids) return settings.whitelisted.suggest(undefined);

        if (this.timeout) {
            clearTimeout(this.timeout)
            this.timeout = 0;
        }

        const continuations = Obj.get(this.container, 'data.continuations') || [];
        if (continuations.length) {
            log('Fetching next page..')
            // The following is an absolute hack, for the record. It will break if YouTube decides to update the page..
            // But since they got rid of the RSS/XML feed, and their JSON api requires special headers, it's the only option we have.
            this.timeout = setTimeout(() => {
                settings.whitelisted.suggest(undefined);
            }, 4000)
            document.querySelectorAll('yt-next-continuation').forEach(el => {
                console.log(el);
                (el as any).data.autoloadEnabled = true;
                (el as any).data.autoloadImmediately = true;
                (el as any).maybeTriggerAutoload();
            })
            window.dispatchEvent(new UIEvent('resize'))
        } else {
            const channels = Array.from(document.querySelectorAll('ytd-channel-renderer'))
                .map(el => this.getChannelId(el as HTMLElement))
                .filter(channelId => channelId);
            log('Collected ' + channels.length + ' channels. Sending them to background')
            settings.whitelisted.suggest(channels);
        }
    }
    getChannelId(container: HTMLElement) {
        const channelId = Channels.empty();
        if (!container) throw 'Channel element required to get channelId';

        channelId.display = Obj.get(container, 'data.longBylineText.runs[0].text');
        channelId.username = Channels.fromURL(Obj.get(container, 'data.longBylineText.runs[0].navigationEndpoint.browseEndpoint.canonicalBaseUrl'))
        channelId.id = Obj.get(container, 'data.longBylineText.runs[0].navigationEndpoint.browseEndpoint.browseId')

        return Channels.valid(channelId);
    }
}
class Channels {
    private type: string;
    private list: Array<Channel>;

    constructor(list: Array<Channel>, type: string) {
        this.list = list;
        this.type = type;
    }

    static empty(): Channel {
        return { id: '', username: '', display: '' };
    }
    static valid(channel: Channel): Channel | null {
        return (channel && (channel.id || channel.username))
            ? channel
            : null;
    }
    static fromLinks(links: Array<any>): Channel {
        const channel = Channels.empty();

        for (const link of links) {
            if (!link.href) continue;
            const matches = link.href.match(/\/(user|channel)\/([\w-]+)(?:\/|$|\?)/)
            if (!matches) continue;
            const [_, type, id] = matches;

            if (type === 'user')
                channel.username = id;
            else if (type === 'channel') {
                channel.id = id
                if (link.textContent) //to weed out the metadata link on channel pages
                    channel.display = link.textContent;
            }
        }
        return channel;
    }
    static fromURL(url: string) {
        if (!url) return '';

        const matches = url.match(/\/user\/(.+)/);

        if (matches && matches.length > 1) {
            return matches[1];
        } else {
            return '';
        }
    }
    has(channel: Channel | string) {
        if (!channel) return false;
        const needle = typeof channel === 'string' ? channel : channel.id;
        return this.list.findIndex(({ id }) => id === needle) !== -1;
    }
    remove(channel: Channel) {
        return agent.send('set-settings', { param: channel, type: 'remove-' + this.type })
    }
    add(channel: Channel) {
        return agent.send('set-settings', { param: channel, type: 'add-' + this.type });
    }
    suggest(channels: Array<Channel> | undefined) {
        return agent.send('set-settings', { param: channels, type: 'suggest-' + this.type })
    }
}

class Settings implements _Settings<Channels> {
    whitelisted: Channels;
    muted: Channels;
    exclude: Channels;
    blacklisted: Channels;
    pauseAfterAd: boolean;
    autoWhite: boolean;
    muteAll: boolean;
    skipAdErrors: boolean;
    skipOverlays: boolean;
    autoSkip: boolean;
    autoSkipSeconds: AutoSkipSeconds;
    keyboardSkip: boolean;
    verifyWl: boolean;
    constructor(settings: _Settings) {
        Object.assign(this, {
            ...settings,
            whitelisted: new Channels(settings.whitelisted, 'white'),
            muted: new Channels(settings.muted, 'mute'),
            exclude: new Channels(settings.exclude, 'exclude'),
            blacklisted: new Channels(settings.blacklisted, 'black')
        })
    }
    /** Determine whether channel should be treated as whitelisted */
    asWl(channel: Channel, subscribed = false): boolean {
        return settings.whitelisted.has(channel)
            || (settings.autoWhite && subscribed && !settings.exclude.has(channel));
    }
    /** Toggle a channel's whitelisted status */
    toggleWl(channel: Channel, subscribed = false): boolean {
        const curWl = this.asWl(channel, subscribed);
        if (curWl) {
            if (this.autoWhite && subscribed)
                this.exclude.add(channel);
            this.whitelisted.remove(channel);
            return false;
        } else {
            if (this.autoWhite && subscribed)
                this.exclude.remove(channel)
            else
                this.whitelisted.add(channel);
            return true;
        }
    }

}

class Page {
    video: VideoPagePoly //| VideoPageBasic;
    channel: ChannelPagePoly //| ChannelPageBasic;
    search: SearchPagePoly //| SearchPageBasic;
    subscriptions: ChannelFeedPoly;
    currentURL: string;
    mode: number;
    eventExemptions: Array<EventListener>;

    constructor(design: Layout) {
        if (design === Layout.Polymer) {
            this.video = new VideoPagePoly();
            this.channel = new ChannelPagePoly();
            this.search = new SearchPagePoly();
            this.subscriptions = new ChannelFeedPoly();
        }

        this.currentURL = '';
        this.eventExemptions = [];
        this.updateAllVideos = this.updateAllVideos.bind(this);
    }
    static getDesign() {
        if ((window as any).Polymer || document.querySelector('ytd-app')) {
            return Layout.Polymer;
        } else {
            return Layout.Unknown;
        }
    }
    getType(): PageType {
        let newURL = location.href;

        if (newURL !== this.currentURL) {
            this.currentURL = newURL;
            return this.mode = this.determineType(newURL);
        } else {
            return this.mode;
        }
    }
    determineType(url = location.href): PageType {
        if (url.indexOf('youtube.com/watch?') !== -1) {
            return PageType.Video;
        } else if (url.indexOf('youtube.com/channel/') !== -1 || url.indexOf('youtube.com/user/') !== -1) {
            return PageType.Channel;
        } else if (url.indexOf('youtube.com/results?') !== -1) {
            toggleAdblock(true);
            return PageType.Search;
        } else if (url.indexOf('youtube.com/feed/channels')) {
            toggleAdblock(true);
            return PageType.Subscriptions
        } else {
            toggleAdblock(true);
            return PageType.Any;
        }
    }

    update(forceUpdate?: boolean, verify?: boolean) {
        let mode = this.getType();

        if (mode === PageType.Video) {
            this.video.updatePage(forceUpdate, verify);
        } else if (mode === PageType.Channel) {
            this.channel.updatePage(forceUpdate, verify);
        } else if (mode === PageType.Search) {
            this.search.updatePage(forceUpdate);
        } else if (mode === PageType.Subscriptions) {
            this.subscriptions.updatePage(forceUpdate);
        } else if (mode === PageType.Any) {
            this.updateURL(false, false);
            this.updateAllVideos(forceUpdate)
        }
    }

    updateAd(ad: any, mode = this.getType()) {
        if (mode === PageType.Video) {
            this.video.updateAdInformation(ad);
        } else if (mode === PageType.Channel) {
            this.channel.updateAdInformation(ad);
        }
    }
    updateVideos(videos: NodeListOf<VideoPoly>, forceUpdate?: boolean, channelId?: Channel) {
        for (let video of videos) {
            if (!forceUpdate && video.data.processed) continue;

            let id = Obj.get(video, 'data.channelId')
                || Obj.get(video, 'data.shortBylineText.runs[0].navigationEndpoint.browseEndpoint.browseId')
                || Obj.get(video, 'data.content.videoRenderer.shortBylineText.runs[0].navigationEndpoint.browseEndpoint.browseId')
                || (channelId && channelId.id);

            if (id) {
                let links = video.querySelectorAll('a[href^="/watch?"]') as NodeListOf<HTMLAnchorElement>;
                if (!links.length) continue;

                let destURL = video.data.originalHref;

                if (settings.asWl(id)) {
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

                if (Obj.get(video, 'data.navigationEndpoint.webNavigationEndpointData.url'))
                    video.data.navigationEndpoint.webNavigationEndpointData.url = destURL;
                if (Obj.get(video, 'data.navigationEndpoint.commandMetadata.webCommandMetadata.url'))
                    video.data.navigationEndpoint.commandMetadata.webCommandMetadata.url = destURL;

                video.data.processed = true;
            }
        }
    }
    updateAllVideos(forceUpdate?: boolean, channelId?: Channel) {
        const query = 'ytd-rich-grid-video-renderer,ytd-grid-video-renderer,ytd-video-renderer,ytd-playlist-video-renderer,ytd-rich-item-renderer';
        const videos = document.querySelectorAll(query) as NodeListOf<VideoPoly>;

        return this.updateVideos(videos, forceUpdate, channelId);
    }
    updateURL(whitelisted: boolean, verify: boolean) {
        if (location.href.indexOf('&disableadblock=1') !== -1) {
            // ads are enabled, should we correct that?
            if (!whitelisted) {
                window.history.replaceState(history.state, '', pages.reflectURLFlag(location.href, false));
                toggleAdblock(true);
                return false;
            } else {
                toggleAdblock(false);
                return true;
            }
        } else {
            // ads are not enabled, lets see if they should be
            if (whitelisted) {
                window.history.replaceState(history.state, '', pages.reflectURLFlag(location.href, true));
                toggleAdblock(false);
                if (verify && settings.verifyWl) this.confirmDisabled();
                return true;
            } else {
                toggleAdblock(true);
                return false;
            }
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
                prompt(i18n('adsStillBlocked'), '*youtube.com/*&disableadblock=1')
            )
            , 300);
    }
    onPageFocus(): Promise<void> {
        if (!document.hidden) return Promise.resolve();
        return new Promise(resolve => {
            const listener = () => {
                if (!document.hidden) {
                    document.removeEventListener("visibilitychange", listener);
                    this.eventExemptions = this.eventExemptions.filter(fn => fn !== listener);
                    resolve();
                }
            };
            this.eventExemptions = this.eventExemptions.concat(listener);
            document.addEventListener("visibilitychange", listener);
        })
    }
    destroy() {
        document.removeEventListener('keyup', this.video.onKeyboard);
        document.removeEventListener('keyup', this.channel.onKeyboard);

        let nodes = document.querySelectorAll('.UBO-ads-btn,.UBO-wl-btn,.UBO-wl-container,.UBO-menu');

        for (let node of nodes) {
            node.remove();
        }
    }
}

const hookToast = () => {
    const toast = document.querySelector("ytd-popup-container paper-toast.yt-notification-action-renderer") as HTMLElement;
    if (!toast) return () => { };
    const label = toast.querySelector("span#label");

    return (text: string) => {
        label.textContent = text;
        toast.style.display = "";
        toast.classList.add('paper-toast-open');

        setTimeout(() => {
            toast.style.display = "none";
            toast.classList.remove('paper-toast-open');
        }, 3000);
    }
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

const hookNav = (onURL: (url: string) => any) => {
    const hookLinks = (onURL: (url: string) => any) => {
        const listener = (e: MouseEvent) => {
            const link = e.composedPath().find((node: Element) => node.tagName === 'A') as HTMLAnchorElement;
            const href = link && link.getAttribute('href');
            if (href) {
                onURL(href);
            }
        }
        document.addEventListener('click', listener)
        return () => {
            document.removeEventListener('click', listener);
        }
    }
    const hookHistory = (onURL: (url: string) => any) => {
        const listener = () => {
            if (location.href) {
                onURL(location.href);
            }
        }

        window.addEventListener('popstate', listener);
        return () => {
            window.removeEventListener('popstate', listener);
        }
    }
    const unhookLinks = hookLinks(onURL);
    const unhookHistory = hookHistory(onURL);

    return () => {
        unhookLinks();
        unhookHistory();
    }
}


const init = (design: Layout) => {
    pages = new Page(design || Page.getDesign());
    watcher = new MutationWatcher();
    // toast = hookToast();
    pages.update(true);
    watcher.start();

    agent
        .on('settings-update', (updated: any) => {
            settings = new Settings(updated.settings);
            pages.update(true, updated.initiator)
        })
        .on('ad-update', (ad: any) => {
            pages.updateAd(ad);
        })
        .on('destroy', () => {
            log('Detaching inject script..');
            watcher.destroy();
            pages.destroy();
            agent = null;
            watcher = null;
            pages = null;
        })
        .send('ready');
}


const [getEventListeners, awaitEventListener, filterEventListeners, unhookEvents] = hookEvents();
(window as any).gev = getEventListeners; // delete me

const [_toggleAdblock, checkAdblock, unhookAdblock] = hookAdblock(location.href.indexOf('&disableadblock=1') === -1, url => {
    if (settings) {
        agent.send('log-ad', url);
    }
});
const toggleAdblock = (nextBlock: boolean) => _toggleAdblock(nextBlock, !settings.autoWhite)
const unhookLinks = hookNav(link => toggleAdblock(link.indexOf('&disableadblock=1') === -1));

filterEventListeners("visibilitychange", (target, { fn }) => pages
    ? pages.eventExemptions.indexOf(fn) !== -1
    : false);

agent = new MessageAgent('uBOWL-message', true);
agent
    .on('destroy', () => {
        log('Detaching all hooks and destroying agent')
        unhookEvents();
        unhookAdblock();
        unhookLinks();
        agent.destroy();
        log('Destroyed')
    })
    .send('get-settings')
    .then(response => {
        settings = new Settings(response.settings);
        AdOptions.uboIcon = response.accessURLs.ICO;
        seti18n(response.i18n);

        let load = new LoadHastener();
        load.getDesign()
            .then(design => init(design));
    });