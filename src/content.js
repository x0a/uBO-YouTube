"use strict";

// This content script is to act as a segway between
// the locally-injected script which contains the main code
// and the background script.

(function (window, document, browser, console, undefined) {
    class InitManager {
        constructor(insertLocation = document.documentElement) {
            this.onBrowserMessage = this.onBrowserMessage.bind(this);
            this.getSettings = this.getSettings.bind(this);
            this.destroy = this.destroy.bind(this);

            this.queue = [];
            this.ready = false;
            this.head = insertLocation;
            this.firstRun = this.retrieveSettings();

            this.jsFile = (() => {
                let el = document.createElement("script");
                el.setAttribute("type", "text/javascript");
                el.setAttribute("src", browser.runtime.getURL("inject.js"));
                return el;
            })()
            this.cssFile = (() => {
                let el = document.createElement("link");
                el.setAttribute("rel", "stylesheet");
                el.setAttribute("type", "text/css");
                el.setAttribute("href", browser.runtime.getURL("inject.css"));
                return el;
            })()

            browser.runtime.onMessage.addListener(this.onBrowserMessage);
        }

        onBrowserMessage(message) {
            if (!this.ready) {
                this.queue.push(message);
                console.log('pushing to queue');
            } else {
                this.parseMessage(message);
            }
        }
        parseMessage(message) {
            if (message.action === "update") {
                agent.send("settings-update", { settings: message.settings, initiator: message.initiator });
            } else if (message.action === "ad-update") {
                agent.send("ad-update", message.ad);
            }
        }
        pushPending() {
            for (let pending of this.queue) {
                this.parseMessage(pending);
            }
        }
        retrieveSettings() {
            return new Promise(resolve => {
                browser.runtime.sendMessage({ action: "get-lists" }, response => resolve({
                    settings: response,
                    accessURLs: {
                        ICO: browser.runtime.getURL("img/icon_16.png")
                    }
                }));
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
            // styling for whitelist button, blacklist button, etc.
            this.head.appendChild(this.jsFile);

            // inject main script
            this.head.appendChild(this.cssFile);
        }
        destroy() {
            this.cssFile.disabled = true;
            this.head.removeChild(this.cssFile);
            this.head.removeChild(this.jsFile);
            browser.runtime.onMessage.removeListener(init.onBrowserMessage);
        }
    }

    class AdWatcher {
        constructor(onReceiveSettings) {
            this.onReceiveSettings = onReceiveSettings;
            this.onScript = this.onScript.bind(this);

            if(!("onbeforescriptexecute" in document)){
                this.scriptWatcher = this.polyfill();
            }

            document.addEventListener("beforescriptexecute", this.onScript);
        }

        onScript(event) {
            // Events from our polyfill contain the target in event.detail
            // Native events contain the target in event.target.
            let script = event.detail || event.target;
            if (this.isCorrectScript(script)) {
                let code = script.textContent;
                let parent = script.parentElement;
                let videoData = this.extractData(code);

                event.preventDefault();

                if (videoData) {
                    if (videoData.args && videoData.args.vmap) {
                        let payload = this.onReceiveSettings(videoData);
                        this.insertReplacement(parent, this.compilePayload(payload))
                    } else {
                        console.log("Object missing data");
                    }
                } else {
                    console.log("Trouble parsing inline script tag:", event)
                }
            }
        }
        isCorrectScript(el) {
            const search = "\\u003c?xml version=\\\"1.0\\\" encoding=\\\"UTF-8\\\"?\\u003e\\n\\u003cvmap:VMAP";

            return el.parentElement && el.parentElement.id === "player-wrap" &&
                el.id !== "replacement" &&
                el.textContent.indexOf(search) !== -1;
        }
        compilePayload(object){
            let string = JSON.stringify(object);
            return this.payloadBeginning + string + this.payloadEnd;
        }
        extractData(code) {
            const beginningSearch = "ytplayer.config = ";
            let beginning = code.indexOf(beginningSearch)
            let end = code.indexOf(";ytplayer.load");

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
        parseVMAP(vmap) {
            try {
                let parser = new DOMParser();
                let parsed = parser.parseFromString(vmap, "text/xml");
                return parsed;
            } catch (e) {
                console.log("Failed to parse VMAP", e);
            }
        }
        insertReplacement(parent, code) {
            return parent.appendChild((() => {
                let el = document.createElement("script");
                el.setAttribute("id", "replacement");
                el.setAttribute("type", "text/javascript");
                el.appendChild(document.createTextNode(code));
                return el;
            })());
        }
        polyfill(){
            let scriptWatcher = new MutationObserver(mutations => {
                for(let mutation of mutations){
                    for(let node of mutation.addedNodes){
                        if(node.tagName === "SCRIPT"){
                            let syntheticEvent = new CustomEvent("beforescriptexecute", {
                                detail: node,
                                cancelable: true
                            })

                            if(!document.dispatchEvent(syntheticEvent)){
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
            if(this.scriptWatcher){
                this.scriptWatcher.disconnect();
            }
            document.removeEventListener("beforescriptexecute", this.onScript);
        }
    }

    class MessageAgent {
        constructor(identifier) {
            this.instance = identifier || Math.random().toString(36).substring(7); //used to differentiate between us and others
            this.resolvers = [];
            this.events = {};
            this.messageListener = this.messageListener.bind(this);
            this.requestsPending = [];

            window.addEventListener("message", this.messageListener);
        }
        on(event, listener) {
            if (typeof listener !== "function") throw "Listener must be a function";
            if (!this.events[event]) this.events[event] = [];
            this.events[event].push(listener);

            return this;
        }

        send(event, message) {
            let callbackId = Math.random().toString(36).substring(7);
            window.postMessage({ event: event, message: message, callbackId: callbackId, instance: this.instance }, "*");

            return new Promise((resolve, reject) => {
                this.resolvers.push({ id: callbackId, resolver: resolve, rejector: reject });
            })
        }
        messageListener(e) {
            let revent = e.data;
            let promises = [];

            if (revent.instance && revent.instance !== this.instance) { //do not process if the event came from ourselves
                if (revent.event && revent.event in this.events) {
                    let done;

                    let pending = new Promise(resolve => {
                        done = resolve;
                    }).then(() => {
                        this.requestsPending.splice(this.requestsPending.findIndex(item => item === pending));
                    });

                    this.requestsPending.push(pending);

                    for (let i = 0; i < this.events[revent.event].length; i++) {
                        let response = this.events[revent.event][i](revent.message); //execute listener
                        if (response instanceof Promise) //if a promise
                            promises.push(response); //wait til resolved
                        else
                            promises.push(Promise.resolve(response)) //resolve immediately
                    }

                    Promise.all(promises).then(messages => { //send messages as single array once all promises are resolved
                        window.postMessage({
                            callbackId: revent.callbackId,
                            message: messages.length === 1 ? messages[0] : messages,
                            instance: this.instance
                        }, "*");
                    }).then(done);

                } else if (revent.callbackId) { //we received a response to a message we sent
                    let index = this.resolvers.findIndex(val => val.id === revent.callbackId);

                    if (index === -1) return;
                    let callback = this.resolvers[index];
                    this.resolvers.splice(index, 1); //remove resolver from array
                    callback.resolver(revent.message); //execute callback
                }
            }
        }
        destroy() {
            Object.keys(this.events).forEach(key => this.events[key] = []);

            return Promise.all(this.requestsPending.concat(this.resolvers)).then(() => {
                window.removeEventListener("message", this.messageListener);
                this.resolvers = null;
                this.events = null;
                this.instance = null;
            })
        }

    }

    window.dispatchEvent(new CustomEvent("uBOWLInstance")); // signal to any pre-existing instances that they should unload

    const agent = new MessageAgent(); // My postMessage wrapper, to communicate with our injected script
    const init = new InitManager(document.documentElement);
    /*const adwatcher = new AdWatcher(payload => {
        console.log("Received args:", payload);
        payload.args.cbr = "fuccboi";
        return payload;
    });*/

    agent.on("ready", () => {
        init.ready = true;
        init.pushPending();
    }).on("get-settings", init.getSettings).on("set-settings", (changes) => {
        return new Promise((resolve) => {
            browser.runtime.sendMessage({ action: "set", changes: changes }, response => resolve(response));
        })
    }).on("recent-ad", () => {
        return new Promise((resolve) => {
            browser.runtime.sendMessage({ action: "get-ads", type: "current-tab" }, response => resolve(response))
        })
    }).on("mute", change => {
        return new Promise((resolve) => {
            browser.runtime.sendMessage({ action: "mute", mute: change.mute || false }, response => resolve(response));
        });
    })

    init.inject();

    let dejector;

    window.addEventListener("uBOWLInstance", dejector = () => {
        console.log("Unloading uBOWL..");

        window.removeEventListener("uBOWLInstance", dejector);
        agent.send("destroy");
        init.destroy();
        //adwatcher.destroy();
        agent.destroy();
    });
})(window, document, (() => { let api; try { api = browser; } catch (e) { api = chrome }; return api })(), console)
