type Channel = {
    display: string,
    username: string,
    id: string
}

type ChannelList = Array<Channel>;

interface Settings {
    whitelisted: ChannelList;
    blacklisted: ChannelList;
    muted: ChannelList;
}

enum Mode {
    VIDEO,
    CHANNEL,
    SEARCH,
    ALLELSE
}

enum Design {
    LPOLY,
    LBASIC
}

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

interface AgentResolver {
    id: string;
    resolver: Function;
    rejector: Function;
}

interface AgentEvent {
    [eventName: string]: Array<Function>
}

interface Settings extends browser.storage.StorageObject{
    whitelisted: ChannelList;
    blacklisted: ChannelList;
    muted: ChannelList;
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
    ucid?: string;
    author?: string;
    blocked?: boolean;
}

interface Video {
    [propertyName: string]: any;
    video_id: string;
}

interface ParsedURL {
    pathname: string;
    params: Ad | Video;
}

export {
    Channel, ChannelList, Mode, MutationElement,
    Settings, Action, AccessURL,
    Design, MenuItem,
    InfoLink, VideoBasic, VideoPoly,
    AgentResolver, AgentEvent,
    Ad, PendingItem, ParsedURL
}