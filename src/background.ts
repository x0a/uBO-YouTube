import browser from './browser';
import Development from './dev-client'
import MessageListener from './ext-agent';
import { compressToBase64, decompressFromBase64 } from 'lz-string';
import {
    Channel, ChannelList, Settings,
    Ad, PendingItem, ParsedURL, AutoSkipSeconds
} from './typings';
import apiKeys from '../shared/api'

const [apiKey] = apiKeys;

let settings: SettingsManager;
let ads: AdManager;

class SettingsManager {
    whitelist: Channels;
    blacklist: Channels;
    mutelist: Channels;
    exclude: Channels;
    muteAll: boolean;
    skipOverlays: boolean;
    skipAdErrors: boolean;
    pauseAfterAd: boolean;
    autoWhite: boolean;
    autoSkip: boolean;
    autoSkipSeconds: AutoSkipSeconds;
    verifyWl: boolean;
    constructor(settings: Settings) {
        settings = SettingsManager.sanitizeSettings(settings);
        this.whitelist = new Channels(settings.whitelisted);
        this.blacklist = new Channels(settings.blacklisted);
        this.exclude = new Channels(settings.exclude);
        this.mutelist = new Channels(settings.muted);
        this.muteAll = settings.muteAll
        this.skipOverlays = settings.skipOverlays;
        this.skipAdErrors = settings.skipAdErrors;
        this.pauseAfterAd = settings.pauseAfterAd;
        this.autoWhite = settings.autoWhite;
        this.verifyWl = settings.verifyWl;
    }

    static sanitizeSettings(settings?: Settings): Settings {
        settings = settings || {} as Settings;

        if (!settings.whitelisted) settings.whitelisted = [];
        if (!settings.blacklisted) settings.blacklisted = [];
        if (!settings.muted) settings.muted = [];
        if (!settings.exclude) settings.exclude = [];

        settings.muteAll = !!settings.muteAll;
        settings.pauseAfterAd = !!settings.pauseAfterAd;
        settings.autoWhite = !!settings.autoWhite;
        settings.skipOverlays = settings.skipOverlays === undefined ? true : !!settings.skipOverlays;
        settings.skipAdErrors = settings.skipAdErrors === undefined ? true : !!settings.skipAdErrors;
        settings.autoSkip = !!settings.autoSkip
        settings.autoSkipSeconds = settings.autoSkipSeconds || 30;
        settings.verifyWl = settings.verifyWl === undefined ? true : !!settings.verifyWl;

        return settings;
    }
    // The reason for this complexity is that chrome.storage.sync
    // has a storage limit of about 8k bytes per item
    // And an overall storage limit of 100k bytes.
    // With raw JSON, you quickly start running into problems if you try to import subscriptions
    // The solution is to both compress JSON-serialized settings, and to split it into multiple items

    static getSettings(): Promise<Settings> {
        return browser.storage.sync.get(null).then(store => {
            if (store.algorithm === 'lz' && store.totalKeys) {
                let compressedStr = '';
                for (let i = 0; i < store.totalKeys; i++) {
                    compressedStr += store['lz_' + i];
                }

                try {
                    const decompressed = decompressFromBase64(compressedStr)
                    const parsed = JSON.parse(decompressed) as Settings;
                    return parsed;
                } catch (e) {
                    return {} as Settings;
                }
            } else {
                return (store || {}) as any as Settings; // not encrypted
            }

        })
    }
    updateAll(originTab: browser.tabs.Tab) {
        browser.tabs.query({})
            .then(tabs => tabs
                .filter(({ id }) => id !== undefined) // we don't want popup.html
                .forEach(({ id }) => {
                    const isOrigin: boolean = !!(originTab && originTab.id === id);
                    browser.tabs.sendMessage(id, { action: 'update', settings: settings.get(), initiator: isOrigin })
                        .catch(() => { });
                })
            );
    }
    highlightTab(originTab: browser.tabs.Tab) {
        browser.tabs.query({})
            .then(tabs => {
                const current = tabs.find(({ active }) => active);
                if (!current) throw "No current tab";
                (browser.tabs as any).highlight({ tabs: [current.index, originTab.index] });
            })
            .catch(error => console.error("Unable to highlight tab:", error));
    }
    static injectAll() {
        browser.tabs.query({})
            .then(tabs => tabs
                .forEach(tab => browser.tabs.executeScript(tab.id, { file: 'content.js' })
                    .catch(err => { })));
    }

    toggleMuteAll(on: boolean) {
        this.muteAll = !!on;
    }
    toggleAutoWhite(on: boolean) {
        this.autoWhite = !!on;
    }
    toggleSkipOverlays(on: boolean) {
        this.skipOverlays = !!on;
    }
    toggleSkipAdErrors(on: boolean) {
        this.skipAdErrors = !!on;
    }
    togglePauseAfterAd(on: boolean) {
        this.pauseAfterAd = !!on;
    }
    toggleVerifyWl(on: boolean){
        this.verifyWl= !!on;
    }
    toggleAutoSkip(on: boolean, seconds: AutoSkipSeconds){
        this.autoSkip = !!on;
        this.autoSkipSeconds = seconds === undefined ? 30 : ~~seconds as AutoSkipSeconds;
    }
    get(): Settings {
        return {
            whitelisted: this.whitelist.get(),
            blacklisted: this.blacklist.get(),
            muted: this.mutelist.get(),
            exclude: this.exclude.get(),
            muteAll: this.muteAll,
            skipOverlays: this.skipOverlays,
            skipAdErrors: this.skipAdErrors,
            pauseAfterAd: this.pauseAfterAd,
            autoWhite: this.autoWhite,
            autoSkip: this.autoSkip,
            autoSkipSeconds: this.autoSkipSeconds,
            verifyWl: this.verifyWl
        };
    }
    getCompressed(): any {
        const compressed = compressToBase64(JSON.stringify(this.get()));
        const max = 8192 / 2;
        const times = Math.ceil(compressed.length / max);
        const store = {} as any;

        for (let i = 0; i < times; i++) {
            store['lz_' + i] = compressed.substring(i * max, (i + 1) * max);

        }
        store.algorithm = 'lz';
        store.totalKeys = times;

        return store;
    }
    async save() {
        const compressed = this.getCompressed();
        const keys = Object.keys(compressed);

        await browser.storage.sync.clear();

        for (let key of keys) {
            const t = {} as any;
            t[key] = compressed[key];
            await browser.storage.sync.set(t);
        }
    }
}

class Channels {
    private list: ChannelList;
    constructor(list: ChannelList) {
        this.list = list.filter(channel => this.is(channel));
    }
    contains(id: string): boolean {
        return this.list.findIndex(channel => channel.id === id) !== -1;
    }
    is(channel: Channel): channel is Channel {
        return !!channel
            && typeof channel === 'object'
            && typeof channel.id === 'string'
            && typeof channel.username === 'string'
            && typeof channel.display === 'string'
    }
    remove(channels: Array<string> | string): number {
        const curCount = this.list.length;
        const nextList = this.list.filter(({ id }) => channels instanceof Array
            ? channels.indexOf(id) === -1
            : id !== channels);
        this.list = nextList;
        return nextList.length - curCount;
    }
    add(channelId: Channel): boolean {
        if (this.is(channelId) && !this.contains(channelId.id)) {
            this.list = this.list.concat(channelId);
            return true;
        }
        return false;
    }
    get(): ChannelList {
        return this.list;
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
        ad.title = typeof ad.title === 'string'
            ? ad.title
            : this.extractTitle(ad.player_response);
        // minimize memory consumption by removing unneeded data for all but most recent ad
        this.ads = arrayTrim(this.ads, 20)
            .map(oldAd => this.trim(oldAd))
            .concat(ad);
    }
    trim(ad: Ad): Ad {
        const nextAd = cloneObject(ad);
        const filter = ["details",
            "channelId",
            "video_id",
            "channel_url",
            "length_seconds",
            "ucid",
            "author",
            "blocked",
            "title",
            "timestamp"];

        Object.keys(nextAd)
            .forEach(key => filter.indexOf(key) === -1 && delete nextAd[key]);
        return nextAd;
    }
    private extractTitle(playerResponse: string): string {
        if (!playerResponse) return '';
        try {
            const response = JSON.parse(playerResponse);
            if (response.videoDetails && response.videoDetails.title)
                return response.videoDetails.title;
            return '';
        } catch (e) {
            return '';
        }
    }
    queue(details: any): [(ad: Ad) => any, (error: any) => any] {
        let resolver, rejector;

        const promise = new Promise<Ad>((resolve, reject) => {
            resolver = resolve;
            rejector = reject;
        });

        this.pending = this.pending.concat({ details, promise });

        promise
            .then((ad: Ad) => {
                this.pending = this.pending.filter(item => promise !== item.promise);
                this.push(ad);
                this.sendToTab(ad.details.tabId, ad);
            })
            .catch(ad => {
                this.pending = this.pending.filter(item => promise !== item.promise);
                console.error('No UCID available', ad);
            });

        return [resolver, rejector];
    }

    get(): Promise<Array<Ad>> {
        const pending = this.pending.map(({ promise }) => promise);

        return Promise.all(pending)
            .then(() => this.ads);
    }

    sendToTab(tabId: number, ad: Ad) {
        browser.tabs.query({})
            .then(tabs => tabs.some(({ id }) => id === tabId
                && browser.tabs.sendMessage(id, { action: 'ad-update', ad: ad })));
    }

    getLastAdFromTab(tabId: number): Promise<Ad> {
        const pending = this.pending.find(({ details }) => details.tabId === tabId);
        if (pending) return pending.promise;

        const ad = this.ads.find(({ details }) => details.tabId === tabId);
        if (ad) return Promise.resolve(ad);

        return Promise.reject();
    }

    findChannelFromPreviousAd(id: string): Channel {
        const ad = this.ads.find(item => item.channelId.id === id);

        if (ad) {
            return ad.channelId;
        }
    }

    findPrevAdByVideoId(videoId: string): Ad {
        return this.ads.find(({ video_id }) => video_id === videoId);
    }

    fetchChannelTitle(id: string): Promise<string> {
        if (this.apiAvailable) {
            // if user enabled the gAPI permission, use it because its 80% faster
            const url = 'https://content.googleapis.com'
                + '/youtube/v3/channels?part=snippet&id='
                + id
                + '&key='
                + apiKey;
            return fetch(url)
                .then(response => response.json())
                .then(json => {
                    if (json
                        && json.items
                        && json.items.length
                        && json.items[0].snippet
                        && json.items[0].snippet.title) {
                        return json.items[0].snippet.title;
                    } else {
                        return id;
                    }
                })
                .catch(err => {
                    console.error(err);
                    return id;
                })
        } else {
            return fetch('https://www.youtube.com/channel/' + id)
                .then(response => response.text())
                .then(text => {
                    const matches = text.match(/\<meta name=\"title\" content=\"(.+)\"\>/);
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
        if (!url) return '';

        const matches = url.match(/\/channel\/([\w-]+)(?:\/|$|\?)/);

        if (matches && matches[1])
            return matches[1];
        else
            return "";
    }

    parseURL(url: string): ParsedURL {
        const params = {} as any;
        const queryStart = url.indexOf('?');
        // read from the last instance of "/" until the "?" query marker
        const pathname = url.substring(url.lastIndexOf('/', queryStart), queryStart)
        const queries = new URLSearchParams(url.substring(queryStart + 1));

        for (const [key, value] of queries.entries()) {
            params[key] = value;
        }

        return {
            pathname: pathname,
            params: params
        };
    }
    checkPermissions() {
        const neededPerms = { origins: ['*://*.content.googleapis.com/'] };
        return browser.permissions.contains(neededPerms)
            .then((granted: boolean) => this.apiAvailable = granted);
    }
}

SettingsManager.getSettings()
    .then((_settings: Settings) => {
        settings = new SettingsManager(_settings);
        ads = new AdManager();
        const listener = new MessageListener();

        listener.onAction('set')
            .on('add-white', (_, channelId: Channel) => settings.whitelist.add(channelId))
            .on('add-black', (_, channelId: Channel) => settings.blacklist.add(channelId))
            .on('add-mute', (_, channelId: Channel) => settings.mutelist.add(channelId))
            .on('add-exclude', (_, channelId: Channel) => settings.exclude.add(channelId))
            .on('remove-exclude', (_, channel: Channel | Array<string>) =>
                settings.exclude.remove(channel instanceof Array ? channel : channel.id))
            .on('remove-mute', (_, channel: Channel | Array<string>) =>
                settings.mutelist.remove(channel instanceof Array ? channel : channel.id))
            .on('remove-white', (_, channel: Channel | Array<string>) =>
                settings.whitelist.remove(channel instanceof Array ? channel : channel.id))
            .on('remove-black', (_, channel: Channel | Array<string>) =>
                settings.blacklist.remove(channel instanceof Array ? channel : channel.id))
            .on('bulk', (_, nextSettings: Settings) => settings = new SettingsManager(nextSettings))
            .on('reset', () => settings = new SettingsManager({} as Settings))
            .on('mute-all', (_, shouldMute) => settings.toggleMuteAll(shouldMute))
            .on('auto-whitelist', (_, shouldAutoWhite) => settings.toggleAutoWhite(shouldAutoWhite))
            .on('skip-overlays', (_, shouldSkip) => settings.toggleSkipOverlays(shouldSkip))
            .on('skip-ad-errors', (_, shouldSkip) => settings.toggleSkipAdErrors(shouldSkip))
            .on('pause-after-ad', (_, shouldPause) => settings.togglePauseAfterAd(shouldPause))
            .on('auto-skip', (_, {autoSkip, autoSkipSeconds}) => settings.toggleAutoSkip(autoSkip, autoSkipSeconds))
            .on('verify-wl', (_, shouldVerify) => settings.toggleVerifyWl(shouldVerify))
            .onAll(sender => {
                settings.save();
                settings.updateAll(sender.tab);
                return settings.get();
            });

        listener.onAction('get')
            .on('settings', () => settings.get())
            .on('ads', () => ads.get());

        listener.onAction('tab')
            .on('settings', (sender, tab) =>
                browser.tabs.create({
                    url: browser.runtime.getURL('settings.html') + (tab ? '#' + tab : ''),
                    active: true
                })
                    .then(() => browser.tabs.remove(sender.tab.id)))
            .on('mute', (sender, shouldMute: boolean) => browser.tabs.update(sender.tab.id, { muted: shouldMute }))
            .on('last-ad', sender => ads.getLastAdFromTab(sender.tab.id))
            .on('highlight', sender => settings.highlightTab(sender.tab));

        listener.onAction('permission')
            .on('google-api', () => ads.checkPermissions());

        listener.start();

        browser.webRequest.onBeforeSendHeaders.addListener(details => {
            if (details.tabId === -1) return; //probably came from an extension, which we don't want to process

            let request = new XMLHttpRequest();
            let url = ads.parseURL(details.url);
            let ad: Ad = {};
            let [done, failed] = ads.queue(details);
            let shouldCancel = false;
            let gotChannelTitle;

            if (url.pathname === '/get_video_info' && url.params.video_id) {
                let prevAd = ads.findPrevAdByVideoId(url.params.video_id);

                if (prevAd) { // at this point, all we have is the vID, no channel information, unless we've seen this specific vid before
                    if (settings.blacklist.contains(prevAd.channelId.id)) {
                        shouldCancel = true;
                    }

                    ad = cloneObject(prevAd);
                    ad.timestamp = Date.now() + '';
                    gotChannelTitle = Promise.resolve();
                } else { //get more information by accessing the url ourselves
                    request.open('GET', details.url, false);  // `false` makes the request synchronous
                    request.send(null);

                    if (request.status === 200) {
                        ad = ads.parseURL('?' + request.responseText).params;

                        ad.channelId = {
                            id: ad.ucid || ads.getChannelFromURL(ad.channel_url),
                            display: '',
                            username: ''
                        };

                        if (ad.channelId.id) {
                            if (settings.blacklist.contains(ad.channelId.id)) {
                                shouldCancel = true;
                            }

                            if (ad.author) {
                                ad.channelId.display = ad.author;
                                gotChannelTitle = Promise.resolve();
                            } else { // sometimes channel name is not available with request, and we need to fetch ourselves
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
                ad.video_id = url.params.video_id;
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
                failed('Invalid request: ' + url);
            }

            return { cancel: shouldCancel };

        }, { urls: ['*://www.youtube.com/get_video_info?*'] }, ['blocking'])
    });

SettingsManager.injectAll();

if (Development && Development.detectedDevMode()) { // set to false in production builds
    const started = Date.now();
    const client = new Development();

    client
        .on('reload', () => {
            client.close();
            browser.runtime.reload();
        })
        .on('partialreload', () => {
            SettingsManager.injectAll();
            console.log('Re-injected scripts');
        })
    client.connect();

    (window as any).dev = (() => client.originalLog('Started', (Date.now() - started) / 60000, 'minutes ago')) as any;
    console.log('[', started, ']: Development mode');
}

function cloneObject<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

function arrayTrim<T>(array: Array<T>, max: number): Array<T> {
    return array.slice(Math.max(array.length - max, 0), array.length)
}

function pushTrim<T>(array: T[], item: T, max: number): T[] {
    const arr = arrayTrim(array, max - 1);
    arr.push(item);
    return arr;
}