import browser from './browser';
import MessageAgent from './agent';

// This content script is to act as a messaging bus between
// the locally-injected script which contains the main code
// and the background script.

class InjectHook {
    queue: Array<any>;
    firstRun: Promise<any>;

    ready: boolean;
    head: HTMLElement;
    jsFile: HTMLScriptElement;
    cssFile: HTMLLinkElement;

    constructor(insertLocation = document.documentElement) {
        this.onBrowserMessage = this.onBrowserMessage.bind(this);
        this.getSettings = this.getSettings.bind(this);
        this.destroy = this.destroy.bind(this);

        this.queue = [];
        this.ready = false;
        this.head = insertLocation;
        this.firstRun = this.retrieveSettings();

        this.jsFile = (() => {
            let el = document.createElement('script');
            el.setAttribute('type', 'text/javascript');
            el.setAttribute('src', browser.runtime.getURL('userscript.js'));
            return el;
        })()
        this.cssFile = (() => {
            let el = document.createElement('link');
            el.setAttribute('rel', 'stylesheet');
            el.setAttribute('type', 'text/css');
            el.setAttribute('href', browser.runtime.getURL('userscript.css'));
            return el;
        })()

        browser.runtime.onMessage.addListener(this.onBrowserMessage);
    }

    onBrowserMessage(message: any) {
        if (!this.ready) {
            this.queue.push(message);
            console.log('pushing to queue');
        } else {
            this.parseMessage(message);
        }
    }
    parseMessage(message: any) {
        if (message.action === 'update') {
            agent.send('settings-update', { settings: message.settings, initiator: message.initiator });
        } else if (message.action === 'ad-update') {
            agent.send('ad-update', message.ad);
        } else if (message.action === 'subscriptions-update') {
            agent.send('subscriptions-update', { subscriptions: message.subscriptions, initiator: message.initiator });
        } else if (message.action === 'toggle-basic') {
            const turnOn = message.on;
            browser.cookies.get({ url: 'youtube.com', name: 'f6' })
                .then(cookie => console.log(cookie))
                .catch(err => console.error('hey', err))
        }
    }
    pushPending() {
        for (let pending of this.queue) {
            this.parseMessage(pending);
        }
    }
    retrieveSettings() {
        return browser.runtime.sendMessage({ action: 'get', subaction: 'settings+subs' }).then((message: any) => {
            if (message.error) throw message.error;

            return {
                settings: message.response.settings,
                subscriptions: message.response.subscriptions,
                accessURLs: {
                    ICO: browser.runtime.getURL('img/icon_16.png')
                },
                i18n: {
                    adOptionsDefaultTooltip: browser.i18n.getMessage('adOptionsDefaultTooltip'),
                    adOptionsTooltip: browser.i18n.getMessage('adOptionsTooltip', '$1$'),
                    removeMuteBtn: browser.i18n.getMessage('removeMuteBtn'),
                    removeMuteTooltip: browser.i18n.getMessage("removeMuteTooltip"),
                    adsStillBlocked: browser.i18n.getMessage('adsStillBlocked'),
                    whitelistTooltip: browser.i18n.getMessage('whitelistTooltip'),
                    whitelistedTooltip: browser.i18n.getMessage('whitelistedTooltip'),
                    muteBtn: browser.i18n.getMessage('muteBtn'),
                    blacklistAdvertiserTooltip: browser.i18n.getMessage('blacklistAdvertiserTooltip'),
                    muteAdvertiserTooltip: browser.i18n.getMessage('muteAdvertiserTooltip'),
                    adsEnableBtn: browser.i18n.getMessage('adsEnableBtn'),
                    blacklistBtn: browser.i18n.getMessage('blacklistBtn'),
                    skipBtn: browser.i18n.getMessage('skipBtn'),
                    skipTooltip: browser.i18n.getMessage('skipTooltip'),
                    pauseAfterAdBtn: browser.i18n.getMessage('pauseAfterAdBtn'),
                    pauseAfterAdTooltip: browser.i18n.getMessage('pauseAfterAdTooltip'),
                    cancelPauseAfterAdBtn: browser.i18n.getMessage('cancelPauseAfterAdBtn'),
                    cancelPauseAfterAdTooltip: browser.i18n.getMessage('cancelPauseAfterAdTooltip')
                }
            }
        })
    }
    getSettings() {
        if (this.firstRun) {
            let promise = this.firstRun;
            this.firstRun = null;
            return promise;
        } else {
            return this.retrieveSettings();
        }
    }
    inject() {
        // inject main script
        this.head.appendChild(this.cssFile);

        // styling for whitelist button, blacklist button, etc.
        this.head.appendChild(this.jsFile);
    }
    destroy() {
        this.cssFile.disabled = true;
        this.head.removeChild(this.cssFile);
        this.head.removeChild(this.jsFile);
        browser.runtime.onMessage.removeListener(hook.onBrowserMessage);
    }
}
const hookReload = () => {
    const instance = Math.random();
    window.dispatchEvent(new CustomEvent('uBOWL-destroy', { detail: instance })); // signal to any pre-existing instances that they should unload

    const unloader = (event: CustomEvent) => {
        if (event.detail === instance) return;
        console.log('Unloading uBOWL..');

        window.removeEventListener('uBOWL-destroy', unloader);
        agent.send('destroy');
        hook.destroy();
        agent.destroy();

        // adwatcher.destroy();
    }
    window.addEventListener('uBOWL-destroy', unloader);
}
const reflectURLFlag = (url: string, shouldContain: boolean): string => {
    // take url, return url with flags removed if add is off
    // return url with flags added if add is on
    let search = /((?!\?)igno=re&disableadblock=1&?)|(&disableadblock=1)/g

    if (shouldContain) {
        url = reflectURLFlag(url, false); // remove first, then add
        let paramsStart = url.indexOf('?');
        return url + (paramsStart === -1 ? '?igno=re' : (paramsStart === url.length - 1 ? 'igno=re' : '')) + '&disableadblock=1'

    } else {
        return url.replace(search, '');
    }
}
const finishedLoading = document.readyState === 'complete' || document.readyState === 'interactive';
if (location.pathname === "/ubo-yt") {
    const allowed = ['whitelist', 'ads', 'misc'];
    const tab = allowed.find(tab => '#' + tab === location.hash.toLowerCase()) || '';

    browser.runtime.sendMessage({ action: 'tab', subaction: 'settings', param: tab });
} else if (!finishedLoading && location.href.indexOf('&disableadblock=1') === -1) {
    // first load should contain flag to prevent new uBO rules from removing important metadata

    // window.history.replaceState(null, null, reflectURLFlag(location.href, true));
    // window.location.reload();
}

const agent = new MessageAgent('uBOWL-message', true); // My postMessage wrapper, to communicate with our injected script
const hook = new InjectHook(document.documentElement);

const intermediary = (
    action: string,
    subaction: string,
    param?: any) => browser.runtime.sendMessage({ action, subaction, param })
        .then((response: any) => {
            if (response.error) throw response.error;
            delete response.error;
            return response;
        });

agent
    .on('ready', () => {
        hook.ready = true;
        hook.pushPending();
    })
    .on('get-settings', () => hook.getSettings())
    .on('set-settings', ({ type, param }) => intermediary('set', type, param))
    .on('cache', ({ type, param }) => intermediary('cache', type, param))
    .on('recent-ad', () => intermediary('tab', 'last-ad'))
    .on('echo-ad', ad => intermediary('tab', 'echo-ad', ad))
    .on('mute-tab', (shouldMute: boolean) => intermediary('tab', 'mute', shouldMute || false))
    .on('highlight-tab', () => intermediary('tab', 'highlight'));

hookReload();
hook.inject();
