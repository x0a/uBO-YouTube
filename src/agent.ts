const enum EventType {
    ReplyResolve,
    ReplyReject,
    Message
}
interface AgentEvent {
    type: EventType;
    sharedId: string;
    from: string;
    name?: string;
    message: any;
    replyId: string;
}
interface AgentEventListener {
    name: string;
    fn: (msg: any) => any;
}
interface AgentReplyListener {
    replyId: string;
    resolve: (msg: any) => any;
    reject: (error: any) => any;
}
class MessageAgent {
    instanceId: string;
    sharedId: string;

    private eventListeners: Array<AgentEventListener>;
    private replyListeners: Array<AgentReplyListener>;
    private active: boolean;
    private sendEvent: (event: AgentEvent) => void;
    private unhookWindow: () => any;

    /** Allows communication between two scripts, using native .dispatchEvent or .postMessage */
    constructor(sharedId: string, eventBased = false) {
        this.instanceId = this.generateId();
        this.eventListeners = [];
        this.replyListeners = [];
        this.active = true;
        this.sharedId = sharedId;
        const [sendEvent, unhookWindow] = this.hookWindow(sharedId, eventBased);
        this.sendEvent = sendEvent;
        this.unhookWindow = unhookWindow;
    }
    on(name: string, fn: (msg: any) => any) {
        if (!this.active) throw "Agent has been destroyed";
        this.eventListeners = this.eventListeners.concat({ name, fn });
        return this;
    }
    send(name: string, message?: any): Promise<any> {
        if (!this.active) throw "Agent has been destroyed";
        const replyId = this.generateId();

        const awaitingReply = new Promise((resolve, reject) => {
            this.replyListeners = this.replyListeners.concat({ replyId, resolve, reject })
        })

        this.sendEvent({
            name,
            message,
            replyId,
            type: EventType.Message,
            from: this.instanceId,
            sharedId: this.sharedId
        });

        return awaitingReply;
    }
    destroy() {
        this.active = false;
        this.unhookWindow();
        this.eventListeners = [];
        this.replyListeners = [];
        this.instanceId = "";
    }

    private handleDispatch(event: AgentEvent) {
        if (!event || !event.from || event.from === this.instanceId) return; // do not process if the event came from ourselves

        if (event.type === EventType.ReplyResolve || event.type === EventType.ReplyReject) { // received a reply to a message we sent
            this.onReply(event)
        } else if (event.type === EventType.Message) { // received a message
            this.onMessage(event);
        }
    }
    private onReply(event: AgentEvent) {
        const i = this.replyListeners.findIndex(({ replyId }) => replyId === event.replyId);
        if (i !== -1) {
            if (event.type === EventType.ReplyResolve)
                this.replyListeners[i].resolve(event.message);
            else
                this.replyListeners[i].reject(event.message);
            this.replyListeners.splice(i, 1);
        }
    }
    private onMessage(event: AgentEvent) {
        const pendingResults = this.eventListeners
            .filter(({ name }) => name === event.name)
            .map(({ fn }) => {
                try {
                    return fn(event.message)
                } catch (error) {
                    return Promise.reject(error);
                }
            })
            .map(result => result instanceof Promise ? result : Promise.resolve(result));

        if (!this.active) return; // if one of the functions led to the destruction of the agent, dont bother replying

        Promise.all(pendingResults)
            .then(results => this.sendReply(results.length === 1 ? results[0] : results, event.replyId))
            .catch(error => this.sendReply(error, event.replyId, false))
    }
    private sendReply(message: any, replyId: string, success = true) {
        this.sendEvent({
            sharedId: this.sharedId,
            type: success ? EventType.ReplyResolve : EventType.ReplyReject,
            replyId,
            message,
            from: this.instanceId
        });
    }
    private hookWindow(sharedId: string, eventBased: boolean): [(event: AgentEvent) => void, () => void] {
        const contextualize = (() => { //  specific to content scripts on firefox
            try {
                // @ts-ignore
                if (!cloneInto) throw "No clone into"
                // @ts-ignore
                return (object: any) => cloneInto(object, document.defaultView)
            } catch (e) {
                return (object: any) => object;
            }
        })();
        const onEventDispatch = eventBased
            ? (event: CustomEvent) => this.handleDispatch(event.detail)
            : (event: MessageEvent) => this.handleDispatch(event.data);
        const sendEvent = eventBased
            ? (event: AgentEvent) => window.dispatchEvent(new CustomEvent(sharedId, { detail: contextualize(event) }))
            : (event: AgentEvent) => window.postMessage(event, '*');

        if (eventBased)
            window.addEventListener(sharedId, onEventDispatch)
        else
            window.addEventListener('message', onEventDispatch);

        const unhookWindow = eventBased
            ? () => window.removeEventListener(sharedId, onEventDispatch)
            : () => window.removeEventListener('message', onEventDispatch);

        return [sendEvent, unhookWindow]
    }
    private generateId() {
        return Math.random().toString(36).substring(7);
    }
}

export default MessageAgent;