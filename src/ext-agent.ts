import browser from './browser';
import { HostMessage } from './typings';

interface ExtEvent {
    action: string,
    subaction: string;
    fn: (sender: browser.runtime.MessageSender, item: any) => Promise<any> | any;
}

class MessageListener {
    events: Array<ExtEvent>;
    on: (subaction: string, fn: ExtEvent['fn']) => this;
    onAll: (fn: ExtEvent['fn']) => this;

    constructor() {
        this.events = [];
    }
    private _on(action: string, subaction: string, fn: ExtEvent['fn']): this {
        this.events.push({ action, subaction, fn });
        return this;
    }
    onAction(action: string): this {
        this.on = this._on.bind(this, action);
        this.onAll = this._on.bind(this, action, undefined);
        return this
    }
    start() {
        browser.runtime.onMessage.addListener((message: HostMessage, sender: browser.runtime.MessageSender, sendResponse: any) => {
            const events = this.events.filter(({ action, subaction }) => message.action === action
                && (!subaction || message.subaction === subaction));

            if (events.length) {
                let ret: any | Promise<any>;
                try {
                    ret = events.reduce((prevRet, { fn }) => fn(sender, prevRet), message.param);
                } catch (error) {
                    sendResponse({ error });
                }

                if (ret instanceof Promise) {
                    ret
                        .then(response => sendResponse({ error: '', response }))
                        .catch(error => sendResponse({ error }));
                    return true;
                } else {
                    sendResponse({ error: '', response: ret || {} });
                }
            } else {
                sendResponse({ error: 'Event not found' });
            }
        })
    }
}

export default MessageListener;