"use strict";

// This content script is to act as a segway between
// the locally-injected script which contains the main code
// and the background script.

(function (window, document, browser, console, undefined) {
    const agent = new MessageAgent(); // my postMessage wrapper, to communicate with our injected script

    agent.on("getSettings", () => {
        return new Promise((resolve) => {
            browser.runtime.sendMessage({ action: "get" }, response => resolve({
                settings: response,
                accessURLs: {
                    ICO: browser.runtime.getURL("img/icon_16.png")
                }
            }));
        });
    });

    agent.on("setSettings", (changes) => {
        return new Promise((resolve) => {
            browser.runtime.sendMessage({ action: "set", changes: changes }, response => resolve(response));
        })
    });

    agent.on("blacklist", adinfo => {
        return new Promise((resolve) => {
            browser.runtime.sendMessage({ action: "blacklist", ad: adinfo }, response => resolve(response));
        })
    });

    agent.on("mute", change => {
        return new Promise((resolve) => {
            browser.runtime.sendMessage({ action: "mute", mute: change.mute || false, ad: change.ad }, response => resolve(response));
        });
    })

    browser.runtime.onMessage.addListener((requestData, sender, sendResponse) => {
        if (requestData.action === "update") {
            agent.send("settingsUpdate", { settings: requestData.settings, isOriginator: requestData.isOriginator });
        }
    });

    let head = document.documentElement; // equivalent to document.querySelector("html");

    // styling for whitelist button, blacklist button, etc.
    head.appendChild((() => {
        let el = document.createElement("link");
        el.setAttribute("rel", "stylesheet");
        el.setAttribute("type", "text/css");
        el.setAttribute("href", browser.runtime.getURL("inject.css"));
        return el;
    })());

    // inject main script
    head.appendChild((() => {
        let el = document.createElement("script");
        el.setAttribute("type", "text/javascript");
        el.setAttribute("src", browser.runtime.getURL("inject.js"));
        return el;
    })());

    function MessageAgent(identifier) {
        let instance = identifier || Math.random().toString(36).substring(7); //used to differentiate between us and others
        let resolvers = [];
        let events = {};

        this.on = (event, listener) => {
            if (typeof listener !== "function") throw "Listener must be a function";
            if (!events[event]) events[event] = [];
            events[event].push(listener);

            return this;
        }

        this.send = (event, message) => {
            let callbackId = Math.random().toString(36).substring(7);
            window.postMessage({ event: event, message: message, callbackId: callbackId, instance: instance }, "*");

            return new Promise((resolve, reject) => {
                resolvers.push({ id: callbackId, resolver: resolve, rejector: reject });
            })
        }

        window.addEventListener("message", (e) => {
            let revent = e.data;
            let promises = [];

            if (revent.instance && revent.instance !== instance) { //do not process if the event came from ourselves
                if (revent.event && revent.event in events) {
                    for (let i = 0; i < events[revent.event].length; i++) {
                        let response = events[revent.event][i](revent.message); //execute listener
                        if (response && typeof response.then === "function") //if a promise
                            promises.push(response); //wait til resolved
                        else
                            promises.push(Promise.resolve(response)) //resolve immediately
                    }

                    Promise.all(promises).then(messages => { //send messages as single array once all promises are resolved
                        window.postMessage({ callbackId: revent.callbackId, message: messages.length === 1 ? messages[0] : messages, instance: instance }, "*");
                    });
                } else if (revent.callbackId) { //we received a response to a message we sent
                    let index = resolvers.map(val => val.id).indexOf(revent.callbackId);
                    if (index === -1) return;
                    let callback = resolvers[index];
                    callback.resolver(revent.message); //execute callback
                    resolvers.splice(index, 1); //remove resolver from array
                }
            }
        });
    }
})(window, document, chrome ? chrome : browser, console)
