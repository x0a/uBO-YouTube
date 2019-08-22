import * as React from 'react';
import browser from '../browser';
import { HostMessage, ClientMessage, Settings, Channel, ChannelList } from '../typings';

let settingsListener: (settings: Settings) => any = () => { };
type SettingsFn = (settings: Settings) => any;

const isPopup = browser.tabs.getCurrent().then(tab => tab === undefined);
const checkDev = browser.management.getSelf().then(self => self.installType === 'development');
const openTab = (url: string) => browser.tabs.create({ url });
const getExtURL = (path: string) => browser.runtime.getURL(path);
const onSettings = (fn: SettingsFn): SettingsFn => {
    settingsListener = fn;
    browser.runtime.onMessage.addListener((message: any) => {
        if (message.action === 'update') {
            settingsListener(message.settings);
        }
    });
    return fn;
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

const isSettings = (prospect: any): prospect is Settings => {
    return typeof prospect === 'object'
        && (!prospect.whitelisted || prospect.whitelisted instanceof Array)
        && (!prospect.blacklisted || prospect.blacklisted instanceof Array)
        && (!prospect.muted || prospect.muted instanceof Array)
        && (typeof prospect.skipOverlays === 'undefined' || typeof prospect.skipOverlays === 'boolean')
        && (typeof prospect.muteAll === 'undefined' || typeof prospect.muteAll === 'boolean')
        && (typeof prospect.skipAdErrors === 'undefined' || typeof prospect.skipAdErrors === 'boolean')
}
const isChannel = (prospect: any): prospect is Channel => {
    return typeof prospect === 'object'
        && typeof prospect.id === 'string'
        && typeof prospect.username === 'string'
        && typeof prospect.display === 'string';
}
const cleanChannelList = (list?: ChannelList): ChannelList => {
    return list instanceof Array
        ? list.filter(channel => isChannel(channel))
            .map(({ id, username, display }) => ({ id, username, display }))
        : []
}
const cleanSettings = (prospect: Settings): Settings => {
    return {
        whitelisted: cleanChannelList(prospect.whitelisted),
        blacklisted: cleanChannelList(prospect.blacklisted),
        muted: cleanChannelList(prospect.muted),
        muteAll: prospect.muteAll === undefined ? false : prospect.muteAll,
        skipOverlays: prospect.skipOverlays === undefined ? true : prospect.skipOverlays,
        skipAdErrors: prospect.skipAdErrors === undefined ? true : prospect.skipAdErrors
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
        muteAll: next.muteAll,
        skipOverlays: next.skipOverlays,
        skipAdErrors: next.skipAdErrors
    }
}
const mergeSettings = (current: Settings, next: Settings): Settings => {
    return {
        whitelisted: current.whitelisted.concat(next.whitelisted),
        blacklisted: current.blacklisted.concat(next.blacklisted),
        muted: current.muted.concat(next.muted),
        muteAll: next.muteAll,
        skipOverlays: next.skipOverlays,
        skipAdErrors: next.skipAdErrors
    }
}
const fullHeader = (text: string) => <h4>{text}</h4>;
const popupHeader = (text: string) => <p className='font-weight-bold-sm font-size-6 text-center'>{text}</p>;
const i18n = (messageName: string, substitutions?: any | Array<any>) =>
    browser.i18n.getMessage(messageName, substitutions instanceof Array ? substitutions.map(i => i + '') : substitutions + '');

type Confirm = (text: string, confirm?: boolean, danger?: boolean) => Promise<void>
export {
    bMessage, Confirm, isSettings, cleanSettings,
    diffSettings, diffList, readJSONFile, mergeSettings,
    fullHeader, popupHeader, onSettings, openTab, getExtURL,
    requestGooglePermission, i18n, getManifest, checkDev
}