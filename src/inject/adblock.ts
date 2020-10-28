let block = false;
const filters = [
    'generate_204',
    'doubleclick.net',
    '/pagead',
    /get_video_info.+=adunit/g,
    'get_midroll_info'
];

const hookXhr = (onBlocked: (url: string) => void) => {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function () {
        const [method, url, async, user, password] = arguments;
        const shouldBlock = block && filters.some(filter => filter instanceof RegExp
            ? url.match(filter)
            : url.indexOf(filter) !== -1)

        if (shouldBlock) {
            console.log('uBO-YT-BlockXHR', url);
            if (url.indexOf('/get_video_info') !== -1) {
                onBlocked(url);
            }
        }

        return origOpen.apply(this, [method,
            shouldBlock ? 'ubo-block://ubo-block' : url, // force throw error on send
            async === undefined ? true : async,
            user,
            password]);
    }
    XMLHttpRequest.prototype.send = function () {
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
        const [url] = arguments;
        if (filters.some(filter => url.indexOf(filter) !== -1))
            return Promise.reject();
        else
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
    }
    const fix = (el: HTMLElement) => {
        el.style.setProperty('display', 'none', '!important');
        el.classList.add('force-hide');
        el.remove(); // also just get rid of it
    }
    const watch = new MutationObserver(muts => block && muts.forEach(mut => {
        if (mut.type === 'childList') {
            mut.addedNodes.forEach((el: HTMLElement) => check(el) && el.style.setProperty('display', 'none', 'important'));
        } else {
            if (check(mut.target as HTMLElement)) {
                (mut.target as HTMLElement).style.setProperty('display', 'none', 'important');
            }
        }
    }))
    const onChange = (nextState: boolean) => {
        if (nextState) {
            document.querySelectorAll('#masthead-ad,ytd-action-companion-ad-renderer,ytd-promoted-sparkles-text-search-renderer,ytd-player-legacy-desktop-watch-ads-renderer,ytd-promoted-sparkles-web-renderer')
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
const hookAdblock = (initBlock: boolean, onBlocked: (url: string) => void): [(block: boolean) => any, () => boolean, () => any] => {
    const unhookXhr = hookXhr(onBlocked);
    // const unhookFetch = hookFetch();
    const [onChange, unhookEl] = hookElWatch();
    const toggleAdblock = (nextBlock: boolean) => {
        if (block !== nextBlock) {
            console.log('adblocking is now', nextBlock);
            onChange(nextBlock);
        }
        block = nextBlock;
    }
    toggleAdblock(initBlock);
    const unhookJSON = hookJSON();
    return [toggleAdblock, () => block, () => {
        unhookXhr();
        // unhookFetch();
        unhookEl();
        unhookJSON();
    }]
}
const hookJSON = () => {
    const frame = document.createElement('iframe');
    frame.style.display = 'none';
    document.documentElement.appendChild(frame);

    const nextWindow = (frame.contentWindow as any)
    const nextParse = nextWindow.JSON.parse;
    const uBOParse = JSON.parse;
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
    const parseProps = (searchProps: string) => searchProps
        .split('.')
        .filter(key => key)
        .map(part => part.split('[]').map(_part => _part || Array))
        .flat()
    const pruneJSON = (obj: any, props: Array<string | ArrayConstructor>, cache: Array<any> = []): any => {
        let curObj = obj;
        for (let i = 0; i < props.length; i++) {
            const prop = props[i];

            if (prop === Array) {
                if (curObj instanceof Array) {
                    const nextProps = props.slice(i + 1);
                    if (!nextProps.length) {
                        while (curObj.length) curObj.pop();
                    } else {
                        for (let j = 0; j < curObj.length; j++) {
                            if (typeof curObj[j] === 'object'){ // recurse objects skip everything else
                                cache.push(curObj[j]);
                                curObj[j] = pruneJSON(curObj[j], props.slice(i + 1), cache)
                            }
                        }
                    }
                }
                return obj; // either way, we expected an array here. any modifications should be done with
            } else if (typeof prop === 'string') {
                if (curObj[prop] === undefined) return obj; // we didn't find what we needed
                if (i === props.length - 1) {
                    // console.log('uBO-JSON-prune', curObj[prop])
                    delete curObj[prop];
                    return obj; // we made our modification so we are done
                }
                curObj = curObj[prop]; // proceed down the tree
            }
        }
        return obj;
    }
    const rules = '[].playerResponse.playerAds playerResponse.adPlacements playerResponse.playerAds adPlacements playerAds'
        .split(' ')
        .map(rule => parseProps(rule));
    const parsePrune = function () {
        // Objects created by nextWindow.JSON.parse will be instances of nextWindow.Object/nextwindow.Array
        // therefor they will fail the `instanceof Object` and `instanceof Array` checks that YouTube does
        // Fix is to recreate the resulting objects in the current execution context
        const res = recontextualize(nextParse.apply(this, arguments))
        try {
            if (block)
                rules.forEach(rule => pruneJSON(res, rule));
        } catch (e) {
            console.error('uBO-YT-Prune', e)
        }
        return res;
    };

    try {
        JSON.parse = parsePrune
        Object.freeze(JSON);
    } catch (e) {
        console.error('uBO-YT', 'Unable to replace JSON.parse');
    }
    return () => {
        JSON.parse = uBOParse;
    }
}
export { hookAdblock };