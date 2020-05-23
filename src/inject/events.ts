
interface InterceptedEvent {
    name: string;
    fn: EventListener,
    capture: boolean
}
interface EventRequest {
    eventName: string,
    resolve: (event: InterceptedEvent) => any
}
interface EventFilter {
    eventName: string,
    filter: (target: EventTarget, event: InterceptedEvent) => boolean;
}
const hookEvents = (debug = false): [
    (element: EventTarget, name: string) => Array<InterceptedEvent>,
    (element: EventTarget, name: string, expires?: number) => Promise<InterceptedEvent>,
    (name: string, filter: (target: EventTarget, event: InterceptedEvent) => boolean) => void,
    () => void
] => {
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;
    const eventMap = new Map() as Map<EventTarget, Array<InterceptedEvent>>;
    const awaitMap = new Map() as Map<EventTarget, Array<EventRequest>>;
    let filters = [] as Array<EventFilter>;

    EventTarget.prototype.addEventListener = function () {
        let [name, fn, capture] = arguments;
        capture = !!capture
        const event = { name, fn, capture };
        const self = this as EventTarget; // for typescript type safety

        if (filters.some(({ eventName, filter }) => name === eventName && filter(self, event) === false)) return;

        originalAdd.apply(this, arguments); // run first to allow native method to halt execution in case of error;
        
        if(!debug) return;

        eventMap.set(self, (eventMap.get(self) || [])
            .concat(event));

        if (awaitMap.has(self)) {
            awaitMap.set(self, awaitMap.get(self).filter(({ eventName, resolve }) => {
                if (eventName === name) {
                    resolve(event);
                    return false;
                }
                return true;
            }))
        }
    }

    EventTarget.prototype.removeEventListener = function () {
        originalRemove.apply(this, arguments);

        const self = this as EventTarget; // for typescript type safety
        let [_name, _fn, _capture] = arguments;
        _capture = !!_capture;

        eventMap.set(self, (eventMap.get(self) || [])
            .filter(({ name, fn, capture }) =>
                !(
                    name === _name
                    && fn === _fn
                    && capture === _capture)))
    }
    const getEventListeners = (element: EventTarget, eventName: string): Array<InterceptedEvent> => {
        return (eventMap.get(element) || [])
            .filter(({ name }) => name === eventName);
    }
    const awaitEventListener = (element: EventTarget, eventName: string, expires = -1) => {
        const self = this as EventTarget;
        return new Promise((resolve, reject) => {
            const events = getEventListeners(element, eventName);

            if (events.length) {
                resolve(events[0]);
            } else {
                awaitMap.set(self, (awaitMap.get(self) || []).concat({ eventName, resolve }))

                if (expires !== -1) setTimeout(() => {
                    awaitMap.set(self, awaitMap.get(self)
                        .filter(awaiting => awaiting.resolve !== resolve));
                    reject();
                }, expires);
            }
        }) as Promise<InterceptedEvent>
    }

    const filterEventListeners = (eventName: string, filter: (target: EventTarget, event: InterceptedEvent) => boolean) => {
        filters = filters.concat({ eventName, filter });
    }

    return [
        getEventListeners,
        awaitEventListener,
        filterEventListeners,
        () => {
            EventTarget.prototype.addEventListener = originalAdd;
            EventTarget.prototype.removeEventListener = originalRemove;
        }]
}

export default hookEvents;