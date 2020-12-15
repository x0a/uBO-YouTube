import * as React from 'react';
import browser from '../browser';
import LocaleString from '../_locales/types';
import { HostMessage, ClientMessage, Settings, Channel, ChannelList } from '../typings';

type SettingsFn = (settings: Settings) => any;
type Confirm = (text: string, confirm?: boolean, danger?: boolean) => Promise<void>

let settingsListener: (settings: Settings) => any = () => { }; // basically a global variable since it will be available wherever imported
let suggestionsListener: (channels: Array<Channel>) => any = () => { };
const isPopup = browser.tabs.getCurrent().then(tab => tab === undefined);
const checkDev = browser.management.getSelf().then(self => self.installType === 'development');
const openTab = (url: string, active = true) => browser.tabs.create({ url, active });
const getExtURL = (path: string) => browser.runtime.getURL(path);
const onSettings = (fn: SettingsFn): SettingsFn => {
    settingsListener = fn;
    browser.runtime.onMessage.addListener((message: any) => {
        if (message.action === 'update') {
            settingsListener(message.settings);
        } else if (message.action === 'suggestions') {
            suggestionsListener(message.channels);
        }
    });
    return fn;
}
const onSuggestions = (fn: ((channels: Array<Channel>) => any)) => {
    suggestionsListener = fn;

}
const bMessage = (action: string, subaction: string, param?: any) => {
    return browser.runtime.sendMessage({ action, subaction, param } as HostMessage)
        .then((message: ClientMessage) => {
            if (message.error) throw message.error;
            return message.response;
        })
        .then(async (response) => {
            if (await isPopup && action === 'set') { // if this message was sent via popup, we will never receive it as a message because only tabs receive messages
                settingsListener(response as Settings);
            }
            return response;
        })
}
const getManifest = () => browser.runtime.getManifest();
const requestGooglePermission = () => {
    return browser.permissions.request({ origins: ['*://*.content.googleapis.com/'] })
        .then(() => bMessage('permission', 'google-api'))
}

const readJSONFile = (file: File): Promise<any> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', event => {
        try {
            const json = JSON.parse(reader.result as string);
            resolve(json);
        } catch (e) {
            reject(browser.i18n.getMessage('parseFailed'));
        }
    });
    reader.addEventListener('error', event => {
        reject(reader.error);
    })
    reader.readAsText(file.slice())
})
const defaultSettings = (): Settings => ({
    blacklisted: [],
    whitelisted: [],
    muted: [],
    exclude: [],
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
    limitAdsQty: 2
})
const isSettings = (prospect: any): prospect is Settings => {
    return typeof prospect === 'object'
        && (!prospect.whitelisted || prospect.whitelisted instanceof Array)
        && (!prospect.blacklisted || prospect.blacklisted instanceof Array)
        && (!prospect.muted || prospect.muted instanceof Array)
        && (!prospect.exclude || prospect.exclude instanceof Array)
        && (typeof prospect.skipOverlays === 'undefined' || typeof prospect.skipOverlays === 'boolean')
        && (typeof prospect.muteAll === 'undefined' || typeof prospect.muteAll === 'boolean')
        && (typeof prospect.skipAdErrors === 'undefined' || typeof prospect.skipAdErrors === 'boolean')
}
const isChannel = (prospect: any): prospect is Channel => {
    return !!prospect
        && typeof prospect === 'object'
        && typeof prospect.id === 'string'
        && typeof prospect.username === 'string'
        && typeof prospect.display === 'string';
}
const canonicalizeChannels = (list?: ChannelList): ChannelList => {
    return list instanceof Array
        ? list
            .filter(channel => isChannel(channel))
            .map(({ id, username, display }) => ({ id, username, display }))
        : []
}
const canonicalizeSettings = (prospect: Settings, defaults = defaultSettings()): Settings => {
    return {
        whitelisted: canonicalizeChannels(prospect.whitelisted),
        blacklisted: canonicalizeChannels(prospect.blacklisted),
        muted: canonicalizeChannels(prospect.muted),
        exclude: canonicalizeChannels(prospect.exclude),
        muteAll: prospect.muteAll === undefined ? defaults.muteAll : prospect.muteAll,
        skipOverlays: prospect.skipOverlays === undefined ? defaults.skipOverlays : prospect.skipOverlays,
        skipAdErrors: prospect.skipAdErrors === undefined ? defaults.skipAdErrors : prospect.skipAdErrors,
        pauseAfterAd: prospect.pauseAfterAd === undefined ? defaults.pauseAfterAd : prospect.pauseAfterAd,
        autoWhite: prospect.autoWhite === undefined ? defaults.autoWhite : prospect.autoWhite,
        autoSkip: prospect.autoSkip === undefined ? defaults.autoSkip : prospect.autoSkip,
        autoSkipSeconds: prospect.autoSkipSeconds === undefined ? defaults.autoSkipSeconds : prospect.autoSkipSeconds,
        keyboardSkip: prospect.keyboardSkip === undefined ? defaults.keyboardSkip : prospect.keyboardSkip,
        verifyWl: prospect.verifyWl === undefined ? defaults.verifyWl : prospect.verifyWl,
        limitAds: prospect.limitAds === undefined ? defaults.limitAds : prospect.limitAds,
        limitAdsQty: prospect.limitAdsQty === undefined ? defaults.limitAdsQty : prospect.limitAdsQty
    }
}

const diffList = (current: ChannelList, next: ChannelList): ChannelList => {
    return next.filter(channel => current.findIndex(_channel => _channel.id === channel.id) === -1);
}
const diffSettings = (current: Settings, next: Settings): Settings => {
    return {
        whitelisted: diffList(current.whitelisted, next.whitelisted),
        blacklisted: diffList(current.blacklisted, next.blacklisted),
        muted: diffList(current.muted, next.muted),
        exclude: diffList(current.exclude, next.exclude),
        muteAll: next.muteAll,
        skipOverlays: next.skipOverlays,
        skipAdErrors: next.skipAdErrors,
        pauseAfterAd: next.pauseAfterAd,
        autoWhite: next.autoWhite,
        autoSkip: next.autoSkip,
        autoSkipSeconds: next.autoSkipSeconds,
        keyboardSkip: next.keyboardSkip,
        verifyWl: next.verifyWl,
        limitAds: next.limitAds,
        limitAdsQty: next.limitAdsQty
    }
}
const mergeSettings = (current: Settings, next: Settings): Settings => {
    return {
        whitelisted: current.whitelisted.concat(next.whitelisted),
        blacklisted: current.blacklisted.concat(next.blacklisted),
        muted: current.muted.concat(next.muted),
        exclude: current.exclude.concat(next.exclude),
        muteAll: next.muteAll,
        skipOverlays: next.skipOverlays,
        skipAdErrors: next.skipAdErrors,
        pauseAfterAd: next.pauseAfterAd,
        autoWhite: next.autoWhite,
        autoSkip: next.autoSkip,
        autoSkipSeconds: next.autoSkipSeconds,
        keyboardSkip: next.keyboardSkip,
        verifyWl: next.verifyWl,
        limitAds: next.limitAds,
        limitAdsQty: next.limitAdsQty
    }
}
const settingsFromList = (list: ChannelList, exportKey: string) => ({
    [exportKey]: list
}) as any as Settings;
const fullHeader = (text: string) => <h4>{text}</h4>;
const popupHeader = (text: string) => <p className='font-weight-bold-sm font-size-6 text-center'>{text}</p>;
const i18n = (messageName: LocaleString, substitutions?: any | Array<any>) =>
    browser.i18n.getMessage(messageName, substitutions instanceof Array ? substitutions.map(i => i + '') : substitutions + '');
export {
    bMessage, Confirm, isSettings, canonicalizeSettings,
    diffSettings, diffList, readJSONFile, mergeSettings,
    fullHeader, popupHeader, onSettings, openTab, getExtURL,
    requestGooglePermission, i18n, getManifest, checkDev,
    defaultSettings, settingsFromList, onSuggestions
}