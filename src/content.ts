import browser from './browser';
import { ContentAPI, main } from './contentmain'
import { getAsset, getAssetsList } from './asset-include/assets';


// This content script is to act as a messaging bus between
// the locally-injected script which contains the main code
// and the background script.
const MainContentAPI: ContentAPI = {
    getIconURL(): string {
        return browser.runtime.getURL('img/icon_16.png')
    },
    getUserscript() {
        let el = document.createElement('script');
        el.setAttribute('type', 'text/javascript');
        const userscript = getAsset('userscript.js');
        if (userscript) {
            el.textContent = userscript.contents;
        } else {
            el.setAttribute('src', browser.runtime.getURL('userscript.js'));
        }
        return el;
    },
    getStyles(): HTMLStyleElement | HTMLLinkElement {
        let el = document.createElement('link');
        el.setAttribute('rel', 'stylesheet');
        el.setAttribute('type', 'text/css');
        el.setAttribute('href', browser.runtime.getURL('userscript.css'));
        return el;
    },
    sendMessage<T = any>(action: string, subaction: string, param?: any): Promise<T> {
        return browser.runtime.sendMessage({ action, subaction, param })
            .then((response: any) => {
                if (response.error) throw response.error;
                delete response.error;
                return response as T;
            });
    },
    i18n(name: string, ...replacements: Array<string>): string {
        return browser.i18n.getMessage(name, ...replacements);
    },
    onMessage(fn: (data: any) => void): () => void {
        browser.runtime.onMessage.addListener(fn);

        return () => browser.runtime.onMessage.removeListener(fn);
    }
}

main(MainContentAPI)