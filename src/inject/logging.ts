let debug = true;

const setDebug = (next: boolean) => debug = next;
const pad = (num: number) => (num + '').padStart(2, '0');

const time = () => {
    const date = new Date();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${hours}:${minutes}:${seconds}`;
}
const log = (tag: string = 'uBO-YT-Log', ...args: Array<any>) =>
    debug && console.log(time(), tag, ...args);
const err = (tag: string = 'uBO-YT-Log', ...args: Array<any>) =>
    debug && console.error(time(), tag, ...args);
    
export { log, err, setDebug };
export default log;