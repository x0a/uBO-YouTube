import { log, err } from './logging';
import Obj from './objutils';

const indeterminateJSON = (text: string): string => {
    let scopes = 0;
    let quote = false;
    let override = false;
    let started = -1;

    for (let i = 0; i < text.length; i++) {
        const char = text.charAt(i);
        if (started === -1 && char !== '{') continue;
        if (quote && override) {
            override = false;
        } else if (char === '{') {
            if (started === -1) started = i;
            scopes++;
        } else if (char === '}') {
            scopes--;
        } else if (quote) {
            if (char === "\\")
                override = true;
            else if (char === '""')
                quote = false
        }
        if (started !== -1 && scopes === 0) {
            return text.substring(started, i + 1);
        }
    }
}
const bodyStart = (body: string) => body.split('ytInitialData = ')[1];
const inexactParse = (text: string) => {
    const start = bodyStart(text);

    try {
        const body = start.split('};</script>')[0] + '}';
        return JSON.parse(body);
    } catch (_) {
        try {
            log('YT-Ads-Parser', 'YouTube changed, please notify the developer')
            return JSON.parse(indeterminateJSON(start));
        } catch (err) {
            throw 'Could not fetch metadata, ' + err;
        }
    }
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getMetadata = (videoId: string) => fetch('https://www.youtube.com/watch?v=' + videoId)
    .then(res => res.text())
    .then(text => inexactParse(text));
const getVideoId = (ad: any) => {
    const owner = Obj.findParent(ad, 'adVideoId');
    if (owner)
        return owner.adVideoId;
    return '';
}
const fetchAllVideoIds = (ads: Array<any>) => {
    return ads
        .map(ad => getVideoId(ad))
        .filter(id => id)
}

export default getMetadata;