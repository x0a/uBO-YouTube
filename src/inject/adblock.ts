import log, { err } from './logging';
import Obj from './objutils';

const enum Action {
    Remove,
    Hide
}
type ElAction = [HTMLElement, (el: HTMLElement) => void];

const jsonRules = 'playerAds adPlacements';
const globals = ['ytInitialPlayerResponse'];
const netFilters = Object.freeze([
    'generate_204',
    'doubleclick.net',
    '/pagead',
    /get_video_info.+=adunit/g,
    'get_midroll_info'
]);
const filter = (selector: string, action: Action) => {
    return { selector, action };
}
const domFilters = ['#masthead-ad',
    'ytd-action-companion-ad-renderer',
    'ytd-promoted-sparkles-text-search-renderer',
    'ytd-player-legacy-desktop-watch-ads-renderer',
    'ytd-promoted-sparkles-web-renderer']
    .map(selector => filter(selector, Action.Remove));

domFilters.push(filter('ytd-rich-item-renderer:has(ytd-display-ad-renderer)', Action.Hide));

class AdBlock {
    private prune: boolean;
    private xhr: boolean;
    private dom: boolean;
    private fetch: boolean;
    private img: boolean;
    private ping: boolean;
    public immutableBlock: boolean;

    private matches: (el: HTMLElement) => ElAction;
    private queryAllFilters: () => Array<ElAction>;
    private netListeners: Array<(url: string) => void>;
    private fetchIntercept: Array<(url: string | Request, response: Response) => Promise<void>>;
    private onAdsListener: (ads: Array<any>) => Array<any>;
    private unhookAll: () => void;

    constructor(block: boolean) {
        const [queryAllFilters, matches] = this.parseDOMFilters();
        this.immutableBlock = false;
        this.queryAllFilters = queryAllFilters;
        this.matches = matches;
        this.netListeners = [];
        this.fetchIntercept = [];
        this.onAdsListener = ads => ads;
        this.toggleAll(block);
        this.unhookAll = this.hookAll();
    }
    enabled() {
        return this.xhr;
    }
    toggleAll(block: boolean) {
        this.toggleNet(block);
        this.togglePrune(block);
        this.toggleDOM(block);
    }
    toggleNet(block: boolean) {
        if (this.xhr !== block || this.fetch !== block)
            log('uBO-Block', 'Net filter:', block);
        this.xhr = block;
        this.fetch = block;
        this.img = block;
        this.ping = block;
    }
    togglePrune(block: boolean) {
        if (this.prune !== block)
            log('uBO-Block', 'JSON-prune:', block);
        this.prune = block;
    }
    toggleDOM(block: boolean) {
        if (!this.dom && block) {
            this.queryAllFilters()
                .forEach(([el, action]) => action(el));
        }
        this.dom = block;
    }
    onNet(fn: (url: string) => void) {
        this.netListeners.push(fn);
        return () => {
            const i = this.netListeners.indexOf(fn);
            this.netListeners.splice(i, 1);
        }
    }
    onFetch(fn: (url: string | Request, res: Response) => Promise<void>) {
        this.fetchIntercept.push(fn);
    }
    onAds(fn: (ads: Array<any>) => Array<any>) {
        this.onAdsListener = fn;
    }
    private onNetListener(url: string): void {
        this.netListeners.forEach(fn => fn(url));
    }
    private hookAll(): () => void {
        const unhookJSON = this.hookJSON();
        const unhookXHR = this.hookXHR();
        const unhookDOM = this.hookDOM();
        const unhookFetch = this.hookFetch();
        const unhookPing = this.hookPing();
        const unhookImg = this.hookImg();

        return () => {
            this.toggleAll(false)
            unhookJSON();
            unhookXHR();
            unhookDOM();
            unhookFetch();
            unhookPing();
            unhookImg();
        }
    }
    private hookJSON(): any {
        const frame = document.createElement('iframe');
        frame.style.display = 'none';
        document.documentElement.appendChild(frame);

        const nextWindow = (frame.contentWindow as any)
        const nextParse = nextWindow.JSON.parse;
        const nextParseFetch = nextWindow.Response.prototype.json
        const uBOParse = JSON.parse;
        const uBOParseFetch = Response.prototype.json;
        document.documentElement.removeChild(frame);

        const recontextualize = (obj: any, cache: Map<any, any> = new Map()) => {
            // Objects created by nextWindow.JSON.parse will be instances of nextWindow.Object/nextwindow.Array
            // therefor they will fail the `instanceof Object` and `instanceof Array` checks that YouTube does
            // Fix is to recreate the resulting objects in the current execution context

            if (obj instanceof nextWindow.Array) {
                if (cache.has(obj)) return cache.get(obj);
                const nextObj: any = [...obj].map(item => recontextualize(item, cache));
                cache.set(obj, nextObj);
                return nextObj;
            } else if (obj instanceof nextWindow.Object) {
                if (cache.has(obj)) return cache.get(obj);
                const nextObj: any = Object.entries({ ...obj })
                    .reduce((newObj: any, [key, value]) => (newObj[key] = recontextualize(value, cache), newObj), {})
                cache.set(obj, nextObj);
                return nextObj;
            } else {
                return obj;
            }

        }
        const rules = jsonRules
            .split(' ');
        const parsePrune = function () {
            return pruneWithinContext(nextParse.apply(this, arguments));
        };
        const pruneAsync = function () {
            return nextParseFetch.apply(this, arguments)
                .then((json: any) => pruneWithinContext(json))
        }
        const pruneWithinContext = (obj: any) => {
            const res = recontextualize(obj);
            return pruneOnly(res);
        }
        const pruneOnly = (obj: any) => {
            try {
                if (this.prune) {
                    if (rules.map(rule => Obj.prune(obj, rule)).some(found => found)) {
                        log('uBO-YT-Prune', 'Pruned a JSON object');
                        this.immutableBlock = true;
                    }
                } else {
                    rules.forEach(rule => Obj.replaceAll(obj, rule, this.onAdsListener))
                }
            } catch (e) {
                err('uBO-YT-Prune', e, obj)
            }
            return obj;
        }

        try {
            JSON.parse = parsePrune
            Response.prototype.json = pruneAsync;
            for (const global of globals) {
                this.hookGlobal(global, obj => {
                    if (this.prune)
                        pruneOnly(obj);
                    return obj;
                })
            }
            Object.freeze(JSON);
        } catch (e) {
            err('Unable to replace JSON.parse');
        }
        return () => {
            try {
                JSON.parse = uBOParse;
                Response.prototype.json = uBOParseFetch;
            } catch (e) {
                err('Unable to reset JSON.parse');
            }
        }
    }
    private shouldBlock(url: string) {
        return netFilters.some(filter => filter instanceof RegExp
            ? url.match(filter)
            : url.indexOf(filter) !== -1)
    }
    private hookGlobal(name: string, fn: (incoming: any) => any): void {
        let outgoing: any;
        Object.defineProperty(window, name, {
            set: incoming => {
                outgoing = fn(incoming);
                return outgoing;
            },
            get: () => {
                return outgoing;
            }
        })
    }
    private hookPing() {
        const orig = Navigator.prototype.sendBeacon;
        const self = this;
        Navigator.prototype.sendBeacon = function (url: string, data?: BodyInit): boolean {
            self.onNetListener(url);
            if (self.ping && self.shouldBlock(url))
                return false;
            else
                return orig.call(this, url, data);
        }

        return () => {
            Navigator.prototype.sendBeacon = orig;
        }
    }
    private hookImg() {
        const self = this;
        const origImage = window.Image;

        (window as any).Image = function (width?: number, height?: number) {
            const nextImage = new origImage(...arguments);
            Object.defineProperty(nextImage, 'src', {
                configurable: true,
                set: function (url) {
                    self.onNetListener(url);
                    const shouldBlock = self.img && self.shouldBlock(url);

                    if (!shouldBlock) {
                        delete nextImage.src;
                        nextImage.src = url;
                    }
                },
                get: function () {
                    return undefined
                }
            })
            return nextImage;
        }


        return () => {
            window.Image = origImage;
        }
    }
    private hookXHR() {
        const origOpen = XMLHttpRequest.prototype.open;
        const origSend = XMLHttpRequest.prototype.send;
        const blocked = [] as Array<XMLHttpRequest>;
        const self = this;
        XMLHttpRequest.prototype.open = function () {
            const [method, url, async, user, password] = arguments;
            const shouldBlock = self.xhr && self.shouldBlock(url);

            self.onNetListener(url);

            if (shouldBlock) {
                blocked.push(this);
            }
            return origOpen.apply(this, [method,
                shouldBlock ? 'ubo-block://ubo-block' : url, // force throw error on send
                async === undefined ? true : async,
                user,
                password]);
        }
        XMLHttpRequest.prototype.send = function () {
            const i = blocked.indexOf(this)
            if (i !== -1) {
                blocked.splice(i, 1);

                this.dispatchEvent(self.xhrError('loadstart'))
                Object.defineProperty(this, 'readyState', { get: () => 4 })
                this.dispatchEvent(self.xhrError('error'));
                this.dispatchEvent(self.xhrError('loadend'));

                return;
            }
            return origSend.apply(this, arguments);
        }
        return () => {
            XMLHttpRequest.prototype.open = origOpen;
            XMLHttpRequest.prototype.send = origSend;
        }
    }
    private xhrError(type: 'error' | 'loadend' | 'loadstart') {
        return new ProgressEvent(type, {
            total: 0,
            loaded: 0,
            bubbles: false,
            composed: false,
            cancelable: false,
            lengthComputable: false,
        })
    }
    private parseDOMFilters(): [() => Array<ElAction>, (el: HTMLElement) => ElAction] {
        // this function creates two arrays, one of the css selector to actually search for
        // the other of the function to run to find the actual target
        // for most css selectors, the target will be the same as the element returned by the selector
        // for special selectors such as target-selector:has(child-selector),
        // the child will be searched for first, then the target parent must be found
        // the function will run .closest(target) for those
        const same = (el: HTMLElement) => el;
        const targeters = new Array(domFilters.length) as Array<(el: HTMLElement) => HTMLElement>;
        const queries = new Array(domFilters.length) as Array<string>;
        const actions = new Array(domFilters.length) as Array<(el: HTMLElement) => void>;

        for (let i = 0; i < domFilters.length; i++) {
            const { selector, action } = domFilters[i];
            const condition = selector.match(/([^:]+):([^\(]+)\(([^\)]+)\)/);
            if (condition) {
                const [, target, method, query] = condition;
                if (method !== 'has') {
                    err('uBO-DOM', 'Method', method, 'is currently not supported');
                    queries[i] = query;
                    targeters[i] = same;
                } else {
                    queries[i] = query;
                    targeters[i] = (el: HTMLElement) => el.closest(target);
                }
            } else {
                queries[i] = selector;
                targeters[i] = same;
            }
            if (action === Action.Hide) {
                actions[i] = AdBlock.forceHide;
            } else if (action === Action.Remove) {
                actions[i] = AdBlock.forceRemove;
            }

        }

        const queryAllFilters = (): Array<ElAction> => {
            const all = [];
            for (let i = 0; i < queries.length; i++) {
                const next = Array.from(document.querySelectorAll(queries[i]))
                    .map(el => targeters[i](el as HTMLElement))
                    .filter(el => el)
                    .map(el => [el, actions[i]] as ElAction)
                all.push(next);
            }
            return all.flat()
        }

        const matches = (el: HTMLElement): ElAction | null => {
            const i = queries.findIndex(query => el.nodeType === Node.ELEMENT_NODE && el.matches(query));
            return i !== -1 ? [targeters[i](el), actions[i]] : null;
        }

        return [queryAllFilters, matches];
    }
    private hookDOM() {
        const watch = new MutationObserver(muts => this.dom && muts.forEach(mut => {
            if (mut.type === 'childList') {
                mut.addedNodes.forEach((el: HTMLElement) => {
                    const match = this.matches(el);
                    if (!match) return;
                    const [target, action] = match;
                    action(target);
                });
            } else {
                const match = this.matches(mut.target as HTMLElement);
                if (!match) return;
                const [target, action] = match;
                action(target);
            }
        }))
        watch.observe(document.documentElement, {
            childList: true,
            subtree: true
        })
        return () => { watch.disconnect() };
    }
    static forceHide(el: HTMLElement, shouldLog = true) {
        if (shouldLog) log('uBO-YT-DOM', 'Hiding', el);
        el.style.setProperty('display', 'none', '!important');
        el.classList.add('force-hide');
    }
    static forceRemove(el: HTMLElement) {
        log('uBO-YT-DOM', 'Removing', el)
        AdBlock.forceHide(el, false);
        el.remove();
    }
    private hookFetch() {
        const origFetch = window.fetch;
        const self = this;
        window.fetch = function () {
            const [req] = arguments;

            const url = req instanceof Request ? req.url : req;

            if (self.fetch && netFilters.some(filter => url.indexOf(filter) !== -1)) {
                log('uBO-YT-Fetch', url);
                return Promise.reject(new TypeError('Failed to fetch'));
            } else {
                const req = origFetch.apply(this, arguments);
                self.fetchIntercept.forEach(fn => fn(arguments[0], req))
                return req;
            }
        }

        return () => {
            window.fetch = origFetch;
        }
    }
    destroy() {
        this.unhookAll();
    }
}

export { AdBlock };