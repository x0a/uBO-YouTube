import log, { err } from './logging';
import Obj from './objutils';

const jsonRules = 'playerAds adPlacements';
const netFilters = [
    'generate_204',
    'doubleclick.net',
    '/pagead',
    /get_video_info.+=adunit/g,
    'get_midroll_info'
];
const domFilters = ['#masthead-ad',
    'ytd-action-companion-ad-renderer',
    'ytd-promoted-sparkles-text-search-renderer',
    'ytd-player-legacy-desktop-watch-ads-renderer',
    'ytd-promoted-sparkles-web-renderer',
    //'ytd-rich-item-item-renderer:has(ytd-display-ad-renderer)',
    'ytd-display-ad-renderer'];

class AdBlock {
    private prune: boolean;
    private xhr: boolean;
    private dom: boolean;
    private fetch: boolean;
    private onNetListener: (url: string) => void;
    private onAdsListener: (ads: Array<any>) => Array<any>;
    private unhookAll: () => void;
    constructor(block: boolean) {
        this.onNetListener = () => { };
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
    toggleNet(block: boolean){
        this.xhr = block;
        this.fetch = block;
    }
    togglePrune(block: boolean) {
        this.prune = block;
    }
    toggleDOM(block: boolean) {
        if (!this.dom && block) {
            document.querySelectorAll(domFilters.join(','))
                .forEach(el => this.forceRemove(el as HTMLElement));
        }
        this.dom = block;
    }
    onNet(fn: (url: string) => void) {
        this.onNetListener = fn;
    }
    onAds(fn: (ads: Array<any>) => Array<any>) {
        this.onAdsListener = fn;
    }
    private hookAll(): () => void {
        const unhookJSON = this.hookJSON();
        const unhookXHR = this.hookXHR();
        const unhookDOM = this.hookDOM();
        const unhookFetch = this.hookFetch();
        return () => {
            this.toggleAll(false)
            unhookJSON();
            unhookXHR();
            unhookDOM();
            unhookFetch();
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
            return pruneOnly(nextParse.apply(this, arguments));
        };
        const pruneAsync = function () {
            return nextParseFetch.apply(this, arguments)
                .then((json: any) => pruneOnly(json))
        }
        const pruneOnly = (obj: any) => {
            // Objects created by nextWindow.JSON.parse will be instances of nextWindow.Object/nextwindow.Array
            // therefor they will fail the `instanceof Object` and `instanceof Array` checks that YouTube does
            // Fix is to recreate the resulting objects in the current execution context
            const res = recontextualize(obj);
            try {
                if (this.prune)
                    rules.forEach(rule => Obj.prune(res, rule));
                else
                    rules.forEach(rule => Obj.replaceAll(res, rule, this.onAdsListener))
            } catch (e) {
                err('uBO-YT-Prune', e, obj)
            }
            return res;
        }

        try {
            JSON.parse = parsePrune
            Response.prototype.json = pruneAsync;
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

    private hookXHR() {
        const origOpen = XMLHttpRequest.prototype.open;
        const origSend = XMLHttpRequest.prototype.send;
        const blocked = [] as Array<XMLHttpRequest>;
        const self = this;
        XMLHttpRequest.prototype.open = function () {
            const [method, url, async, user, password] = arguments;
            const shouldBlock = self.xhr && netFilters.some(filter => filter instanceof RegExp
                ? url.match(filter)
                : url.indexOf(filter) !== -1)

            if (shouldBlock) {
                log('uBO-YT-XHR', url);
                if (url.indexOf('/get_video_info') !== -1) {
                    self.onNetListener(url);
                }
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
    private hookDOM() {
        const check = (el: HTMLElement) => {
            return !!domFilters.find(query => el.nodeType === Node.ELEMENT_NODE && el.matches(query));
        }
        const watch = new MutationObserver(muts => this.dom && muts.forEach(mut => {
            if (mut.type === 'childList') {
                mut.addedNodes.forEach((el: HTMLElement) => check(el) && this.forceRemove(el));
            } else {
                if (check(mut.target as HTMLElement)) {
                    this.forceRemove(mut.target as HTMLElement);
                }
            }
        }))
        watch.observe(document.documentElement, {
            childList: true,
            subtree: true
        })
        return () => { watch.disconnect() };
    }
    private forceRemove(el: HTMLElement) {
        log('uBO-YT-DOM', el);
        el.style.setProperty('display', 'none', '!important');
        el.classList.add('force-hide');
        el.remove(); // also just get rid of it
    }
    private hookFetch() {
        const origFetch = window.fetch;
        window.fetch = function () {
            const [req] = arguments;

            const url = req instanceof Request ? req.url : req;

            if (netFilters.some(filter => url.indexOf(filter) !== -1)) {
                log('uBO-YT-Fetch', url);
                return Promise.reject(new TypeError('Failed to fetch'));
            } else
                return origFetch.apply(this, arguments);
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