import browser from './browser';
declare var DEVSERVER: string;
const defaultServer = DEVSERVER || '127.0.0.1'

class Development {
    developmentServer: string;
    originalLog = (...args: any) => { };
    originalErr = (...args: any) => { };
    reconnectInterval: number;
    timeoutInt: number;
    ws: WebSocket;
    listeners: Map<string, () => void>
    constructor(server?: string) {
        this.developmentServer = server || 'ws://' + defaultServer + ':3050';
        this.originalLog = console.log;
        this.originalErr = console.error;
        this.reconnectInterval = 1500;
        this.timeoutInt = null;
        this.ws = null;
        this.listeners = new Map();
        this.connect = this.connect.bind(this);
    }
    connect() {
        this.ws = new WebSocket(this.developmentServer);
        this.ws.addEventListener('open', event => {
            this.timeoutInt = null;
            this.prepareDevEnv();

            this.ws.send(JSON.stringify({
                userAgent: navigator.userAgent
            }));

            console.log('Hello world');
        });

        this.ws.addEventListener('message', event => {
            const listener = this.listeners.get(event.data);
            if(listener) listener();
        });

        this.ws.addEventListener('error', event => this.queueConnection());

        this.ws.addEventListener('close', () => {
            this.removeDevEnv();
            this.queueConnection();
        });

    }
    on(command: string, listener: () => void): this{
        this.listeners.set(command, listener);
        return this;
    }
    close(){
        this.ws.close(1000);
    }
    queueConnection() {
        if (this.timeoutInt)
            clearInterval(this.timeoutInt);
        this.timeoutInt = window.setTimeout(this.connect, this.reconnectInterval);
    }

    prepareDevEnv() {
        console.log = (function () {
            this.originalLog.apply(null, arguments)
            this.ws.send(JSON.stringify({
                log: Array.from(arguments)
            }))
        }).bind(this);
        console.error = (function () {
            this.originalErr.apply(null, arguments)
            this.ws.send(JSON.stringify({
                error: Array.from(arguments)
            }))
        }).bind(this);
    }

    removeDevEnv() {
        console.log = this.originalLog;
        console.error = this.originalErr;
    }
    static detectedDevMode() {
        return browser.runtime.getManifest && !('update_url' in browser.runtime.getManifest());
    }
}

export default Development;
