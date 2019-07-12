declare var chrome: any;

function getWebExtensionsAPI(): typeof browser {
    let api: any;

    try {
        api = browser;
        if (!api) throw "chrome";
    } catch (e) {
        if (chrome.promisified) return chrome;
        api = chrome;
        let promisify = (context: any, method: string) => {
            // when called, adds a callback;
            const original = context[method] as Function;
            return function () {
                return new Promise((resolve, reject) => {
                    let args = [].slice.call(arguments);

                    args.push(function () {
                        const err = api.runtime.lastError
                        if (err) {
                            return reject(err);
                        }

                        let args = [].slice.call(arguments);
                        if (args.length > 1) {
                            resolve(args);
                        } else {
                            resolve(args[0])
                        }
                    });

                    original.apply(context, args)
                });
            }
        }
        if (api.tabs) {
            api.tabs.query = promisify(api.tabs, "query");
            api.tabs.executeScript = promisify(api.tabs, "executeScript");
            api.tabs.sendMessage = promisify(api.tabs, "sendMessage");
            api.tabs.update = promisify(api.tabs, "update");
        }
        if (api.permissions) {
            api.permissions.contains = promisify(api.permissions, "contains");
            api.permissions.request = promisify(api.permissions, "request");
        }
        api.storage.sync.get = promisify(api.storage.sync, "get");
        api.storage.sync.set = promisify(api.storage.sync, "set");
        api.storage.sync.clear = promisify(api.storage.sync, "clear");

        api.runtime.sendMessage = promisify(api.runtime, "sendMessage");
        api.promisified = true;
    };
    return api;
}

export default getWebExtensionsAPI();