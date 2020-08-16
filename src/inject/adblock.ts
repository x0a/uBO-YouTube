let block = false;
const filters = [
    'generate_204',
    'doubleclick.net',
    '/pagead'
]
const hookXhr = () => {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    const reqMap = new WeakMap();
    XMLHttpRequest.prototype.open = function () {
        const [method, url, async] = arguments;
        reqMap.set(this, { method, url, async });
        return origOpen.apply(this, arguments);
    }
    XMLHttpRequest.prototype.send = function () {
        const { url } = reqMap.get(this)
        if (filters.some(filter => url.indexOf(filter) !== -1)) {
            console.log('blocked', url);

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
                    fix(el as HTMLElement)
                    console.log(el);
                })
        }
    }
    watch.observe(document.documentElement, {
        childList: true,
        subtree: true
    })
    return [onChange, () => watch.disconnect()];
}
const hookAdblock = (initBlock: boolean): [(block: boolean) => any, () => any] => {
    const unhookXhr = hookXhr();
    // const unhookFetch = hookFetch();
    const [onChange, unhookEl] = hookElWatch();
    const toggleAdblock = (nextBlock: boolean) => {
        if (block !== nextBlock) {
            onChange(nextBlock);
        }
        block = nextBlock;
    }
    toggleAdblock(initBlock);
    return [toggleAdblock, () => {
        unhookXhr();
        // unhookFetch();
        unhookEl();
    }]
}


export { hookAdblock };