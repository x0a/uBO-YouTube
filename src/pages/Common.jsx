
const clickEvents = (full, el) => {
    if (!el || full) return;

    el.addEventListener("mousedown", () => el.classList.add("btn-pressed"))
    el.addEventListener("mouseup", () => el.classList.remove("btn-pressed"))
}
const noop = () => { };
const deepCopy = object => JSON.parse(JSON.stringify(object));
const guaranteeCallback = (func, args, callback) => {
    let ret = func(args, callback);
    if (ret instanceof Promise) {
        ret.then(callback);
    }
}
export { clickEvents, noop, deepCopy, guaranteeCallback }