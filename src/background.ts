import browser from './browser';
import Development from './dev-client'
import MessageListener from './ext-agent';
import { compressToBase64, decompressFromBase64 } from 'lz-string';
import {
    Channel, ChannelList, Settings,
    Ad, PendingItem, ParsedURL
} from './typings';

let settings: SettingsManager;
let ads: AdManager;

class SettingsManager {
    whitelist: Channels;
    blacklist: Channels;
    mutelist: Channels;
    muteAll: boolean;
    skipOverlays: boolean;

    constructor(settings: Settings) {
        if (!settings) settings = {} as Settings;
        if (!settings.whitelisted) settings.whitelisted = [];
        if (!settings.blacklisted) settings.blacklisted = [];
        if (!settings.muted) settings.muted = [];
        if (!settings.muteAll) settings.muteAll = false;
        if (settings.skipOverlays === undefined) settings.skipOverlays = true;

        this.whitelist = new Channels(settings.whitelisted);
        this.blacklist = new Channels(settings.blacklisted);
        this.mutelist = new Channels(settings.muted);
        this.muteAll = settings.muteAll
        this.skipOverlays = settings.skipOverlays;
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
        browser.tabs.query({}).then((tabs: Array<browser.tabs.Tab>) => {
            for (let tab of tabs) {
                const origin = (originTab && originTab.id === tab.id) || false;
                browser.tabs.sendMessage(tab.id, { action: 'update', settings: settings.get(), initiator: origin })
                    .then((response?: any) => {
                        //console.log(response);
                    })
                    .catch(() => { });
            }
        });
    }

    static injectAll() {
        browser.tabs.query({}).then((tabs: any) => {
            for (let tab of tabs) {
                browser.tabs.executeScript(tab.id, { file: 'content.js' }).then(result => { }).catch(err => { })
            }
        });
    }

    toggleMuteAll(on: boolean) {
        this.muteAll = !!on;
    }
    toggleSkipOverlays(on: boolean) {
        this.skipOverlays = !!on;
    }
    get(): Settings {
        return {
            whitelisted: this.whitelist.get(),
            blacklisted: this.blacklist.get(),
            muted: this.mutelist.get(),
            muteAll: this.muteAll,
            skipOverlays: this.skipOverlays
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
    list: ChannelList;
    constructor(list: ChannelList) {
        this.list = list;
    }
    has(id: string): number {
        for (let index in this.list) {
            if (this.list[index].id === id)
                return ~~index;
        }
        return -1;
    }
    remove(channels: Array<string> | string): number {
        if (channels instanceof Array) {
            let i = -1;
            channels.forEach(id => i = i + this._remove(id));
            return i
        } else {
            return this._remove(channels);
        }
    }
    private _remove(id: string): number {
        let i = -1;
        let removeCount = 0;

        while ((i = this.has(id)) !== -1) {
            this.list.splice(i, 1);
            removeCount++;
        }
        return removeCount;
    }

    add(channelId: Channel): boolean {
        if (this.has(channelId.id) === -1) {
            this.list.push(channelId);
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
        while (this.ads.length > 20) {
            this.ads.shift(); // just trim a little off the top fam
        }
        this.ads.push(ad);
    }

    queue(details: any): Array<Function> {
        let resolver, rejector;

        let promise = new Promise<Ad>((resolve, reject) => {
            resolver = resolve;
            rejector = reject;
        });

        this.pending.push({ details: details, promise: promise });

        promise.then((ad: Ad) => {
            this.pending.splice(this.pending.findIndex(item => promise === item.promise), 1)
            this.push(ad);
            this.sendToTab(ad.details.tabId, ad);
        }).catch(ad => {
            console.error('No UCID available', ad)
        });

        return [resolver, rejector];
    }

    get(): Promise<Array<Ad>> {
        const promises = this.pending.map(ad => ad.promise);
        return Promise.all(promises).then(() => this.ads);
    }

    sendToTab(tabId: number, ad: Ad) {
        browser.tabs.query({}).then((tabs: Array<browser.tabs.Tab>) => {
            for (let tab of tabs) {
                if (tab.id !== tabId) continue;
                browser.tabs.sendMessage(tab.id, { action: 'ad-update', ad: ad })
                    .then((response?: any) => { });
                return;
            }
        });
    }

    getLastAdFromTab(tabId: number): Promise<Ad> {
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

    findChannelFromPreviousAd(id: string): Channel {
        let ad = this.ads.find(item => item.channelId.id === id);

        if (ad) {
            return ad.channelId;
        }
    }

    findPrevAdByVideoId(videoId: string): Ad {
        for (let ad of this.ads) {
            if (ad.video_id === videoId) {
                return ad;
            }
        }
    }

    fetchChannelTitle(id: string): Promise<string> {
        if (this.apiAvailable) {
            // if user enabled the gAPI permission, use it because its 80% faster
            return fetch('https://content.googleapis.com/youtube/v3/channels?part=snippet&id=' + id + '&key=AIzaSyCPqJiD5cXWMilMdzmu4cvm8MjJuJsbYIo')
                .then(response => response.json())
                .then(json => {
                    if (json && json.items && json.items.length && json.items[0].snippet && json.items[0].snippet.title) {
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

    getChannelFromURL(url: string): string {
        if (!url) return '';

        let matches = url.match(/\/channel\/([\w-]+)(?:\/|$|\?)/);

        if (matches && matches[1])
            return matches[1];
        else
            return "";
    }

    parseURL(url: string): ParsedURL {
        let pathname;
        let params = {} as Ad;
        let queryStart = url.indexOf('?');
        // read from the last instance of "/" until the "?" query marker
        pathname = url.substring(url.lastIndexOf('/', queryStart), queryStart)
        let queries = new URLSearchParams(url.substring(queryStart + 1));

        for (let [key, value] of queries.entries()) {
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

SettingsManager.getSettings().then((_settings: Settings) => {
    settings = new SettingsManager(_settings);
    ads = new AdManager();
    const listener = new MessageListener();

    listener.onAction('set')
        .on('add-white', (_, channelId: Channel) => settings.whitelist.add(channelId))
        .on('add-black', (_, channelId: Channel) => settings.blacklist.add(channelId))
        .on('add-mute', (_, channelId: Channel) => settings.mutelist.add(channelId))
        .on('remove-mute', (_, channel: Channel | Array<string>) =>
            settings.mutelist.remove(channel instanceof Array ? channel : channel.id))
        .on('remove-white', (_, channel: Channel | Array<string>) =>
            settings.whitelist.remove(channel instanceof Array ? channel : channel.id))
        .on('remove-black', (_, channel: Channel | Array<string>) =>
            settings.blacklist.remove(channel instanceof Array ? channel : channel.id))
        .on('bulk', (_, nextSettings: Settings) => settings = new SettingsManager(nextSettings))
        .on('reset', (_, __) => settings = new SettingsManager({} as Settings))
        .on('mute-all', (_, shouldMute) => settings.toggleMuteAll(shouldMute))
        .on('skip-overlays', (_, shouldSkip) => settings.toggleSkipOverlays(shouldSkip))
        .onAll((sender, _) => {
            settings.save();
            settings.updateAll(sender.tab);
            return settings.get();
        });

    listener.onAction('get')
        .on('settings', (_, __) => settings.get())
        .on('ads', (_, __) => ads.get());

    listener.onAction('tab')
        .on('settings', (sender, tab) =>
            browser.tabs.create({
                url: browser.runtime.getURL('settings.html') + (tab ? '#' + tab : ''),
                active: true
            })
                .then(() => browser.tabs.remove(sender.tab.id)))
        .on('mute', (sender, shouldMute: boolean) => browser.tabs.update(sender.tab.id, { muted: shouldMute }))
        .on('last-ad', (sender, _) => ads.getLastAdFromTab(sender.tab.id));

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
                if (settings.blacklist.has(prevAd.channelId.id) !== -1) {
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
                        if (settings.blacklist.has(ad.channelId.id) !== -1) {
                            shouldCancel = true;
                        }

                        if (ad.author) {
                            ad.channelId.display = ad.author;
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
