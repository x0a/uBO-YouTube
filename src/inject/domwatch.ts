
class SiteWatch {
    components: Array<Component>;
    currentComponents?: Array<Component>;
    currentChecker?: (muts: Array<MutationRecord>) => void;
    observer: MutationObserver;
    lastURL: string;
    constructor() {
        this.components = [];
        this.currentComponents = this.getApplicableComponents();
        this.lastURL = document.location.href
        this.observer = new MutationObserver(muts => {
            if (document.location.href !== this.lastURL) {
                this.applyComponents(this.getApplicableComponents());
            }

            if (!this.currentComponents) return;

            this.currentChecker(muts);
        })
    }
    private getApplicableComponents(href: string = document.location.href): Array<Component> {
        const nextModules = this.components.filter(({ url }) => url instanceof RegExp ? url.test(href) : href.indexOf(url) !== -1)
        return nextModules.length ? nextModules : undefined
    }
    private applyComponents(nextComponents?: Array<Component>) {
        const _nextComponents = nextComponents || [];
        const _currentComponents = this.currentComponents || [];
        const unMount = () => _nextComponents
            .filter(component => _currentComponents.indexOf(component) === -1 || component.remountOnChange)
            .forEach(component => component.onUmount());
        const mount = () => _currentComponents
            .filter(component => _nextComponents.indexOf(component) === -1 || component.remountOnChange)
            .forEach(component => component.onMount());
        if (!nextComponents) {
            unMount();
            this.currentComponents = undefined;
            this.currentChecker = undefined;
        } else {
            unMount();
            mount();
            this.currentComponents = nextComponents;
            this.currentChecker = this.getCheckAll(nextComponents);
        }
    }
    private getCheckAll(components: Array<Component>) {
        const allRemovedChecks = this.mergeChecks(components.map(component => component.checkRemoved))
        const allAddedChecks = this.mergeChecks(components.map(component => component.checkAdded));
        const allModifiedChecks = this.mergeChecks(components.map(component => component.checkModified))
        return (muts: Array<MutationRecord>) => {
            for (let mut of muts) {
                if (mut.type === 'childList') {
                    for (const node of mut.removedNodes as NodeListOf<HTMLElement>) {
                        if(node.nodeType === Node.TEXT_NODE) continue;
                        for (let [query, fns] of allRemovedChecks) {
                            if (node.matches(query)) {
                                fns.forEach(fn => fn(node))
                            } else {
                                const child = node.querySelector(query) as HTMLElement;
                                if (child) {
                                    fns.forEach(fn => fn(child))
                                }
                            }
                        }
                    }
                    for (const node of mut.addedNodes as NodeListOf<HTMLElement>) {
                        if(node.nodeType === Node.TEXT_NODE) continue;
                        for (let [query, fns] of allAddedChecks) {
                            if ((node as HTMLElement).matches(query)) {
                                fns.forEach(fn => fn(node));
                            } else {
                                const child = node.querySelector(query) as HTMLElement;
                                if (child) {
                                    fns.forEach(fn => fn(child))
                                }
                            }
                        }
                    }
                }
                for (const [query, fns] of allModifiedChecks) {
                    if ((mut.target as HTMLElement).matches(query))
                        fns.forEach(fn => fn(mut.target as HTMLElement))
                }
            }
        }
    }
    private mergeChecks(allChecks: Array<Map<string, (el?: HTMLElement) => void>>) {
        const nextChecks = new Map() as Map<string, Array<(el?: HTMLElement) => void>>;
        for (const check of allChecks)
            for (const [query, fn] of check) {
                nextChecks.set(query, (nextChecks.get(query) || []).concat(fn))
            }
        return nextChecks;
    }
    add(page: Component) {
        this.components.push(page);
    }
    start() {
        const attribs = [...new Set(this.components.map(component => component.attribs).flat())];
        this.applyComponents(this.getApplicableComponents());
        this.lastURL = document.location.href

        if (this.currentComponents) {
            this.currentComponents.forEach(component => {
                component.onMount();
                for (let [query, fn] of component.checkAdded) {
                    const el = document.querySelector(query) as HTMLElement;
                    if (el) fn(el);
                }
            });


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
        this.components = [];
        this.currentComponents = undefined;
        this.currentChecker = undefined
    }
}

class Component {
    url: string | RegExp;
    checkRemoved: Map<string, () => void>;
    checkAdded: Map<string, (el: HTMLElement) => void>;
    checkModified: Map<string, (el: HTMLElement) => void>;
    attribs: Array<string>;
    remountOnChange: boolean;

    constructor(url: string | RegExp, remountOnChange = false) {
        this.url = url;
        this.remountOnChange = remountOnChange;
        this.attribs = [];
        this.checkRemoved = new Map();
        this.checkAdded = new Map();
        this.checkModified = new Map();
    }
    onMount() /* override */ {

    }
    onUmount() /* override */ {

    }

    onAll(query: string, fn: (el?: HTMLElement) => void, attribs?: Array<string>) {
        this.onTree(query, fn);
        if (attribs) {
            this.onModified(query, fn, attribs);
        } else {
            this.checkModified.set(query, fn);
        }
    }
    onTree(query: string, fn: (el?: HTMLElement) => void) {
        this.checkAdded.set(query, fn);
        this.checkRemoved.set(query, fn);
    }
    onModified(query: string, fn: (el: HTMLElement) => void, attribs: Array<string>) {
        this.checkModified.set(query, fn);
        this.appendAttribs(attribs)
    }
    private appendAttribs(attribs: Array<string>) {
        for (let attrib of attribs) {
            if (this.attribs.indexOf(attrib) === -1) {
                this.attribs = this.attribs.concat(attrib);
            }
        }
    }
}

export { SiteWatch, Component }