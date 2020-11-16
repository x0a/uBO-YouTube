
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
    private getApplicableComponents(): Array<Component> {
        const href = document.location.href;
        const nextModules = this.components.filter(({ url }) => url instanceof RegExp ? url.test(href) : href.indexOf(url) !== -1)
        return nextModules.length ? nextModules : undefined
    }
    private applyComponents(nextComponents?: Array<Component>) {
        const unMount = () => (nextComponents || [])
            .filter(component => this.currentComponents.indexOf(component) === -1)
            .forEach(component => component.onUmount());
        const mount = () => (this.currentComponents || [])
            .filter(component => nextComponents.indexOf(component) === -1)
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

                    for (let node of mut.removedNodes as NodeListOf<HTMLElement>) {
                        for (let [query, fns] of allRemovedChecks) {
                            if (node.matches(query)) {
                                fns.forEach(fn => fn(node))
                            } else {
                                const child = node.querySelector(query);
                                if (child) {
                                    fns.forEach(fn => fn(child as HTMLElement))
                                }
                            }
                        }
                    }
                    for (let node of mut.addedNodes as NodeListOf<HTMLElement>) {
                        for (let [query, fns] of allAddedChecks) {
                            if ((node as HTMLElement).matches(query)) {
                                fns.forEach(fn => fn(node));
                            } else {
                                const child = node.querySelector(query) as HTMLElement;
                                if (child) {
                                    fns.forEach(fn => fn(node))
                                }
                            }
                        }
                    }
                }
                for (let [query, fns] of allModifiedChecks) {
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
        const attribs = this.components.map(page => page.attribs)
            .reduce((all, attrib) => all.concat(attrib.reduce((unlisted, _attrib) =>
                all.indexOf(_attrib) === -1 ? unlisted.concat(_attrib) : unlisted)), []);
        this.currentComponents = this.getApplicableComponents();
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
    attribs: Array<string>
    constructor(url: string | RegExp) {
        this.url = url;
        this.attribs = [];
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