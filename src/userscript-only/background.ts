import {
    Channel, ChannelList, Settings,
    Ad, PendingItem, ParsedURL, AutoSkipSeconds
} from '../typings';
import 'greasemonkey'

/**
 * This will be a fake background.js for our webextension turned-userscript
 * Currently not functional
 */
const defaultSettings = (): Settings<Channels> => Object.freeze({
    blacklisted: new Channels([]),
    whitelisted: new Channels([]),
    muted: new Channels([]),
    exclude: new Channels([]),
    muteAll: false,
    skipOverlays: true,
    skipAdErrors: true,
    pauseAfterAd: false,
    keyboardSkip: true,
    autoWhite: false,
    autoSkip: false,
    autoSkipSeconds: 30,
    verifyWl: true,
    limitAds: false,
    limitAdsQty: 2,
    forceWhite: false
})
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

const settingsToJSON = (settings: Settings<Channels>): Settings<Array<Channel>> => {
    return {
        ...settings, blacklisted: settings.blacklisted.get(),
        whitelisted: settings.whitelisted.get(),
        muted: settings.muted.get(),
        exclude: settings.exclude.get()
    }
}


interface ExtEvent {
    action: string,
    subaction: string;
    fn: (sender: number, item: any) => Promise<any> | any;
}

class MessageHandler {
    events: Array<ExtEvent>;
    on: (subaction: string, fn: ExtEvent['fn']) => this;
    onAll: (fn: ExtEvent['fn']) => this;
    instance: number;
    constructor() {
        this.events = [];
        this.instance = Math.random();
    }
    private _on(action: string, subaction: string, fn: ExtEvent['fn']): this {
        this.events.push({ action, subaction, fn });
        return this;
    }
    onAction(action: string): this {
        this.on = this._on.bind(this, action);
        this.onAll = this._on.bind(this, action, undefined);
        return this
    }
    message(action: string, subaction: string, param: any): Promise<any> {
        const events = this.events.filter(({ action: _action, subaction: _subaction }) => action === _action
            && (!subaction || subaction === _subaction));

        if (events.length) {
            let ret: any | Promise<any>;
            try {
                ret = events.reduce((prevRet, { fn }) => fn(this.instance, prevRet), param);
            } catch (error) {
                return Promise.resolve({ error });
            }

            if (ret instanceof Promise) {
                return ret
                    .then(response => ({ error: '', response }))
                    .catch(error => ({ error }));
            } else {
                return Promise.resolve({ error: '', response: ret || {} })
            }
        } else {
            return Promise.resolve({ error: 'Event not found' });
        }

    }
}


export class FauxBackground {
    private settings: Settings<Channels>;
    private handler: MessageHandler;
    constructor() {
        this.handler = new MessageHandler();
        this.settings = defaultSettings();
    }
    async start(): Promise<void> {
        this.settings = await this.asyncGetSettings();
    }
    userMessage<T = any>(action: string, subaction: string, param: T) {

        this.handler.onAction('set')
            .on('add-white', (_, channelId: Channel) => this.settings.whitelisted.add(channelId))
            .on('add-black', (_, channelId: Channel) => this.settings.blacklisted.add(channelId))
            .on('add-mute', (_, channelId: Channel) => this.settings.muted.add(channelId))
            .on('add-exclude', (_, channelId: Channel) => this.settings.exclude.add(channelId))
            .on('remove-exclude', (_, channel: Channel | Array<string>) =>
                this.settings.exclude.remove(channel instanceof Array ? channel : channel.id))
            .on('remove-mute', (_, channel: Channel | Array<string>) =>
                this.settings.muted.remove(channel instanceof Array ? channel : channel.id))
            .on('remove-white', (_, channel: Channel | Array<string>) =>
                this.settings.whitelisted.remove(channel instanceof Array ? channel : channel.id))
            .on('remove-black', (_, channel: Channel | Array<string>) =>
                this.settings.blacklisted.remove(channel instanceof Array ? channel : channel.id))
            .on('reset', () => settings = new SettingsManager({} as Settings, []))
            .on('mute-all', (_, shouldMute) => settings.toggleMuteAll(shouldMute))
            .on('auto-whitelist', (_, shouldAutoWhite) => settings.toggleAutoWhite(shouldAutoWhite))
            .on('skip-overlays', (_, shouldSkip) => settings.toggleSkipOverlays(shouldSkip))
            .on('skip-ad-errors', (_, shouldSkip) => settings.toggleSkipAdErrors(shouldSkip))
            .on('pause-after-ad', (_, shouldPause) => settings.togglePauseAfterAd(shouldPause))
            .on('auto-skip', (_, { autoSkip, autoSkipSeconds }) => settings.toggleAutoSkip(autoSkip, autoSkipSeconds))
            .on('limit-ads', (_, { limitAds, limitAdsQty }) => settings.toggleLimitAds(limitAds, limitAdsQty))
            .on('keyboard-skip', (_, nextKeyboardSkip) => settings.toggleKeyboardSkip(nextKeyboardSkip))
            .on('verify-wl', (_, shouldVerify) => settings.toggleVerifyWl(shouldVerify))
            .on('force-wl', (_, shouldForce) => settings.toggleForceWl(shouldForce))
            .onAll(sender => {
                settings.save();
                settings.updateAll(sender.tab);
                return settings.get();
            });
        this.handler.onAction('get')
            .on('settings', () => settingsToJSON(this.settings))
            .on('settings+subs', () => ({ settings: settings.get(), subscriptions: settings.subscriptions.get() }))
            .on('ads', () => ads.get());

        this.handler.onAction('tab')
            .on('settings', (sender, tab) =>
                browser.tabs.create({
                    url: browser.runtime.getURL('settings.html') + (tab ? '#' + tab : ''),
                    active: true
                })
                    .then(() => browser.tabs.remove(sender.tab.id)))
            .on('mute', (sender, shouldMute: boolean) => browser.tabs.update(sender.tab.id, { muted: shouldMute }))
            .on('last-ad', sender => ads.getLastAdFromTab(sender.tab.id))
            .on('echo-ad', (sender, ad) => ads.echo(sender.tab.id, ad))
            .on('highlight', sender => settings.highlightTab(sender.tab));

        this.handler.onAction('permission')
            .on('google-api', () => ads.checkPermissions());
    }
    private async asyncGetSettings(): Promise<Settings<Channels>> {
        const currentSettingsStr = await GM.getValue('settings', '{}');
        const currentSettings = JSON.parse(currentSettingsStr) as Settings;
        const parsedCurrentSettings = {
            ...currentSettings, blacklisted: new Channels(currentSettings.blacklisted),
            whitelisted: new Channels(currentSettings.whitelisted),
            muted: new Channels(currentSettings.muted),
            exclude: new Channels(currentSettings.exclude),
        } as Settings<Channels>

        return { ...defaultSettings(), ...parsedCurrentSettings }
    }
    private addChannel(channel: Channel) {

    }
}