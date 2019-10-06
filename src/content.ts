import browser from './browser';
import MessageAgent from './agent';

// This content script is to act as a messaging bus between
// the locally-injected script which contains the main code
// and the background script.

class InitManager {
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
            el.setAttribute('src', browser.runtime.getURL('inject.js'));
            return el;
        })()
        this.cssFile = (() => {
            let el = document.createElement('link');
            el.setAttribute('rel', 'stylesheet');
            el.setAttribute('type', 'text/css');
            el.setAttribute('href', browser.runtime.getURL('inject.css'));
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
        }
    }
    pushPending() {
        for (let pending of this.queue) {
            this.parseMessage(pending);
        }
    }
    retrieveSettings() {
        return browser.runtime.sendMessage({ action: 'get', subaction: 'settings' }).then((message: any) => {
            if (message.error) throw message.error;

            return {
                settings: message.response,
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
        browser.runtime.onMessage.removeListener(init.onBrowserMessage);
    }
}

class AdWatcher {
    onReceiveSettings: Function;
    scriptWatcher: MutationObserver;
    payloadBeginning: string;
    payloadEnd: string;

    constructor(onReceiveSettings: (payload: any) => {}) {
        this.onReceiveSettings = onReceiveSettings;
        this.onScript = this.onScript.bind(this);

        if (!('onbeforescriptexecute' in document)) {
            this.scriptWatcher = this.polyfill();
        }

        document.addEventListener('beforescriptexecute', this.onScript);
    }

    onScript(event: CustomEvent) {
        // Events from our polyfill contain the target in event.detail
        // Native events contain the target in event.target.
        let script = event.detail || event.target;
        if (this.isCorrectScript(script)) {
            let code = script.textContent;
            let parent = script.parentElement;
            let videoData = this.extractData(code);

            event.preventDefault();

            if (videoData) {
                if (videoData.args && videoData.args.fflags) {
                    let payload = this.onReceiveSettings(videoData);
                    this.insertReplacement(parent, this.compilePayload(payload))
                } else {
                    console.log('Object missing data', videoData);
                }
            } else {
                console.log('Trouble parsing inline script tag:', event)
            }
        }
    }
    isCorrectScript(el: HTMLScriptElement) {
        const search = "skip";

        return el.parentElement && el.parentElement.id === 'player-wrap' &&
            el.id !== 'replacement' &&
            el.textContent.indexOf(search) !== -1;
    }
    compilePayload(object: any) {
        let string = JSON.stringify(object);
        return this.payloadBeginning + string + this.payloadEnd;
    }
    extractData(code: string) {
        const beginningSearch = 'ytplayer.config = ';
        let beginning = code.indexOf(beginningSearch)
        let end = code.indexOf(';ytplayer.load');

        if (beginning !== -1 && end !== -1) {
            try {

                let payload = JSON.parse(code.substring(beginning + 18, end));
                this.payloadBeginning = code.substring(0, beginning + beginningSearch.length);
                this.payloadEnd = code.substring(end);
                return payload;
            } catch (e) {
                return false;
            }
        } else {
            return false;
        }
    }
    parseVMAP(vmap: string): XMLDocument {
        try {
            let parser = new DOMParser();
            let parsed = parser.parseFromString(vmap, 'text/xml');
            return parsed;
        } catch (e) {
            console.log('Failed to parse VMAP', e);
        }
    }
    insertReplacement(parent: HTMLElement, code: string) {
        return parent.appendChild((() => {
            let el = document.createElement('script');
            el.setAttribute('id', 'replacement');
            el.setAttribute('type', 'text/javascript');
            el.appendChild(document.createTextNode(code));
            return el;
        })());
    }
    polyfill() {
        let scriptWatcher = new MutationObserver(mutations => {
            for (let mutation of mutations) {
                for (let node of mutation.addedNodes as NodeListOf<HTMLElement>) {
                    if (node.tagName === 'SCRIPT') {
                        let syntheticEvent = new CustomEvent('beforescriptexecute', {
                            detail: node,
                            cancelable: true
                        })

                        if (!document.dispatchEvent(syntheticEvent)) {
                            node.remove();
                        }
                    }
                }
            }
        })
        scriptWatcher.observe(document, {
            childList: true,
            subtree: true
        })

        return scriptWatcher;
    }
    destroy() {
        if (this.scriptWatcher) {
            this.scriptWatcher.disconnect();
        }
        document.removeEventListener('beforescriptexecute', this.onScript);
    }
}

if (location.pathname === "/ubo-yt") {
    const allowed = ['whitelist', 'ads', 'misc'];
    const tab = allowed.find(tab => '#' + tab === location.hash.toLowerCase()) || '';

    browser.runtime.sendMessage({ action: 'tab', subaction: 'settings', param: tab });
}
const instance = Math.random();
window.dispatchEvent(new CustomEvent('uBOWL-destroy', { detail: instance })); // signal to any pre-existing instances that they should unload

const agent = new MessageAgent('uBOWL-message', true); // My postMessage wrapper, to communicate with our injected script
const init = new InitManager(document.documentElement);
/*const adwatcher = new AdWatcher(payload => {
    console.log("Received args:", payload);
    const nextFlags = payload.args.fflags
        .replace(/&midroll_notify_time_seconds=[0-9]+&/g, "&midroll_notify_time_seconds=2&")
        .replace(/&postroll_notify_time_seconds-=[0-9]+&/g, "&postroll_notify_time_seconds=2&")
    payload.args.fflags = nextFlags;
    return payload;
});*/
const intermediary = (message: any) => browser.runtime.sendMessage(message).then((response: any) => {
    if (response.error) throw response.error;
    delete response.error;
    return response;
})
agent
    .on('ready', () => {
        init.ready = true;
        init.pushPending();
    })
    .on('get-settings', () => init.getSettings())
    .on('set-settings', (changes: any) => {
        return intermediary({ action: 'set', subaction: changes.type, param: changes.param });
    })
    .on('recent-ad', () => {
        return intermediary({ action: 'tab', subaction: 'last-ad' })
    })
    .on('mute', (shouldMute: boolean) => {
        return intermediary({ action: 'tab', subaction: 'mute', param: shouldMute || false })
    })
    .on('highlight-tab', () => {
        return intermediary({ action: 'tab', subaction: 'highlight' });
    });

init.inject();

let dejector: (event: CustomEvent) => void;
window.addEventListener('uBOWL-destroy', dejector = event => {
    if (event.detail === instance) return;
    console.log('Unloading uBOWL..');

    window.removeEventListener('uBOWL-destroy', dejector);
    agent.send('destroy');
    init.destroy();
    // adwatcher.destroy();
    agent.destroy();
});