
const hookEvents = () => {
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;

    EventTarget.prototype.addEventListener = function () {
        originalAdd.apply(this, arguments); // run first to allow native method to halt execution in case of error;

        const self = this as EventTarget; // for typescript type safety
        let [name, fn, capture] = arguments;
        capture = !!capture

        if (!self.eventListeners) self.eventListeners = [];
        self.eventListeners.push({ name, fn, capture });

        if (self.awaiting) {
            const i = self.awaiting.findIndex(({ eventName }) => eventName === name);
            if (i !== -1) {
                self.awaiting[i].resolve({ name, fn, capture });
                self.awaiting.splice(i, 1);
            }
        }
    }

    EventTarget.prototype.removeEventListener = function () {
        originalRemove.apply(this, arguments);

        const self = this as EventTarget; // for typescript type safety
        let [_name, _fn, _capture] = arguments;
        _capture = !!_capture;

        self.eventListeners = this.eventListeners
            ? self.eventListeners.filter(({ name, fn, capture }) =>
                !(
                    name === _name
                    && fn === _fn
                    && capture === _capture))
            : [];
    }

    EventTarget.prototype.getEventListeners = function (eventName) {
        const self = this as EventTarget; // for typescript type safety

        return self.eventListeners
            ? self.eventListeners.filter(({ name }) => name === eventName)
            : []
    }

    EventTarget.prototype.awaitEventListener = function (eventName, expiresMs = -1) {
        const self = this as EventTarget; // for typescript type safety

        return new Promise((resolve, reject) => {
            const events = self.getEventListeners(eventName);
            if (events.length) {
                resolve(events[0]);
            } else {
                if (!self.awaiting) self.awaiting = [];
                const i = self.awaiting.push({ eventName, resolve })
                if (expiresMs !== -1) setTimeout(() => {
                    self.awaiting.splice(i - 1, 1);
                    reject();
                }, expiresMs);
            }
        })
    }

    return () => {
        EventTarget.prototype.addEventListener = originalAdd;
        EventTarget.prototype.removeEventListener = originalRemove;
        delete EventTarget.prototype.awaitEventListener;
        delete EventTarget.prototype.getEventListeners;
    }
}

export default hookEvents;