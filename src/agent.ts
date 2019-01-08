
interface AgentResolver {
    id: string;
    resolver: Function;
    rejector: Function;
}

interface AgentEvent {
    [eventName: string]: Array<Function>
}

class MessageAgent {
    instance: string;
    resolvers: Array<AgentResolver>;
    events: AgentEvent;
    requestsPending: Array<Promise<void>>;

    constructor(identifier?: string) {
        this.instance = identifier || Math.random().toString(36).substring(7); //used to differentiate between us and others
        this.resolvers = [];
        this.events = {};
        this.messageListener = this.messageListener.bind(this);
        this.requestsPending = [];

        window.addEventListener("message", this.messageListener);
    }
    on(event: string, listener: Function) {
        if (typeof listener !== "function") throw "Listener must be a function";
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(listener);

        return this;
    }

    send(event: string, message?: any) {
        let callbackId = Math.random().toString(36).substring(7);
        window.postMessage({ event: event, message: message, callbackId: callbackId, instance: this.instance }, "*");

        let p: Promise<any> = new Promise((resolve, reject) => {
            this.resolvers.push({ id: callbackId, resolver: resolve, rejector: reject });
        }).then(response => {
            let i = this.requestsPending.findIndex(item => item === p);
            this.requestsPending.splice(i, 1);
            return response;
        }).catch(err => {
            return err;
        })
        this.requestsPending.push(p);
        return p;
    }
    messageListener(e: MessageEvent) {
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
        return Promise.all(this.requestsPending).then(() => {
            window.removeEventListener("message", this.messageListener);
            this.resolvers = null;
            this.events = null;
            this.instance = null;
        })
    }

}

export default MessageAgent;