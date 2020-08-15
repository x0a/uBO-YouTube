let block = true;
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
    return () => { }
}
const hookElWatch = () => {
    const check = (el: HTMLElement) => {
        return el.id === 'masthead-ad'
            || el.localName === 'ytd-action-companion-ad-renderer'
            || el.localName === 'ytd-promoted-sparkles-text-search-renderer'
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
    watch.observe(document.documentElement, {
        childList: true,
        subtree: true
    })
    return () => watch.disconnect();
}
const hookAdblock = (initBlock: boolean): [(block: boolean) => any, () => any] => {
    block = initBlock;
    const unhookXhr = hookXhr();
    const unhookFetch = hookFetch();
    const unhookEl = hookElWatch();
    return [toggleAdblock, () => {
        unhookXhr();
        unhookFetch();
        unhookEl();
    }]
}
const toggleAdblock = (_block: boolean) => {
    block = _block;
}

export { hookAdblock };