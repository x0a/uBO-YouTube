import MessageAgent from './agent';


// This content script is to act as a messaging bus between
// the locally-injected script which contains the main code
// and the background script.

export interface ContentAPI {
    getUserscript(): HTMLScriptElement,
    getStyles(): HTMLStyleElement,
    getIconURL(): string
    i18n(name: string, ...replacements: Array<string>): string;
    sendMessage<T = any>(action: string, subaction: string, param?: any): Promise<T>;
    onMessage(fn: (data: any) => void): () => void;
}

export const main = (api: ContentAPI) => {
    class InjectHook {
        queue: Array<any>;
        firstRun: Promise<any>;
        removeListener: () => void;
        ready: boolean;
        head: HTMLElement;
        jsFile: HTMLScriptElement;
        cssFile: HTMLLinkElement | HTMLStyleElement;

        constructor(insertLocation = document.documentElement) {
            this.onBrowserMessage = this.onBrowserMessage.bind(this);
            this.getSettings = this.getSettings.bind(this);
            this.destroy = this.destroy.bind(this);

            this.queue = [];
            this.ready = false;
            this.head = insertLocation;
            this.firstRun = this.retrieveSettings();

            this.jsFile = api.getUserscript();
            this.cssFile = api.getStyles();
            this.removeListener = api.onMessage(this.onBrowserMessage)
        }

        onBrowserMessage(message: any) {
            if (!this.ready) {
                this.queue.push(message);
                console.log('Received message from browser but userscript isn\'t ready yet, pushing to queue');
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
            }
        }
        pushPending() {
            for (let pending of this.queue) {
                this.parseMessage(pending);
            }
        }
        retrieveSettings() {
            return api.sendMessage('get', 'settings+subs')
                .then((message: any) => {
                    if (message.error) throw message.error;

                    return {
                        settings: message.response.settings,
                        subscriptions: message.response.subscriptions,
                        accessURLs: {
                            ICO: api.getIconURL()
                        },
                        i18n: {
                            adOptionsDefaultTooltip: api.i18n('adOptionsDefaultTooltip'),
                            adOptionsTooltip: api.i18n('adOptionsTooltip', '$1$'),
                            removeMuteBtn: api.i18n('removeMuteBtn'),
                            removeMuteTooltip: api.i18n("removeMuteTooltip"),
                            adsStillBlocked: api.i18n('adsStillBlocked'),
                            whitelistTooltip: api.i18n('whitelistTooltip'),
                            whitelistedTooltip: api.i18n('whitelistedTooltip'),
                            muteBtn: api.i18n('muteBtn'),
                            blacklistAdvertiserTooltip: api.i18n('blacklistAdvertiserTooltip'),
                            muteAdvertiserTooltip: api.i18n('muteAdvertiserTooltip'),
                            adsEnableBtn: api.i18n('adsEnableBtn'),
                            blacklistBtn: api.i18n('blacklistBtn'),
                            skipBtn: api.i18n('skipBtn'),
                            skipTooltip: api.i18n('skipTooltip'),
                            pauseAfterAdBtn: api.i18n('pauseAfterAdBtn'),
                            pauseAfterAdTooltip: api.i18n('pauseAfterAdTooltip'),
                            cancelPauseAfterAdBtn: api.i18n('cancelPauseAfterAdBtn'),
                            cancelPauseAfterAdTooltip: api.i18n('cancelPauseAfterAdTooltip')
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
            (this.cssFile as any).disabled = true;
            this.head.removeChild(this.cssFile);
            this.head.removeChild(this.jsFile);
            this.removeListener();
        }
    }
    const hookReload = () => {
        const instance = Math.random();
        window.dispatchEvent(new CustomEvent('uBOWL-destroy', { detail: instance })); // signal to any pre-existing instances that they should unload

        const unloader = (event: CustomEvent) => {
            if (event.detail === instance) return; // we should be unloading other instances, not ourselves
            console.log('Unloading uBOWL..');

            window.removeEventListener('uBOWL-destroy', unloader);
            agent.send('destroy');
            hook.destroy();
            agent.destroy();

            // adwatcher.destroy();
        }
        window.addEventListener('uBOWL-destroy', unloader);
    }

    if (location.pathname === "/ubo-yt") {
        const allowed = ['whitelist', 'ads', 'misc'];
        const tab = allowed.find(tab => '#' + tab === location.hash.toLowerCase()) || '';

        api.sendMessage('tab', 'settings', tab);
    }

    const agent = new MessageAgent('uBOWL-message', true); // My postMessage wrapper, to communicate with our injected script
    const hook = new InjectHook(document.documentElement);

    agent
        .on('ready', () => {
            hook.ready = true;
            hook.pushPending();
        })
        .on('get-settings', () => hook.getSettings())
        .on('set-settings', ({ type, param }) => api.sendMessage('set', type, param))
        .on('cache', ({ type, param }) => api.sendMessage('cache', type, param))
        .on('recent-ad', () => api.sendMessage('tab', 'last-ad'))
        .on('echo-ad', ad => api.sendMessage('tab', 'echo-ad', ad))
        .on('mute-tab', (shouldMute: boolean) => api.sendMessage('tab', 'mute', shouldMute || false))
        .on('highlight-tab', () => api.sendMessage('tab', 'highlight'))
        .on('css', () => api.sendMessage('tab', 'css'));

    hookReload();
    hook.inject();
}