
import { log, err } from './logging';
import { i18n, seti18n } from './i18n';
import { SiteWatch, Component } from './domwatch';
import {
    Channel, Settings as _Settings,
    Action, MutationElement,
    InfoLink, VideoPoly, Ad, AutoSkipSeconds
} from '../typings';
import MessageAgent from '../agent';
import AdOptions from './ad-options';
let agent: MessageAgent;
let settings: Settings;

class SingleChannelPage extends Component {
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
     */
    videoEl?: HTMLVideoElement;
    skipEl?: HTMLButtonElement;
    channelId?: Channel
    adPlaying: boolean;
    currentAd?: Ad;
    subscribed: null | boolean;
    skipping: boolean;
    adOptions: AdOptions
    wlButton: WhitelistButton;
    videoId: string;
    adsPlayed: number;
    constructor(url: string | RegExp, WlConstructor: typeof WhitelistButton) {
        super(url);
        this.adPlaying = false;
        this.subscribed = null;
        this.skipping = false;
        this.videoId = '';
        this.adsPlayed = 0;
        this.adOptions = new AdOptions(this.onBlacklist.bind(this), this.toggleMute.bind(this), this.forceSkip.bind(this));
        this.wlButton = new WlConstructor(this.toggleWhitelist.bind(this), false);
        this.onTree('video', this.onVideoElement.bind(this));
        this.onAll('#movie_player', this.onVideoContainer.bind(this))
        this.onAll('.ytp-ad-skip-button-container', this.onSkipAvailability.bind(this));
        this.onAll('paper-button.ytd-subscribe-button-renderer', this.onSubscribeBtn.bind(this))

    }

    onVideoElement(videoEl?: HTMLVideoElement) {
        const checkVideoId = () => {
            const nextVideoId = this.getVideoId();
            if (this.videoId !== nextVideoId) {
                this.videoId = nextVideoId;
                this.adsPlayed = 0;
            }
        }
        let src = videoEl.getAttribute('src');
        if (this.videoEl !== videoEl) {
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
            this.videoEl = videoEl;
        }

    }
    onVideoContainer(container?: HTMLDivElement) {
        const playing = container && container.classList.contains('ad-showing');
        this.onAdPlayState(playing || false, container);
    }

    getVideoId(): string /** override */ {
        return '';
    }

    onSubscribeBtn(button?: HTMLButtonElement) {
        if (!button) return this.subscribed = null;
        this.subscribed = !!button.getAttribute('subscribed');
        this.applyAdState();
    }

    onSkipAvailability(container?: HTMLDivElement) {
        const available = container && container.style.display !== 'none' && container.querySelector('button');
        this.skipEl = available || null;
        if (this.skipping)
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
            this.applyAdState()
        } else if (this.adPlaying && !playing) {
            this.adPlaying = false;
            this.adOptions.hide();
            this.adOptions.reset();
            this.skipEl = null;
            this.skipping = false;
            this.currentAd = null;
        }
    }
    onAdInfo(ad: Ad) {
        this.currentAd = ad;
        // apply to adoptions
        this.applyAdState();
    }
    /** This should be triggered by changing channel name, changing user info, etc. */
    possibleChannelChange(channelId: Channel) {
        const nextChannel = this.getChannelId();

        if (nextChannel.id !== this.channelId.id) {
            this.channelId = nextChannel
            this.applyPageState();
            this.applyAdState();
        }
    }
    getChannelId(): Channel /** override */ {
        return Channels.empty();
    }
    applyPageState() {
        if (!this.channelId) return;

    }
    applyAdState() {
        if (!this.adPlaying) return;
        if (!this.currentAd) {
            this.toggleMute(settings.muteAll);
        } else {
            const inMutelist = settings.muted.has(this.currentAd.channelId);
            const muteAll = !!settings.muteAll;

            // if muteAll && inmute should be false
            // if muteAll && !inmute should be true
            // if !muteAll && inmute should be true
            // if !muteAll && !inmute should be false
            // All of these conditions are met with muteAll !== inmute

            this.toggleMute(muteAll !== inMutelist);
        }

        if (settings.blacklisted.has(this.currentAd.channelId)) {
            this.forceSkip();
        } else {
            if (!this.channelId || (settings.autoWhite && this.subscribed === null)) {
                if (!this.videoEl || typeof this.videoEl.src !== 'string' || this.videoEl.src.indexOf('blob:') !== -1)
                    return; // not enough info to decide
            }
            if (!settings.asWl(this.channelId, this.subscribed))
                this.forceSkip();
        }
        this.adOptions.muteOption = true;
        this.adOptions.blacklistOption = true;
        this.adOptions.advertiserName = this.currentAd.channelId.display;
    }
    forceSkip() {
        if (!this.adPlaying) return;
        this.skipping = true;

        if (this.skipEl) {
            this.skipEl.click();
        } else {
            // force the video ahead;
            this.skipAhead(this.videoEl);
        }
    }
    skipAhead(videoEl: HTMLVideoElement) {
        const duration = videoEl.duration;
        if (isNaN(duration)) return;
        const target = duration - 1;
        if (videoEl.currentTime < target)
            videoEl.currentTime = target;
    }
    onBlacklist() {
        if (!this.currentAd.channelId) throw ('Channel ID not available for blacklisting');
        agent.send('set-settings', { param: this.currentAd.channelId, type: 'add-black' })
            .then(() => this.forceSkip())
            .catch(error => err('Error blacklisting:', error))
    }
    toggleMute(nextMute: boolean) {
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
        // this.button.appendChild(AdOptions.generateIcon(icons.checkcircle))
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
    limitAds: boolean;
    limitAdsQty: number;
    forceWhite: boolean;

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
        return this.whitelisted.has(channel)
            || (this.autoWhite && subscribed && !this.exclude.has(channel));
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
