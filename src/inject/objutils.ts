
const enum Rule {
    RecursiveAny,
    Array
}
class Obj {
    private static parseProps(searchProps: string): Array<string | Rule> {
        return searchProps
            .split('.')
            .filter(key => key)
            .map(prop => prop === '[]' ? '**' ? Rule.RecursiveAny : Rule.Array : prop)
            .flat()
    }
    static get(obj: any, key: string, debug = false): any {
        const props = key.split(/[\[\]\.]+/);
        let current = obj;

        for (let prop of props) {
            if (prop.length === 0) continue;
            if (current[prop] !== undefined) current = current[prop];
            else {
                if (debug) console.error('Failed at', prop, 'from', props);
                return
            }
        }

        return current;
    }
    static findKeyPath(obj: any, keyName: string, cache: Array<any> = []): string {
        if (cache.indexOf(obj) !== -1) return;
        cache.push(obj);

        const keys = Object.keys(obj);
        if (keys.indexOf(keyName) !== -1) return keyName;
        for (const key of keys) {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                const keyRes = Obj.findKeyPath(obj[key], keyName);
                if (keyRes) {
                    if (obj instanceof Array)
                        return '[' + key + ']' + keyRes
                    else
                        return key + '.' + keyRes;
                }
            }
        }
    }
    static findParent(obj: any, keyName: string, cache: Array<any> = []): any {
        if (cache.indexOf(obj) !== -1) return;
        cache.push(obj);

        const keys = Object.keys(obj);
        if (keys.indexOf(keyName) !== -1) return obj;
        for (const key of keys) {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                const keyRes = Obj.findParent(obj[key], keyName);
                if (keyRes) {
                    return keyRes;
                }
            }
        }
    }
    static prunePath(obj: any, props: Array<string | Rule>, cache: Array<any> = []): any {
        let curObj = obj;
        for (let i = 0; i < props.length; i++) {
            const prop = props[i];

            if (prop === Rule.Array) {
                if (curObj instanceof Array) {
                    const nextProps = props.slice(i + 1);
                    if (!nextProps.length) {
                        while (curObj.length) curObj.pop();
                    } else {
                        for (let j = 0; j < curObj.length; j++) {
                            if (typeof curObj[j] === 'object') { // recurse objects skip everything else
                                cache.push(curObj[j]);
                                curObj[j] = Obj.prunePath(curObj[j], props.slice(i + 1), cache)
                            }
                        }
                    }
                }
                return obj; // either way, we expected an array here. any modifications should be done with
            } else if (prop === Rule.RecursiveAny) {
                if (i + 2 > props.length) return;
                const nextProp = props[i + 1] as string;
                const nextProps = props.slice(i + 2);
                return this.prunePath(Obj.findParent(curObj, nextProp), nextProps, cache)
            } else if (typeof prop === 'string') {
                if (curObj[prop] === undefined) return obj; // we didn't find what we needed
                if (i === props.length - 1) {
                    delete curObj[prop];
                    return obj; // we made our modification so we are done
                }
                curObj = curObj[prop]; // proceed down the tree
            }
        }
        return obj;
    }
    static prune(obj: any, keyName: string): boolean {
        let parent: any;
        let found = false;
        while (parent = this.findParent(obj, keyName)){
            delete parent[keyName];
            found = true;
        }
        return found;
    }
    static replaceAll(obj: any, keyName: string, replacer: (value: any) => any): void {
        const cache = [] as Array<any>;
        let parent: any;
        while (parent = this.findParent(obj, keyName, cache))
            parent[keyName] = replacer(parent[keyName]);
    }
    static prunePaths(obj: any, paths: string): void {
        const allPaths = paths
            .split(' ')
            .map(rule => Obj.parseProps(rule));
        for (const path of allPaths) {
            this.prunePath(obj, path)
        }
    }
}

export default Obj;