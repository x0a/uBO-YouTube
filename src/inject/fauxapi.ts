import { Ad } from 'src/typings';
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

const getVideoData = (videoId: string, metadata: any): Ad => {
    const primary = Obj.findParent(metadata, 'videoPrimaryInfoRenderer')?.videoPrimaryInfoRenderer;
    const secondary = Obj.findParent(metadata, 'videoSecondaryInfoRenderer')?.videoSecondaryInfoRenderer;

    if (!primary || !secondary) throw 'Could not find primary or secondary video information';


    const title = Obj.get(primary, '.title.runs[0].text') || '';
    const ucid = Obj.get(secondary, '.owner.videoOwnerRenderer.title.runs[0].navigationEndpoint.browseEndpoint.browseId') || ''
    const author = Obj.get(secondary, ".owner.videoOwnerRenderer.title.runs[0].text") || '';
    const channelURL = Obj.get(secondary, ".owner.videoOwnerRenderer.navigationEndpoint.browseEndpoint.canonicalBaseUrl") || '';

    const channelId = { id: '', display: '', username: '' };
    channelId.id = ucid;
    channelId.display = author;

    if (!channelId.id) throw 'Could not find appropriate channel ID for the ad';

    return {
        details: {},
        channelId,
        video_id: videoId,
        channel_url: channelURL,
        length_seconds: 0,
        player_response: '',
        ucid,
        author,
        blocked: false,
        title,
        timestamp: Date.now() + '',
    } as Ad;
}
const getVideoId = (ad: any) => {
    const owner = Obj.findParent(ad, 'adVideoId');
    if (owner)
        return owner.adVideoId;
    return '';
}

export {getMetadata, getVideoData};