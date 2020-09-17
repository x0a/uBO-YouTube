let block = false;
const filters = [
    'generate_204',
    'doubleclick.net',
    '/pagead',
    /get_video_info.+=adunit/g
];

const hookXhr = () => {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function () {
        const [method, url, async, user, password] = arguments;
        const shouldBlock = block && filters.some(filter => filter instanceof RegExp
            ? url.match(filter)
            : url.indexOf(filter) !== -1)

        if (shouldBlock) {
            console.log('Will block', url);
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
const hookAdblock = (initBlock: boolean): [(block: boolean) => any, () => boolean, () => any] => {
    const unhookXhr = hookXhr();
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
    return [toggleAdblock, () => block, () => {
        unhookXhr();
        // unhookFetch();
        unhookEl();
    }]
}


export { hookAdblock };