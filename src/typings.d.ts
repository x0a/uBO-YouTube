type Channel = {
    display: string,
    username: string,
    id: string
}

type ChannelList = Array<Channel>;

interface HostMessage {
    action: string,
    subaction?: string,
    param?: any
}
interface ClientMessage {
    error: string;
    response: any;
}
type AutoSkipSeconds = 0 | 5 | 30 | 60
interface Settings<T = ChannelList> {
    whitelisted: T;
    blacklisted: T;
    muted: T;
    exclude: T;
    muteAll: boolean;
    skipOverlays: boolean;
    skipAdErrors: boolean;
    pauseAfterAd: boolean;
    autoWhite: boolean;
    autoSkip: boolean;
    autoSkipSeconds: AutoSkipSeconds;
    keyboardSkip: boolean;
    verifyWl: boolean;
    limitAds: boolean;
    limitAdsQty: number;
    forceWhite: boolean;
}
type ReadonlySettings<T = ChannelList> = Readonly<Settings<T>>;
interface AccessURL {
    ICO: string;
}

type Action = {
    method: Function;
    lastExecuted: number;
    timeoutId: number;
}

interface MutationElement extends MutationRecord {
    target: HTMLElement;
    addedNodes: NodeListOf<Element>;
    removedNodes: NodeListOf<Element>;
}

interface MenuItem extends HTMLButtonElement {
    setText(newText: string): void;
    setIcon(newIcon: Element): void;
    setDescription(newDescription: string): void;
    setDefaults(): void;
}

interface InfoLink extends HTMLAnchorElement {
    channelId: string;
    sethref: string;
    whitelisted: boolean;
}

interface VideoBasic extends HTMLDivElement {
    processed: boolean;
}

interface VideoPoly extends HTMLDivElement {
    data: any;
}

interface PendingItem {
    promise: Promise<Ad>;
    details: any;
}

interface Ad {
    [propertyName: string]: any;
    details?: any;
    channelId?: Channel;
    video_id?: string;
    channel_url?: string;
    length_seconds?: number;
    player_response?: string;
    ucid?: string;
    author?: string;
    blocked?: boolean;
    title?: string;
    timestamp?: string;
}

interface Video {
    [propertyName: string]: any;
    video_id: string;
}
interface PolyThumb {
    url: string;
    width: number;
    height: number
}
interface PolyNavigationEndpoint {
    clickTrackingParams: string
    commandMetadata: {
        webCommandMetadata: {
            url: string;
            webPageType: string
        }
    }
    browseEndpoint: {
        browseId: string
    }
}
interface PolyRun {
    text: string;
    navigationEndpoint: PolyNavigationEndpoint;
}
interface PolyBadge {
    metadataBadgeRenderer: {
        icon: {
            iconType: string;
        }
        style: string;
        tooltip: string;
        trackingParams: string;
    }
}
interface PolyData {
    thumbnail: {
        thumbnails: Array<PolyThumb>
    }

    title: {
        runs: Array<PolyRun>;
    }
    navigationEndpoint: PolyNavigationEndpoint;
    subscriberCountText: {
        simpleText: string;
    }
    badges: Array<PolyBadge>;
}

interface ParsedURL {
    pathname: string;
    params: any;
}

export {
    Channel, ChannelList, MutationElement,
    Settings, ReadonlySettings, Action, AccessURL,
    MenuItem, InfoLink, VideoBasic, VideoPoly,
    Ad, PendingItem, ParsedURL, HostMessage, ClientMessage,
    AutoSkipSeconds
}