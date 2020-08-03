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

const hookAdblock = (initBlock: boolean): [(block: boolean) => any, () => any] => {
    block = initBlock;
    const unhookXhr = hookXhr();
    const unhookFetch = hookFetch();

    return [toggleAdblock, () => {
        unhookXhr();
        unhookFetch();
    }]
}
const toggleAdblock = (_block: boolean) => {
    block = _block;
}

export { hookAdblock };