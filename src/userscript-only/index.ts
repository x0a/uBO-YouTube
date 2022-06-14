import { ContentAPI, main } from '../contentmain'
import { getAsset, getAssetsList, removeAsset } from '../asset-include/assets';


// This content script is to act as a messaging bus between
// the locally-injected script which contains the main code
// and the background script.
const initialAssets = getAssetsList();
const desiredLanguage = './src/_locales/' + document.documentElement.lang + '/messages.json';
const defaultLanguage = './src/_locales/en/messages.json'
const availableLanguage = initialAssets.indexOf(desiredLanguage) !== -1 ? desiredLanguage : defaultLanguage;
const requiredAssets = [
    './src/img/icon_16.png',
    'userscript.js',
    'userscript.css',
    availableLanguage
]
initialAssets.filter(asset => requiredAssets.indexOf(asset) !== -1); // removed unneeded assets

const MainContentAPI: ContentAPI = {
    getIconURL(): string {
        const icon = getAsset('./src/img/icon_16.png')
        return 'data:image/png;base64,' + icon.contents;
    },
    getUserscript() {
        const el = document.createElement('script');
        el.setAttribute('type', 'text/javascript');
        const userscript = getAsset('userscript.js');
        el.textContent = userscript.contents;

        return el;
    },
    getStyles(): HTMLStyleElement | HTMLLinkElement {
        const el = document.createElement('style');
        const css = getAsset('userscript.css')
        el.textContent = css.contents;

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
        const asset = getAsset(availableLanguage);
        const languagePack = asset.contents as any;
        const message = languagePack[name];
        let finalMessage = message.message as string;

        for (const placeholder in message.placeholders) {
            const position = ~~message.placeholders[placeholder].replace('$', '') - 1;
            finalMessage.replace('$' + placeholder + '$', replacements[position]);
        }

        return finalMessage;
    },
    onMessage(fn: (data: any) => void): () => void {
        browser.runtime.onMessage.addListener(fn);

        return () => browser.runtime.onMessage.removeListener(fn);
    }
}

main(MainContentAPI)