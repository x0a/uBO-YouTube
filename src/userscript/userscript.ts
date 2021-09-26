
import { log, err } from './logging';
import { i18n, seti18n } from './i18n';
import icons from './icons';
import { SiteWatch, Component } from './domwatch';
import {
    Channel, Settings as _Settings,
    Action, MutationElement,
    InfoLink, VideoPoly, Ad, AutoSkipSeconds, DataLink
} from '../typings';
import { getMetadata, getVideoData, getVideoId } from './fauxapi';
import { AdBlock } from './adblock';
import MessageAgent from '../agent';
import AdOptions from './ad-options';
import Obj from './objutils';

interface PageWithPlayer extends VideoPlayer {
    getChannelId: () => Channel;
    onWlContainer: (container: HTMLDivElement) => void;
    onChannelContainer: (el: HTMLElement) => void;
}

let agent: MessageAgent;
let settings: Settings;
let subscriptions: Channels;
/** to prevent feedback loops when multiple tabs are open with subscriptions, any deviation from the list should be saved locally until the conflicting channel ID is gone */
let nextSubscriptions: Channels
let subscriptionChanges: Array<string>;

abstract class VideoPlayer extends Component {
    /** 
     * Needs to be able to:
     * detect whether the video belongs to a channel that is whitelisted or not (incl. when whitelist subscribed channels is turned on),
     * force skip ads when playing on non-whitelisted channels
     * detect whether related videos belong to whitelisted channels or not, add flag accordingly
     * skip ads when errors are encountered
     * hide/remove overlay ads when the setting is enabled
     * 
     * Needs to watch for:
     * channel information
     * skip button
     * video element
     * video error element
     * related video continuations
     * overlay ads
     * subscribe button
     * 
     * CURRENT TODOs:
     * Base suggested video channel IDs on already-processed related videos for efficiency reasons
     * 
     */
    videoEl?: HTMLVideoElement;
    videoContainer?: HTMLDivElement;
    skipEl?: HTMLButtonElement;
    pageManager?: HTMLDivElement;
    pendingSuggestions: Promise<void>
    channelId?: Channel
    adPlaying: boolean;
    currentAd?: Ad;
    adVideoId: string;
    subscribed: undefined | boolean;
    skipping: boolean;
    adOptions: AdOptions
    wlButton: WhitelistButton;
    videoId: string;
    adsPlayed: number;
    videoError: boolean;
    unhookVideo?: () => void;
    initialized: boolean;
    constructor(url: string | ((url: string) => boolean), WlConstructor: typeof WhitelistButton) {
        super(url);
        this.adPlaying = false;
        this.skipping = false;
        this.videoError = false;
        this.initialized = false;
        this.videoId = '';
        this.adVideoId = '';
        this.adsPlayed = 0;
        this.pendingSuggestions = Promise.resolve();
        this.adOptions = new AdOptions(this.onBlacklist.bind(this), this.toggleMute.bind(this), this.forceSkip.bind(this));
        this.wlButton = new WlConstructor(this.toggleWhitelist.bind(this), false);
        this.onTree('video', this.onVideoElement.bind(this));
        this.onAll('#movie_player', this.onVideoContainer.bind(this), ['class'])
        this.onAll('.ytp-ad-skip-button-container', this.onSkipAvailability.bind(this), ['style']);
        this.onTree('ytd-page-manager', this.onPageManager.bind(this));
        this.onTree('button.ytp-ad-overlay-close-button', (button: HTMLButtonElement) => settings.skipOverlays && button && button.click())
        //this.onTree('a.ytp-ce-covering-overlay', this.onSuggested.bind(this))
        this.onKeyboard = this.onKeyboard.bind(this);
        document.addEventListener('keyup', this.onKeyboard);
        adblock.onNet(this.onNet.bind(this));
        console.log(this);
    }

    onVideoElement(videoEl?: HTMLVideoElement) {
        if (!videoEl) {
            err('uBO-Video', 'Could not find video element');
            if (this.unhookVideo) this.unhookVideo();
            return;
        }
        let lastVideoId = this.getVideoId();
        const checkVideoId = () => {
            if (this.videoId !== lastVideoId) {
                log('uBO-YT', 'Video ID change detected (onVideoElement)', lastVideoId, '->', this.videoId);
                lastVideoId = this.videoId
                this.adsPlayed = 0;
            }
        }
        let src = videoEl.getAttribute('src');
        if (!this.videoEl || this.videoEl !== videoEl) {
            if (this.unhookVideo) this.unhookVideo();
            log('uBO-video', 'Found new video element. Hooking events');
            const fn = () => {
                if (isNaN(videoEl.duration)) return;
                if (videoEl.getAttribute('src') !== src) {
                    src = videoEl.getAttribute('src');
                    checkVideoId();
                    log('uBO-limit', 'Video source:', src, 'VideoID:', this.videoId);
                    if (this.adPlaying) {
                        this.adsPlayed++;
                        log('uBO-limit', 'Total Ads:', this.adsPlayed, 'VideoID:', this.videoId);
                    }
                }
                const overPlayLimit = settings.autoSkip
                    && videoEl.currentTime > settings.autoSkipSeconds
                    && videoEl.duration > settings.autoSkipSeconds;
                const overAdsLimit = settings.limitAds && this.adsPlayed > settings.limitAdsQty;
                const shouldAutoSkip = overPlayLimit || overAdsLimit;

                if (this.skipping) {
                    log('Re-attempting skip')
                    this.skipAhead(videoEl);
                } else if (this.adPlaying && shouldAutoSkip) {
                    log('Automatically skipping per settings');
                    this.forceSkip();
                }
            }
            videoEl.addEventListener('timeupdate', fn);
            videoEl.addEventListener('durationchange', fn);
            this.unhookVideo = () => {
                videoEl.removeEventListener('timeupdate', fn);
                videoEl.removeEventListener('durationchange', fn)
                if (this.videoEl = videoEl) {
                    this.videoEl = undefined;
                }
                this.unhookVideo = undefined;
            }
            this.videoEl = videoEl;
        }

    }
    updateSuggestions(force = false) {
        if (!this.videoContainer) return;
        // [a.ytp-ce-covering-overlay]
        // [a.ytp-next-button.ytp-button]
        const origPending = this.pendingSuggestions;
        this.pendingSuggestions = new Promise(resolve => origPending.then(() => {
            const all = Array.from(this.videoContainer.querySelectorAll('a[href*="/watch?"]')) as Array<DataLink>
            all.forEach(el => {
                const id = getVideoId(el.href);
                if (el.data?.id && el.data.id === id) return;
                if (!el.data) el.data = {}
                el.data.id = id;
                el.data.processed = false;
            })
            const videoIds = [...new Set(all.filter(el => !el.data.processed && el.data.id).map(el => el.data.id))]
            const untouched = all.filter(el => !el.data.processed || !el.data.channelId);

            Promise.all(videoIds.map(id => getMetadata(id)
                .then(metadata => getVideoData(id, metadata))))
                .then(videos => videos.forEach(video => video.channelId && untouched
                    .filter(el => el.data.id === video.video_id)
                    .forEach(el => el.data.channelId = video.channelId)))
                .then(() => all.forEach(el => {
                    if (!force && el.data.processed) return;
                    el.data.processed = true;
                    log('uBO-suggestions', 'Treated', el.data.id, el.data.channelId)
                    el.href = External.reflectURLFlag(el.href, settings.asWl(el.data.channelId));

                }))
                .then(() => resolve())
                .catch(error => err('uBO-suggestions', error))
        })
        )
    }
    onPageManager(pageManager: HTMLDivElement) {
        this.pageManager = pageManager;
        this.videoId = this.getVideoId();
    }
    onVideoContainer(container?: HTMLDivElement) {
        const playing = container && container.classList.contains('ad-showing');
        this.videoContainer = container;
        this.onAdPlayState(playing || false, container);
        this.updateSuggestions();
    }

    getVideoId(): string /** override */ {
        const fromURL = (url: string) => {
            const params = new URL(url).searchParams;
            return params.get('v') || ''
        }
        const fromPageManager = () => {
            if (!this.pageManager) {
                err('YT-video', 'Page manager not found');
                return ''
            }
            return Obj.get(this.pageManager, 'data.playerResponse.videoDetails.videoId') || '';
        }
        return fromPageManager() || fromURL(location.href);
    }

    onSubscribeBtn(button?: HTMLButtonElement, mutation?: MutationRecord): void {
        if (!button) return this.subscribed = undefined;

        const prevSubscribed = this.subscribed;
        this.subscribed = this.getSubscribeStatus()//button.getAttribute('subscribed') !== null && button.getAttribute('subscribed') !== 'false';
        if (this.subscribed !== prevSubscribed) {
            log('uBO-wl', 'Subscribe state change:', this.subscribed, this.channelId)
            this.applyPageState();
            this.applyAdState();
        }
    }

    onSkipAvailability(container?: HTMLDivElement) {
        const available = container && container.style.display !== 'none' && container.querySelector('button');
        const prevSkip = this.skipEl;

        this.skipEl = available || undefined;

        if (prevSkip !== this.skipEl)
            log('uBO-ads', 'Updated skip button', this.skipEl)

        if (this.skipping && this.skipEl)
            this.skipEl.click();

    }
    onAdPlayState(playing: boolean, container: HTMLDivElement) {
        if (!this.adPlaying && playing) {
            this.adPlaying = true;
            const controls = document.querySelector('.ytp-right-controls');
            const button = this.adOptions.renderButton();
            const menu = this.adOptions.renderMenu();

            if (!controls.contains(button))
                controls.insertBefore(button, controls.firstChild);
            if (!container.contains(menu))
                container.appendChild(menu);
            this.adOptions.show();
            this.adOptions.skipOption = true;
            log('uBO-ads', 'Detected ad playing')
            this.applyAdState()
        } else if (this.adPlaying && !playing) {
            log('uBO-ads', 'Ad finished playing')
            if (this.shouldPause()) {
                this.schedulePause();
            }
            this.setMute(false);
            this.adPlaying = false;
            this.videoError = false;
            this.adOptions.hide();
            this.adOptions.reset();
            this.skipEl = null;
            this.skipping = false;
            this.currentAd = null;
            this.adVideoId = '';
        }
    }
    onAdInfo(ad: Ad) {
        if (this.currentAd && this.currentAd.video_id !== ad.video_id) {
            this.adOptions.reset();
            this.adOptions.skipOption = true;
        }
        this.currentAd = ad;
        this.applyAdState();
    }
    /** This should be triggered by changing channel name, changing user info, etc. */
    possibleChannelChange(nextChannel: Channel) {
        if (this.channelId && nextChannel && this.channelId.id === nextChannel.id) return;
        log('uBO-wl', 'Channel changed', nextChannel);
        this.channelId = nextChannel
        this.applyPageState();
        this.applyAdState();
    }
    abstract getChannelId(): Channel;
    abstract getSubscribeStatus(): boolean;

    applyPageState(userCaused = false) {
        if (!this.channelId) return;

        const whitelisted = settings.asWl(this.channelId, this.subscribed);
        log('uBO-wl', 'Applied wl-state from', this.channelId,
            'whitelisted:', whitelisted,
            'subscribed:', this.subscribed,
            'excluded:', settings.exclude.has(this.channelId))
        if (whitelisted) {
            this.wlButton.on();
        } else {
            this.wlButton.off();
        }
        External.updateURL(whitelisted, userCaused);

        if (!settings.autoWhite || this.subscribed === undefined) return;

        External.updateSubscriptions(userCaused, this.channelId, this.subscribed);
    }
    applyAdState() {
        if (!this.adPlaying) return;
        if (!this.currentAd) {
            this.setMute(settings.muteAll);
        } else if (this.currentAd.video_id === this.adVideoId) {
            const inMutelist = settings.muted.has(this.currentAd.channelId);
            const muteAll = !!settings.muteAll;

            // if muteAll && inmute should be false
            // if muteAll && !inmute should be true
            // if !muteAll && inmute should be true
            // if !muteAll && !inmute should be false
            // All of these conditions are met with muteAll !== inmute

            this.setMute(muteAll !== inMutelist);

            if (settings.blacklisted.has(this.currentAd.channelId)) {
                this.forceSkip();
            } else {
                this.adOptions.muteOption = true;
                this.adOptions.blacklistOption = true;
                this.adOptions.advertiserName = this.currentAd.channelId.display;
            }

        } else {
            err('uBO-Ads', 'Ad is not a match', this.currentAd, this.adVideoId);
        }
        if (this.videoError && this.skipEl && settings.skipAdErrors) {
            log('uBO-Ads', 'Skipping ad due to ad failing to load')
            this.forceSkip(false);
            return;
        }
        if (this.channelId && !settings.asWl(this.channelId, this.subscribed)) {
            log('uBO-ads', 'Force skipping ad due to non-whitelisted channel', this.channelId, this.getChannelId())
            this.forceSkip();
        } else {
            log('uBO-ads', 'Decided not to skip', this.channelId, settings.asWl(this.channelId))
        }

    }
    forceSkip(mute = true) {
        if (!this.adPlaying) return;
        this.skipping = true;

        if (this.skipEl) {
            this.skipEl.click();
        } else {
            // force the video ahead;
            this.setMute(mute);
            this.skipAhead(this.videoEl);
        }
    }
    skipAhead(videoEl: HTMLVideoElement) {
        if (!videoEl) return err('uBO-ads', 'Can\'t skip ahead until video element is available');

        const duration = videoEl.duration;
        if (isNaN(duration)) return;
        const target = duration - 1;
        if (videoEl.currentTime < target)
            videoEl.currentTime = target;
    }
    shouldPause() {
        return this.adOptions.muted && settings.pauseAfterAd && document.hidden && !this.skipping;
    }
    schedulePause() {
        let pageTitle: string;
        let intervalId: number;
        let titleChanges = 0;

        this.onVideoPlayable(this.videoEl)
            .then(() => {
                this.videoEl.pause();
                this.setMute(false);

                pageTitle = document.title;
                intervalId = setInterval(() => {
                    document.title = ++titleChanges % 2 ? "[❚❚] " + pageTitle : "[❚❚]";
                }, 800);

                agent.send('highlight-tab');
                return External.onPageFocus();
            })
            .then(() => {
                clearInterval(intervalId);
                document.title = pageTitle;
                this.videoEl.play();
            })
    }
    onVideoPlayable(video: HTMLVideoElement, resolveAnySrc = true): Promise<void> {
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
    onVideoError(error: boolean) {
        this.videoError = error;

        this.applyAdState();
    }
    onBlacklist() {
        if (!this.currentAd.channelId) throw ('Channel ID not available for blacklisting');
        agent.send('set-settings', { param: this.currentAd.channelId, type: 'add-black' })
            .then(() => this.forceSkip())
            .catch(error => err('Error blacklisting:', error))
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
    setMute(nextMute: boolean) {
        if (nextMute) {
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
    toggleWhitelist() {
        if (!this.channelId) throw 'No channel ID found';

        if (settings.toggleWl(this.channelId, this.subscribed)) {
            this.wlButton.on();
        } else {
            this.wlButton.off();
        }
    }
    onKeyboard(event: KeyboardEvent) {
        if (!settings.keyboardSkip) return;

        if (event.key === 'ArrowRight'
            && this.adPlaying
            && !this.skipping
            && !event.composedPath().find((node: Element) =>
                node instanceof HTMLElement &&
                (node.tagName === 'TEXTAREA'
                    || node.tagName === 'INPUT'
                    || node.getAttribute('contenteditable')))) {
            this.forceSkip();
        }
    }
    onNet(url: string) {
        if (!this.adPlaying) return;
        if (url.indexOf('/api/stats/ads') !== -1) {
            const [, adVideoId] = url.match(/&ad_v=([^&]+)&/) || [, ''];
            if (adVideoId && this.adVideoId !== adVideoId) {
                this.adVideoId = adVideoId;
                log('uBO-video', adVideoId, this.getVideoId());
                // TO DO -- convert this to an ad object and send up to background
                getMetadata(adVideoId)
                    .then(metadata => {
                        log('uBO-Ads', 'Received metadata', metadata);
                        return getVideoData(adVideoId, metadata);
                    })
                    .then(ad => {
                        agent.send('echo-ad', ad);
                    })
                    .catch(_err => err('uBO-Ads', 'Could not get ad details', _err));
            }
        }
    }
}

class VideoPage extends VideoPlayer implements PageWithPlayer {
    channelContainer: HTMLElement;
    buttonContainer: HTMLDivElement;
    mounted: boolean;
    constructor() {
        super('youtube.com/watch?', WhitelistButtonPoly);
        this.onTree('#top-row ytd-video-owner-renderer', this.onWlContainer.bind(this));
        this.onTree('ytd-video-secondary-info-renderer', this.onChannelContainer.bind(this));
        this.onAll('ytd-video-owner-renderer ytd-channel-name yt-formatted-string a', this.onChannelContainer.bind(this));
        this.onModified('ytd-subscribe-button-renderer tp-yt-paper-button', this.onSubscribeBtn.bind(this), ['subscribed']);

        watch.onURLUpdate(url => {
            if (!this.mounted) return;
            const params = new URL(url).searchParams;
            const nextVideoId = params.get('v')
            if (nextVideoId === undefined) return;
            if (this.videoId !== nextVideoId) {
                log('uBO-wl', 'Video ID change detected', this.videoId, '->', nextVideoId)
                this.channelId = undefined;
                this.subscribed = undefined;
            }

            this.videoId = nextVideoId;

        })
    }
    onMount() {
        this.mounted = true;
        this.onWlContainer(document.querySelector('#top-row ytd-video-owner-renderer'));
        this.onChannelContainer(document.querySelector('ytd-video-secondary-info-renderer'));
        this.onVideoElement(document.querySelector('video'));
        this.onVideoContainer(document.querySelector('#movie_player'));
        this.onPageManager(document.querySelector('ytd-page-manager'))
        this.onSubscribeBtn(document.querySelector('ytd-subscribe-button-renderer tp-yt-paper-button'));
        this.update(!this.initialized);
        this.initialized = true;
    }

    onWlContainer(el: HTMLDivElement) {
        this.buttonContainer = el;
        if (!el) {
            err('uBO-wl', 'Wl button destination was removed');
            return;
        }

        if (el.nextSibling) {
            el.parentElement.insertBefore(this.wlButton.render(), el.nextSibling);
        } else {
            el.appendChild(this.wlButton.render());
        }
        log('uBO-wl', 'Found button destination', el)
        this.updateInfoLinks();

    }
    onChannelContainer(container: HTMLDivElement) {
        if (!container) {
            err('uBO-wl', 'Channel ID container not found');
            return;
        }
        this.channelContainer = document.querySelector('ytd-app');
        this.possibleChannelChange(this.getChannelId())
        this.updateInfoLinks();

    }
    getChannelId() {
        const channelId = Channels.empty();

        if (!this.channelContainer) return null;
        channelId.id = Obj.get(this.channelContainer, 'data.playerResponse.videoDetails.channelId')
        channelId.display = Obj.get(this.channelContainer, 'data.playerResponse.videoDetails.author')

        return Channels.valid(channelId);
    }
    getSubscribeStatus() {
        const parent = Obj.findParent(Obj.get(this.pageManager, 'data'), 'videoSecondaryInfoRenderer');
        if (parent) {
            const subscribed = Obj.get(parent, 'videoSecondaryInfoRenderer.subscribeButton.subscribeButtonRenderer.subscribed');

            return subscribed;
        }

    }
    updateInfoLinks() {
        if (!this.buttonContainer || !this.channelId) return;
        const whitelisted = settings.asWl(this.channelId, this.subscribed);
        const links = this.buttonContainer.querySelectorAll('a') as NodeListOf<InfoLink>;

        for (let link of links) {
            // this link hasn't been looked at
            // or the channel changed
            // or the whitelist state changed
            // or the link changed to something that we didnt set it to
            if (!link.href) continue;
            if (!link.channelId || link.channelId !== this.channelId.id || link.whitelisted !== whitelisted || link.sethref !== link.href) {
                link.href = link.sethref = External.reflectURLFlag(link.href, whitelisted);
                link.whitelisted = whitelisted;
                link.channelId = this.channelId.id;
            }
        }
    }
    update(force = false, userCaused = false) {
        this.applyPageState(userCaused);
        this.applyAdState();
        this.updateSuggestions(force || userCaused);
        this.updateInfoLinks()
    }
    unMount() {
        if (this.unhookVideo) this.unhookVideo();
        this.mounted = false;
    }
    destroy(): void {
        document.querySelectorAll('.UBO-ads-btn,.UBO-wl-container')
            .forEach(el => el.remove());
        if (this.unhookVideo) this.unhookVideo();
    }
}

class ChannelPage extends Component {
    channelContainer: HTMLDivElement;
    wlButton: WhitelistButton;
    pageManager: HTMLDivElement;
    channelId?: Channel;
    subscribed?: boolean;
    mounted: boolean;

    constructor() {
        super((url) => /youtube.com\/(channel|c|user)\//.test(url));
        this.onTree('#edit-buttons', this.onWlContainer.bind(this));
        this.onTree('ytd-page-manager', this.onPageManager.bind(this));
        this.onAll('div#header ytd-subscribe-button-renderer tp-yt-paper-button', this.onSubscribeBtn.bind(this), ['subscribed']);
        this.onAll('div#inner-header-container ytd-subscribe-button-renderer tp-yt-paper-button', this.onSubscribeBtn.bind(this), ['subscribed'])
        this.onAll('ytd-channel-name.ytd-c4-tabbed-header-renderer', () => this.applyPageState());
        this.onModified('#progress', this.onProgress.bind(this));

        this.wlButton = new WhitelistButtonPoly(this.toggleWhitelist.bind(this), false);
        this.mounted = false;
    }
    onMount() {
        this.onPageManager(document.querySelector('ytd-page-manager'));
        this.onSubscribeBtn(document.querySelector('div#inner-header-container ytd-subscribe-button-renderer tp-yt-paper-button'))
        this.onWlContainer(document.querySelector('#edit-buttons'));
        this.mounted = true;
    }
    onProgress(progressEl: HTMLElement) {
        if (progressEl?.style.transform === 'scaleX(1)') {
            this.applyPageState();
        }
    }
    onWlContainer(container: HTMLDivElement) {
        if (!container) {
            err('uBO-wl', 'Channel ID container not found on channel page');
            return;
        } else {
            log('uBO-wl', 'Found', container)
        }
        this.channelContainer = container;
        this.channelContainer.appendChild(this.wlButton.render())
        this.applyPageState();
    }
    onPageManager(manager: HTMLDivElement) {
        this.pageManager = manager;
        this.applyPageState();
    }
    onSubscribeBtn(btn: HTMLButtonElement): void {
        if (!btn) return this.subscribed = undefined;

        const prevSubscribed = this.subscribed;
        const nextSubscribedInternal = this.getSubscribeStatus();
        const nextSubscribedDOM = btn.getAttribute('subscribed') !== null && btn.getAttribute('subscribed') !== 'false';

        this.subscribed = nextSubscribedDOM;// nextSubscribedInternal !== null ? nextSubscribedInternal : nextSubscribedDOM;

        if (this.subscribed !== prevSubscribed) {
            log('uBO-wl', 'Subscribe state change:', this.subscribed, this.channelId)
            this.applyPageState();
        }
    }
    toggleWhitelist() {
        if (!this.channelId) throw 'No channel ID found';

        if (settings.toggleWl(this.channelId, this.subscribed)) {
            this.wlButton.on();
        } else {
            this.wlButton.off();
        }
    }
    getSubscribeStatus() {
        if (!this.pageManager) throw 'Page manager not found';
        return Obj.get(this.pageManager, 'data.response.header.c4TabbedHeaderRenderer.subscribeButton.subscribeButtonRenderer.subscribed') || false;

    }
    getChannelId(container: HTMLElement) {
        let channelId = Channels.empty();
        if (!container) return null;

        channelId.username = Obj.get(container, 'data.response.metadata.channelMetadataRenderer.doubleclickTrackingUsername') || '';
        channelId.display = Obj.get(container, 'data.response.metadata.channelMetadataRenderer.title') || '';
        channelId.id = Obj.get(container, 'data.response.metadata.channelMetadataRenderer.externalId') || '';

        return Channels.valid(channelId);
    }
    applyPageState(force = false, userCaused = false) {
        if (!this.pageManager) {
            err('uBO-wl', 'Page manager not found');
            return;
        }
        this.channelId = this.getChannelId(this.pageManager);
        if (!this.channelId) {
            err('uBO-wl', 'Channel ID not found yet');
            return;
        }
        const whitelisted = settings.asWl(this.channelId, this.subscribed);
        /*
        log('uBO-wl', 'Applied whitelist state:', whitelisted,
            'subscribed (dom):', this.subscribed,
            'subscribed (cached):', subscriptions.has(this.channelId),
            'subscribed:', this.getSubscribeStatus(),
            'whitelist (inefficient)', settings.asWl(this.channelId, this.getSubscribeStatus()),
            'excluded:', settings.exclude.has(this.channelId),
        ) 
        */

        if (whitelisted) {
            this.wlButton.on();
        } else {
            this.wlButton.off();
        }
        if (this.channelId && this.subscribed !== undefined)
            External.updateSubscriptions(userCaused, this.channelId, this.subscribed)
        External.updateAllVideos(force, this.channelId)
        External.updateURL(whitelisted, userCaused)
    }
    update(force = false, userCaused = false) {
        this.applyPageState(force, userCaused);
    }
    onUmount() {
        this.subscribed = undefined;
        this.channelId = undefined;
        this.mounted = false;
    }
    destroy() {

    }
}

interface ChannelElement extends HTMLDivElement {
    whitelistButton: WhitelistButtonPoly;
}
class Search extends Component {
    constructor() {
        super('youtube.com/results?');
        this.onModified('div#contents', this.onList.bind(this))
    }
    onMount() {
        this.update();
    }
    onList(list: HTMLDivElement) {
        this.update();
    }
    update(userCaused = false) {
        const channelEls = document.querySelectorAll('ytd-channel-renderer') as NodeListOf<ChannelElement>;
        for (const channelEl of channelEls) {
            const channelId = this.getChannelId(channelEl);
            const whitelisted = settings.asWl(channelId, this.isSubscribed(channelEl));

            if (channelEl.whitelistButton && channelEl.whitelistButton.exists()) {
                if (userCaused)
                    whitelisted ? channelEl.whitelistButton.on() : channelEl.whitelistButton.off();
            } else {
                const button = new WhitelistButtonPoly(this.toggleWhitelist.bind(this, channelEl), whitelisted);
                const container = channelEl.querySelector('#subscribe-button');

                container.insertBefore(button.render(), container.firstChild);
                channelEl.whitelistButton = button;
            }
        }
    }
    getChannelId(container: HTMLElement) {
        const channelId = Channels.empty();
        if (!container) throw 'Search element required to get channelId under search mode';

        channelId.display = Obj.get(container, 'data.title.simpleText') || '';
        channelId.id = Obj.get(container, 'data.channelId') || '';
        channelId.username = Channels.fromURL(Obj.get(container, 'data.longBylineText.runs[0].navigationEndpoint.browseEndpoint.canonicalBaseUrl')) || '';

        return Channels.valid(channelId);
    }
    toggleWhitelist(channelEl: HTMLElement) {
        const channelId = this.getChannelId(channelEl);
        if (!channelId) throw 'Channel ID not available';

        settings.toggleWl(channelId, this.isSubscribed(channelEl));
    }
    isSubscribed(channelEl: HTMLElement): boolean {
        return Obj.get(channelEl, 'data.subscriptionButton.subscribed') || false;
    }
    destroy() {

    }
}
class AllPages extends Component {
    extract: boolean;
    constructor() {
        super((url) => !/youtube.com\/(channel|c)\//.test(url));
        adblock.onFetch(this.onFetch.bind(this));
        this.onModified('#continuations', this.update.bind(this, false), ['hidden']);
        this.onModified('yt-page-navigation-progress', this.update.bind(this, false), ['hidden'])
        this.onTree('#items,#content', el => el?.childNodes?.length && this.update(false, el));
        this.extract = location.href.indexOf('?uBO-YT-extract') !== -1
    }
    onMount() {
        External.updateAllVideos(true);

    }
    onFetch(req: string | Request, call: Promise<Response>) {
        const _url = req instanceof Request ? req.url : req;
        const url = new URL(_url);

        if (url.pathname === "/youtubei/v1/guide") {
            call
                .then(res => res.clone())
                .then(data => data.json())
                .then(json => {
                    const subscriptionsContainer = Obj.findParent(json, 'guideSubscriptionsSectionRenderer')?.guideSubscriptionsSectionRenderer;
                    if (!subscriptionsContainer) throw 'Could not find .guideSubscriptionsSectionRenderer';

                    const firstSubs = subscriptionsContainer.items.filter((sub: any) => !sub.guideCollapsibleEntryRenderer);
                    const expandables = Obj.findParent(subscriptionsContainer, 'expandableItems')?.expandableItems || [];
                    if (!expandables) log('uBO-subscriptions', 'No expandable items found');


                    const all = [...firstSubs, ...expandables]
                        .filter((item: any) => item.guideEntryRenderer.entryData)
                        .map((item: any) => ({
                            id: item.guideEntryRenderer.navigationEndpoint.browseEndpoint.browseId,
                            username: '',
                            display: item.guideEntryRenderer.formattedTitle.simpleText
                        }))
                        .filter(item => Channels.valid(item));

                    log('uBO-subscriptions', 'Found the following subscriptions', all);
                    subscriptions.suggest(all);
                    if (this.extract) {
                        log('uBO-subscriptions', 'Sending subscriptions up to background script');
                        settings.whitelisted.suggest(all)
                    }
                })
                .catch(error => err('uBO-subscriptions', 'Found guide data but unable to extract information', error))
        }
    }
    update(force = false, el: HTMLElement) {
        // log('uBO-links', 'Updating video links', el) 
        // TO DO: minimize the running of this function
        External.updateAllVideos(force);
    }
    destroy() {

    }
}
class External {
    private static videosQuery = [
        'ytd-rich-grid-video-renderer',
        'ytd-grid-video-renderer',
        'ytd-video-renderer',
        'ytd-playlist-video-renderer',
        'ytd-rich-item-renderer',
        'ytd-compact-video-renderer',
        'ytd-playlist-panel-video-renderer'
    ].join(',');
    static updateURL(whitelisted: boolean, verify: boolean) {
        if (location.href.indexOf('&disableadblock=1') !== -1) {
            // ads are enabled, should we correct that?
            if (!whitelisted) {
                window.history.replaceState(history.state, '', this.reflectURLFlag(location.href, false));
                toggleAdblock(true);
                return false;
            } else {
                toggleAdblock(false);
                return true;
            }
        } else {
            // ads are not enabled, lets see if they should be
            if (whitelisted) {
                window.history.replaceState(history.state, '', this.reflectURLFlag(location.href, true));
                toggleAdblock(false);
                if (verify && settings.verifyWl) this.confirmDisabled();
                return true;
            } else {
                toggleAdblock(true);
                return false;
            }
        }
    }

    static reflectURLFlag(url: string, shouldContain: boolean): string {
        // take url, return url with flags removed if add is off
        // return url with flags added if add is on
        const search = /((?!\?)igno=re&disableadblock=1&?)|(&disableadblock=1)/g

        if (shouldContain) {
            url = this.reflectURLFlag(url, false); // remove first, then add
            const paramsStart = url.indexOf('?');
            return url + (paramsStart === -1 ? '?igno=re' : (paramsStart === url.length - 1 ? 'igno=re' : '')) + '&disableadblock=1'

        } else {
            return url.replace(search, '');
        }
    }
    static confirmDisabled(): void {
        setTimeout(() =>
            fetch('https://www.youtube.com/favicon.ico?ads=true').catch(() =>
                prompt(i18n('adsStillBlocked'), '*youtube.com/*&disableadblock=1')
            )
            , 300);
    }
    static updateVideos(videos: NodeListOf<VideoPoly>, forceUpdate?: boolean, channelId?: Channel) {
        for (const video of videos) {
            if (!forceUpdate && video.data.processed) continue;

            const id = Obj.get(video, 'data.channelId')
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
                if (Obj.get(video, 'data.content.videoRenderer.navigationEndpoint.commandMetadata.webCommandMetadata.url'))
                    video.data.content.videoRenderer.navigationEndpoint.commandMetadata.webCommandMetadata.url = destURL
                if (Obj.get(video, 'data.navigationEndpoint.webNavigationEndpointData.url'))
                    video.data.navigationEndpoint.webNavigationEndpointData.url = destURL;
                if (Obj.get(video, 'data.navigationEndpoint.commandMetadata.webCommandMetadata.url'))
                    video.data.navigationEndpoint.commandMetadata.webCommandMetadata.url = destURL;

                video.data.processed = true;
            }
        }
    }
    static updateAllVideos(forceUpdate?: boolean, channelId?: Channel) {
        const videos = document.querySelectorAll(this.videosQuery) as NodeListOf<VideoPoly>;
        return this.updateVideos(videos, forceUpdate, channelId);
    }
    static onPageFocus(): Promise<void> {
        if (!document.hidden) return Promise.resolve();
        return new Promise(resolve => {
            const listener = () => {
                if (!document.hidden) {
                    document.removeEventListener("visibilitychange", listener);
                    resolve();
                }
            };
            document.addEventListener("visibilitychange", listener);
        })
    }
    static updateSubscriptions(userCaused: boolean, channel: Channel, subscribed: boolean) {
        if ((userCaused && nextSubscriptions) || (subscriptionChanges && subscriptionChanges.indexOf(channel.id) === -1)) {
            // change originated from here or subscriptions are pending and do not conflict with current channel ID
            log('uBO-wl', 'Applied pending subscriptions', nextSubscriptions);
            subscriptions = nextSubscriptions;
            nextSubscriptions = undefined;
            subscriptionChanges = undefined;
        } else if (nextSubscriptions) {
            log('uBO-wl', 'Did not apply pending subscriptions due to conflict w/ current channel ID', subscriptionChanges, channel.id, userCaused)
        }
        const inList = subscriptions.has(channel) || nextSubscriptions?.has(channel) || false;
        if (inList !== subscribed) {
            log('uBO-wl', 'Suggesting change due to subscriptions not being correct', channel, 'In cache:', inList, 'On page:', subscribed);

            if (inList && !subscribed) {
                subscriptions.remove(channel);
                log('uBO-wl', 'Request remove to subscriptions cache', channel)
            } else {
                subscriptions.add(channel);
                log('uBO-wl', 'Request add to subscriptions cache', channel);
            }
        }
    }
}

class WhitelistButton {
    toggled: boolean;
    button: HTMLButtonElement;
    buttonContainer: HTMLDivElement;
    placeholder: HTMLElement;
    constructor(onClick: EventListener, toggled: boolean) {
        this.toggled = toggled;

        this.button = document.createElement('button');
        this.button.className = 'UBO-wl-btn';
        this.button.title = i18n('whitelistTooltip');
        this.button.addEventListener('click', onClick);

        this.buttonContainer = document.createElement('div');
        this.buttonContainer.className = 'UBO-wl-container';
        this.placeholder = document.createElement('button');
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

    render(): HTMLElement { /** override */
        return this.placeholder;
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

class Channels {
    private type: string;
    protected list: Array<Channel>;
    private action: string;

    constructor(list: Array<Channel>, type: string, action = 'set-settings') {
        this.list = list;
        this.type = type;
        this.action = action;
    }

    static empty(): Channel {
        return { id: '', username: '', display: '' };
    }
    static valid(channel: Channel): Channel | null {
        return (channel && (channel.id || channel.username)) &&
            typeof channel.id === 'string' && typeof channel.username === 'string'
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
    diff(channels: Channels) {
        const notIn2 = this.list.filter(i => channels.list.findIndex(channel => channel.id === i.id) === -1)
        const notIn1 = channels.list.filter(i => this.list.findIndex(channel => channel.id === i.id) === -1);
        const unique = Array.from(new Set([...notIn1.map(({ id }) => id), ...notIn2.map(({ id }) => id)]))
        return unique;
    }
    has(channel: Channel | string) {
        if (!channel) return false;
        const needle = typeof channel === 'string' ? channel : channel.id;
        return this.list.findIndex(({ id }) => id === needle) !== -1;
    }
    remove(channel: Channel) {
        return agent.send(this.action, { param: channel, type: 'remove-' + this.type })
    }
    add(channel: Channel) {
        return agent.send(this.action, { param: channel, type: 'add-' + this.type });
    }
    suggest(channels: Array<Channel> | undefined) {
        return agent.send(this.action, { param: channels, type: 'suggest-' + this.type })
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
    limitAds: boolean;
    limitAdsQty: number;
    forceWhite: boolean;

    constructor(settings: _Settings) {
        Object.assign(this, {
            ...settings,
            whitelisted: new Channels(settings.whitelisted, 'white'),
            muted: new Channels(settings.muted, 'mute'),
            exclude: new Channels(settings.exclude, 'exclude'),
            blacklisted: new Channels(settings.blacklisted, 'black'),
        })
    }
    asWl(channel: Channel, subscribed = subscriptions.has(channel)): boolean {
        return this.whitelisted.has(channel)
            || (this.autoWhite && subscribed && !this.exclude.has(channel));
    }
    /** Toggle a channel's whitelisted status */
    toggleWl(channel: Channel, subscribed = subscriptions.has(channel)): boolean {
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
const hookNav = (onURL: (url: string) => any) => {
    const hookLinks = (onURL: (url: string) => any) => {
        const listener = (e: MouseEvent) => {
            const link = e.composedPath().find((node: Element) => node.tagName === 'A') as HTMLAnchorElement;
            const href = link && link.getAttribute('href');
            if (href) {
                onURL(href);
            }
        }
        document.addEventListener('click', listener, true)
        return () => {
            document.removeEventListener('click', listener, true);
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

const adblock = new AdBlock(location.href.indexOf('&disableadblock=1') === -1);
const unhookLinks = hookNav(link => toggleAdblock(link.indexOf('&disableadblock=1') === -1));
const toggleAdblock = (nextBlock: boolean) => {
    adblock.toggleAll(nextBlock);
    adblock.togglePrune(nextBlock)//  && !settings.autoWhite); // TODO: Add this back if the new predictive subscribe feature isnt working
}

const watch = new SiteWatch();

const init = () => {
    const video = new VideoPage();
    const all = new AllPages();
    const channel = new ChannelPage();
    const search = new Search();
    if (settings.forceWhite) {
        adblock.togglePrune(false);
    }
    watch.add(video);
    watch.add(all);
    watch.add(channel);
    watch.add(search);
    watch.onURLUpdate(url => {
        !adblock.enabled() // force whitelist if adblocker is off, incase YT randomly changes URL after it loaded it itself
            && url.indexOf("&disableadblock=1") === -1
            && window.history.replaceState(history.state, '', External.reflectURLFlag(location.href, true))
        log('uBO-wl', 'Forced URL flag addition to match internal adblock state')
    })

    try {
        watch.start();
    } catch (e) {
        err('YT-general', e)
    }
    // fix this shit and use it instead of video.mounted, so that channel can be used too 
    //const potentialFeedbackLoop = () => watch.currentComponents && watch.currentComponents.indexOf((component: Component) => component === video || component === channel) !== -1
    agent
        .on('settings-update', ({ initiator, settings: _settings }) => {
            log('uBO-YT', 'Received settings update', _settings)
            settings = new Settings(_settings);
            watch.update(true, initiator);
        })
        .on('subscriptions-update', (resp: any) => {
            const { initiator, subscriptions: _subscriptions } = resp;
            if (video.mounted || channel.mounted) {
                nextSubscriptions = new Channels(_subscriptions, 'subscriptions', 'cache')
                subscriptionChanges = subscriptions.diff(nextSubscriptions);
            } else {
                subscriptions = new Channels(_subscriptions, 'subscriptions', 'cache');
            }

            log('uBO-wl', 'Received subscriptions from host', _subscriptions, initiator, resp)
            if (settings.autoWhite)
                watch.update(true, initiator)
        })
        .on('ad-update', (ad: any) => {
            video.onAdInfo(ad);
        })
        .on('destroy', () => {
            log('uBO-YT', 'Detaching inject script..');
            watch.destroy();
            agent = null;
        })
        .send('ready');
}



agent = new MessageAgent('uBOWL-message', true);
agent
    .on('destroy', () => {
        log('uBO-YT', 'Detaching all hooks and destroying agent');
        adblock.destroy();
        unhookLinks();
        agent.destroy();
        watch.destroy();
        log('uBO-YT', 'Gone.')
    })
    .send('get-settings')
    .then(response => {
        log('uBO-YT', 'Initiated with the following settings', response)
        agent.send('mute-tab', false) // reset
        settings = new Settings(response.settings);
        subscriptions = new Channels(response.subscriptions, 'subscriptions', 'cache');
        AdOptions.uboIcon = response.accessURLs.ICO;
        seti18n(response.i18n);
        init();
    });