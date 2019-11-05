declare var chrome: any;

const getWebExtensionsAPI = (): typeof browser => {
    try {
        if (!browser || navigator.userAgent.indexOf("Edge") !== -1) throw 'chrome';
        return browser;
    } catch (e) {
        const nextAPI = {} as typeof browser;
        if(navigator.userAgent.indexOf("Edge") !== -1){
            chrome = browser;
        }
        const promisify = (context: any, method: string): any => {
            // when called, adds a callback;
            const original = context[method] as Function;
            return function () {
                return new Promise((resolve, reject) => {
                    let args = [].slice.call(arguments);

                    args.push(function () {
                        const err = chrome.runtime.lastError
                        if (err) {
                            return reject(err);
                        }

                        let args = [].slice.call(arguments);
                        resolve(args.length > 1 ? args : args[0]);
                    });

                    original.apply(context, args)
                });
            }
        }
        if (chrome.tabs) {
            nextAPI.tabs = {
                ...chrome.tabs,
                query: promisify(chrome.tabs, 'query'),
                executeScript: promisify(chrome.tabs, 'executeScript'),
                sendMessage: promisify(chrome.tabs, 'sendMessage'),
                update: promisify(chrome.tabs, 'update'),
                create: promisify(chrome.tabs, 'create'),
                remove: promisify(chrome.tabs, 'remove'),
                getCurrent: promisify(chrome.tabs, 'getCurrent'),
                highlight: promisify(chrome.tabs, 'highlight')
            } as typeof browser.tabs
        }
        if (chrome.permissions) {
            nextAPI.permissions = {
                ...chrome.permissions,
                contains: promisify(chrome.permissions, 'contains'),
                request: promisify(chrome.permissions, 'request')
            } as typeof browser.permissions
        }
        if (chrome.management) {
            nextAPI.management = {
                ...chrome.management,
                getSelf: promisify(chrome.management, 'getSelf')
            } as typeof browser.management
        }else{
            nextAPI.management = {
                getSelf: () => Promise.resolve({installType: "development"} as any)
            } as typeof browser.management
        }
        if (chrome.storage) {
            nextAPI.storage = {
                sync: {
                    ...chrome.storage.sync,
                    get: promisify(chrome.storage.sync, 'get'),
                    set: promisify(chrome.storage.sync, 'set'),
                    clear: promisify(chrome.storage.sync, 'clear')
                }
            } as typeof browser.storage
        }
        nextAPI.webRequest = { ...chrome.webRequest };
        nextAPI.i18n = {
            ...chrome.i18n
        } as typeof browser.i18n
        nextAPI.runtime = {
            ...chrome.runtime,
            sendMessage: promisify(chrome.runtime, 'sendMessage')
        } as typeof browser.runtime;

        return nextAPI;
    };
}

export default getWebExtensionsAPI() as typeof browser;