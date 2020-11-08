let debug = true;
const setDebug = (next: boolean) => debug = next;

const log = (tag: string = 'uBO-YT-Log', ...args: Array<any>) =>
    debug && console.log(tag, ...args);
const err = (tag: string = 'uBO-YT-Log', ...args: Array<any>) =>
    debug && console.error(tag, ...args);
export { log, err, setDebug };
export default log;