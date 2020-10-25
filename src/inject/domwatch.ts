interface ElementRule {
    id?: string;
    tag?: string;
    class?: string;
    parent?: ElementRule;
    not?: ElementRule;
}
class SiteWatch {
    pages: Array<PageWatch>;
    currentPage?: PageWatch;
    observer: MutationObserver;
    lastURL: string;
    constructor() {
        this.pages = [];
        this.currentPage = this.getPage();
        this.lastURL = document.location.href
        this.observer = new MutationObserver(muts => {
            if (document.location.href !== this.lastURL) {
                const nextPage = this.getPage();
                if (this.currentPage !== nextPage) {
                    this.currentPage = nextPage;
                    nextPage.onMount();
                }
            }
            if (!this.currentPage) return;

            for (let mut of muts) {
                if (mut.type === 'childList') {

                    for (let node of mut.removedNodes as NodeListOf<HTMLElement>) {
                        for (let [query, fn] of this.currentPage.checkRemoved) {
                            if (node.matches(query)) {
                                fn();
                            } else {
                                const child = node.querySelector(query);
                                if (child) {
                                    fn();
                                }
                            }
                        }
                    }
                    for (let node of mut.addedNodes as NodeListOf<HTMLElement>) {
                        for (let [query, fn] of this.currentPage.checkAdded) {
                            if ((node as HTMLElement).matches(query)) {
                                fn(node);
                            } else {
                                const child = node.querySelector(query) as HTMLElement;
                                if (child) {
                                    fn(child);
                                }
                            }
                        }
                    }
                }
                for (let [query, fn] of this.currentPage.checkModified) {
                    if ((mut.target as HTMLElement).matches(query))
                        fn((mut.target as HTMLElement));
                }
            }
        })
    }
    getPage(): PageWatch {
        for (let page of this.pages)
            if (document.location.href.indexOf(page.url) !== -1)
                return page;
    }
    add(page: PageWatch) {
        this.pages.push(page);
    }
    start() {
        const attribs = this.pages.map(page => page.attribs)
            .reduce((all, attrib) => all.concat(attrib.reduce((unlisted, _attrib) => all.indexOf(_attrib) === -1 ? unlisted.concat(_attrib) : unlisted)), []);
        this.currentPage = this.getPage();
        this.lastURL = document.location.href

        if (this.currentPage) {
            this.currentPage.onMount();
            for (let [query, fn] of this.currentPage.checkAdded) {
                const el = document.querySelector(query) as HTMLElement;
                if (el) fn(el);
            }
        }
        this.observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: attribs
        })
    }
    destroy() {
        this.observer.disconnect();
    }
}

class PageWatch {
    url: string;
    checkRemoved: Map<string, () => void>;
    checkAdded: Map<string, (el: HTMLElement) => void>;
    checkModified: Map<string, (el: HTMLElement) => void>;
    attribs: Array<string>
    constructor(url: string) {
        this.url = url;
        this.attribs = [];
    }
    onMount() /* override */ {

    }
    on(query: string, fn: (el?: HTMLElement) => void, attribs?: Array<string>) {
        this.checkRemoved.set(query, fn)
        this.checkAdded.set(query, fn)
        this.checkModified.set(query, fn)
        if (attribs) {
            for (let attrib of attribs) {
                if (this.attribs.indexOf(attrib) === -1) {
                    this.attribs = this.attribs.concat(attrib);
                }
            }
        }
    }
}