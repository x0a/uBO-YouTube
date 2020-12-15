import log, { err } from './logging';
import Obj from './objutils';

let block = false;
let prune = true;

const filters = [
    'generate_204',
    'doubleclick.net',
    '/pagead',
    /get_video_info.+=adunit/g,
    'get_midroll_info'
];

const xhrError = (type: 'error' | 'loadend' | 'loadstart') => new ProgressEvent(type, {
    total: 0,
    loaded: 0,
    bubbles: false,
    composed: false,
    cancelable: false,
    lengthComputable: false,
})
const hookXhr = (onBlocked: (url: string) => void) => {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    const blocked = [] as Array<XMLHttpRequest>;
    XMLHttpRequest.prototype.open = function () {
        const [method, url, async, user, password] = arguments;
        const shouldBlock = block && filters.some(filter => filter instanceof RegExp
            ? url.match(filter)
            : url.indexOf(filter) !== -1)

        if (shouldBlock) {
            log('uBO-YT-XHR', url);
            if (url.indexOf('/get_video_info') !== -1) {
                onBlocked(url);
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

            this.dispatchEvent(xhrError('loadstart'))
            Object.defineProperty(this, 'readyState', { get: () => 4 })
            this.dispatchEvent(xhrError('error'));
            this.dispatchEvent(xhrError('loadend'));

            return;
        }
        return origSend.apply(this, arguments);
    }
    return () => {
        XMLHttpRequest.prototype.open = origOpen;
        XMLHttpRequest.prototype.send = origSend;
    }
}

const hookFetch = () => {
    const origFetch = window.fetch;
    window.fetch = function () {
        const [req] = arguments;

        const url = req instanceof Request ? req.url : req;

        if (filters.some(filter => url.indexOf(filter) !== -1)) {
            log('uBO-YT-Fetch', url);
            return Promise.reject(new TypeError('Failed to fetch'));
        } else
            return origFetch.apply(this, arguments);
    }

    return () => {
        window.fetch = origFetch;
    }
}
const hookElWatch = (): [(nextState: boolean) => void, () => void] => {
    const simpleList = [
        '#masthead-ad',
        'ytd-action-companion-ad-renderer',
        'ytd-promoted-sparkles-text-search-renderer',
        'ytd-player-legacy-desktop-watch-ads-renderer',
        'ytd-promoted-sparkles-web-renderer',
    ]
    const simpleCheck = simpleList.map(filter => {
        if ([' ', ',', '+', '>'].indexOf(filter) !== -1)
            return el => el.matches(filter);
        const selector = filter.slice(0, 1);
        const name = filter.slice(1);
        if (selector === '#')
            return el => el.id === name;
        if (selector === '.')
            return el => el.classList.contains(name)
        return el => el.localName === filter;
    }) as Array<(el: HTMLElement) => boolean>

    const customCheck = [

    ]
    const check = (el: HTMLElement) => {
        return el.id === 'masthead-ad'
            || el.localName === 'ytd-action-companion-ad-renderer'
            || el.localName === 'ytd-promoted-sparkles-text-search-renderer'
            || el.localName === 'ytd-player-legacy-desktop-watch-ads-renderer'
            || el.localName === 'ytd-promoted-sparkles-web-renderer'
            || el.localName === 'ytd-display-ad-renderer'
    }
    const fix = (el: HTMLElement) => {
        log('uBO-YT-DOM', el);
        el.style.setProperty('display', 'none', '!important');
        el.classList.add('force-hide');
        el.remove(); // also just get rid of it
    }
    const watch = new MutationObserver(muts => block && muts.forEach(mut => {
        if (mut.type === 'childList') {
            mut.addedNodes.forEach((el: HTMLElement) => check(el) && fix(el));
        } else {
            if (check(mut.target as HTMLElement)) {
                fix(mut.target as HTMLElement);
            }
        }
    }))
    const onChange = (nextState: boolean) => {
        if (nextState) {
            document.querySelectorAll('#masthead-ad,ytd-action-companion-ad-renderer,ytd-promoted-sparkles-text-search-renderer,ytd-player-legacy-desktop-watch-ads-renderer,ytd-promoted-sparkles-web-renderer,ytd-display-ad-renderer')
                .forEach(el => {
                    fix(el as HTMLElement);
                })
        }
    }
    watch.observe(document.documentElement, {
        childList: true,
        subtree: true
    })
    return [onChange, () => watch.disconnect()];
}

const hookJSON = (onAds: (ads: Array<any>) => Array<any>) => {
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
    const rules = 'playerAds adPlacements'
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
            if (block && prune)
                rules.forEach(rule => Obj.prune(res, rule));
            else
                rules.forEach(rule => Obj.replaceAll(res, rule, onAds))
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

const hookAdblock = (initBlock: boolean, onBlocked: (url: string) => void, onAds: (ads: Array<any>) => Array<any>):
    [(block: boolean, nextPrune: boolean) => any, () => boolean, () => any] => {

    const unhookXhr = hookXhr(onBlocked);
    // const unhookFetch = hookFetch();
    const [onChange, unhookEl] = hookElWatch();
    const unhookJSON = hookJSON(onAds)

    const toggleAdblock = (nextBlock: boolean, nextPrune: boolean) => {
        if (block !== nextBlock) {
            log('uBO-YT-Block', nextBlock, nextPrune);
            onChange(nextBlock);
        }
        prune = nextPrune;
        block = nextBlock;
    }
    prune = true;
    toggleAdblock(initBlock, true);

    return [toggleAdblock, () => block, () => {
        unhookXhr();
        // unhookFetch();
        unhookEl();
        unhookJSON();
    }]
}

export { hookAdblock };