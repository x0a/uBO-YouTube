const clickEvents = (full: boolean, el: HTMLElement) => {
    if (!el || full) return;

    el.addEventListener("mousedown", () => el.classList.add("btn-pressed"))
    el.addEventListener("mouseup", () => el.classList.remove("btn-pressed"))
}
const noop = () => { };
const deepCopy = <T>(object: T): T => JSON.parse(JSON.stringify(object));

export { clickEvents, noop, deepCopy}