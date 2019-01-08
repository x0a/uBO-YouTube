
const clickEvents = (full, el) => {
    if (!el || full) return;

    el.addEventListener("mousedown", () => el.classList.add("btn-pressed"))
    el.addEventListener("mouseup", () => el.classList.remove("btn-pressed"))
}
const noop = () => { };
const deepCopy = object => JSON.parse(JSON.stringify(object));
const promisify = (method) => {
    // when called, adds a callback;
    return function () {
        return new Promise((resolve, reject) => {
            let args = [].slice.call(arguments);

            args.push(function () {
                const err = chrome.runtime.lastError
                if (err) {
                    return reject(err);
                }

                let args = [].slice.call(arguments);
                if (args.length > 1) {
                    resolve(args);
                } else {
                    resolve(args[0])
                }
            });
            method.apply(null, args);
        });
    }
}
export { clickEvents, noop, deepCopy, promisify }