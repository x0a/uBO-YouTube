
if (!window.browser) {
    window.browser = {
        runtime: {
            sendMessage: function (message, resp) {
                if (message.action === "get") {
                    resp(sampleSettings);
                }
                if (message.action === "recentads") {
                    resp(ads);
                }

                if (message.action === "set") {
                    console.log(message);
                    if (message.changes.type === "bulk") {
                        sampleSettings = message.changes.settings;

                    } else if (message.changes.type === "remove-white") {
                        let i;
                        while ((i = inwhitelist(message.changes.channelId)) !== -1) {
                            sampleSettings.whitelisted.splice(i, 1);
                        }
                    } else if (message.changes.type === "remove-black") {
                        let i;
                        while ((i = inblacklist(message.changes.channelId)) !== -1) {
                            sampleSettings.blacklisted.splice(i, 1);
                        }
                    } else if (message.changes.type === "add-white") {
                        if (inwhitelist(message.changes.channelId) === -1)
                            sampleSettings.whitelisted.push(message.changes.channelId);
                    } else if (message.changes.type === "add-black") {
                        if (inblacklist(message.changes.channelId) === -1)
                            sampleSettings.blacklisted.push(message.changes.channelId)
                    }
                    resp({ action: "update", settings: sampleSettings });
                }
            },
            onMessage: {
                addListener: function (requestData, sender, response) {

                }
            }
        },

        permissions: {
            contains: function (object, callback) {
                callback(permission);
            },
            request: function (object, callback) {
                permission = true;
                callback(permission);
            }
        }
    }
}
let inwhitelist = channelId => sampleSettings.whitelisted.findIndex(item => item.id === channelId.id);
let inblacklist = channelId => sampleSettings.blacklisted.findIndex(item => item.id === channelId.id);
let sampleSettings = {"blacklisted":[{"display":"PragerU","id":"UCZWlSUNDvCCS1hBiXV0zKcA","username":""},{"display":"Trey Blocker","id":"UCwmNnU2gDOYMVzM_roKK7pQ","username":""},{"display":"CRTV","id":"UCHnP4h7CkxDtQXV-kEGS9FA","username":""}],"muted":[],"whitelisted":[{"display":"Practical Engineering","id":"UCMOqf8ab-42UUQIdVoKwjlQ","username":"gradyhillhouse"},{"display":"Applied Science","id":"UCivA7_KLKWo43tFcCkFvydw","username":"bkraz333"},{"display":"Beyond the press","id":"UCveB47lgzZJ1WOf4XYVJNBw","username":""},{"display":"Kurzgesagt – In a Nutshell","id":"UCsXVk37bltHxD1rDPwtNM8Q","username":"Kurzgesagt"},{"display":"potholer54","id":"UCljE1ODdSF7LS9xx9eWq0GQ","username":"potholer54"},{"display":"ChrisFix","id":"UCes1EvRjcKU4sY_UEavndBw","username":"PaintballOO7"},{"display":"ETCG1","id":"UCa7guRnhniICnS0mJbSDmMg","username":"ETCG1"},{"display":"Curious Elephant","id":"UCZUlf2TKB8vATuo5-s1N-5Q","username":""},{"display":"HumbleMechanic","id":"UC2gRQKQgI3CsrcnMuHPyYsQ","username":"HumbleMechanic"},{"display":"SciShow","id":"UCZYTClx2T1of7BRZ86-8fow","username":"scishow"},{"display":"SciShow Space","id":"UCrMePiHCWG4Vwqv3t7W9EFg","username":"scishowspace"}]}
let ads = [{
    "cr": "US",
    "adformat": "15_2_1",
    "cosver": "10.0",
    "fmt_list": "22/1280x720%2C43/640x360%2C18/640x360%2C36/320x180%2C17/176x144",
    "cbr": "Firefox",
    "allow_embed": "1",
    "ucid": "UCHnP4h7CkxDtQXV-kEGS9FA",
    "host_language": "en",
    "cver": "2.20181003",
    "csi_page_type": "adunit",
    "cbrver": "62.0",
    "ptchn": "youtube_host",
    "enablecsi": "1",
    "loudness": "-19.4489994049",
    "apiary_host_firstparty": "",
    "status": "ok",
    "author": "",
    "title": "uncensored%20shows%20072618",
    "t": "1",
    "innertube_api_version": "v1",
    "eventid": "WMy7W8W8AdWgDreZvpgB",
    "plid": "AAV3vlLMoGxzZKGF",
    "external_play_video": "1",
    "watch_ajax_token": "QUFFLUhqbXJaQlpXQXpMUlNuQUtieG5TcXl2NHdGU1ZVZ3xBQ3Jtc0tteTFOalNKVndhWjRjcFhNLTY1ZlVXSjdMMlZVbFJSN2FDZ19fVXNlbXBIU19pTUcybFR3engxZW1fcHJ1MFdjVTlrMThnem1QcFpYSXFiLTV2SmoyaHZmRmhpQnNHWnhkb3JtWlVJZ3o0LXpxMEdLNA%3D%3D",
    "iv_load_policy": "1",
    "iv_invideo_url": "https%3A//www.youtube.com/annotations_invideo%3Finstream_ad%3D1%26video_id%3DTXjAFGuPDKM%26client%3D1%26ei%3DWMy7W8W8AdWgDreZvpgB",
    "ssl": "1",
    "pltype": "adhost",
    "storyboard_spec": "https%3A//i9.ytimg.com/sb/TXjAFGuPDKM/storyboard3_L%24L/%24N.jpg%7C48%2327%23100%2310%2310%230%23default%23rs%24AOn4CLCbc8PInA5YcLnZc-o4XCZAIpJCPg%7C80%2345%2343%2310%2310%231000%23M%24M%23rs%24AOn4CLBDbhNNCk1chFGWzZZC4KYxONDukA%7C160%2390%2343%235%235%231000%23M%24M%23rs%24AOn4CLDJrT8NMN1wy-XW8ASg_Ss18D8WLw",
    "hl": "en_US",
    "vss_host": "s.youtube.com",
    "vm": "CAEQABgE",
    "tmi": "1",
    "idpj": "-6",
    "length_seconds": "41",
    "ad_query_id": "V8y7W8C_Gs_cBYOHkfgM",
    "probe_url": "https%3A//r3---sn-5hnekn7k.googlevideo.com/videogoodput%3Fid%3Do-ACa9lJ_aZy1EuCmxTRUM17iqjFdIEns4PK_vuu-BUj6N%26source%3Dgoodput%26range%3D0-4999%26expire%3D1539037800%26ip%3D173.172.176.124%26ms%3Dpm%26mm%3D35%26pl%3D24%26nh%3DIgpwZjAxLmFtczE1Kg04MC4yMzkuMTI4LjE2%26sparams%3Did%2Csource%2Crange%2Cexpire%2Cip%2Cms%2Cmm%2Cpl%2Cnh%26signature%3D306E75657AC4970492DC38A0EF0B4B2B48A8142F.49D340A944B46FAE208FAF2382D599BA673393D9%26key%3Dcms1",
    "apiary_host": "",
    "ptk": "youtube_host",
    "c": "WEB",
    "view_count": "1491745",
    "token": "1",
    "itct": "",
    "xhr_apiary_host": "youtubei.youtube.com",
    "gapi_hint_params": "m%3B/_/scs/abc-static/_/js/k%3Dgapi.gapi.en.yK0z3MKtgaU.O/m%3D__features__/rt%3Dj/d%3D1/rs%3DAHpOoo-SafOYj4n3budMysbWxppU-lxJeg",
    "cl": "215969735",
    "avg_rating": "0.0",
    "innertube_context_client_version": "2.20181003",
    "watermark": "%2Chttps%3A//s.ytimg.com/yts/img/watermark/youtube_watermark-vflHX6b6E.png%2Chttps%3A//s.ytimg.com/yts/img/watermark/youtube_hd_watermark-vflAzLcD6.png",
    "video_id": "TXjAFGuPDKM",
    "relative_loudness": "6.55100059509",
    "innertube_api_key": "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
    "autoplay": "1",
    "ismb": "12630000",
    "allow_ratings": "1",
    "cos": "Windows",
    "of": "GC6OCn1lTVgpgJyrp2hYjw",
    "iv3_module": "1",
    "timestamp": "1539034200",
    "delay": "28",
    "thumbnail_url": "https%3A//i.ytimg.com/vi/TXjAFGuPDKM/default.jpg",
    "keywords": "",
    "ps": "desktop-polymer",
    "no_get_video_log": "1",
    "ldpj": "-15",
    "player_error_log_fraction": "1.0",
    "url_encoded_fmt_stream_map": "",
    "channelId": {
      "id": "UCHnP4h7CkxDtQXV-kEGS9FA",
      "display": "CRTV",
      "username": ""
    },
    "details": {
      "requestId": "192",
      "url": "...",
      "originUrl": "https://www.youtube.com/channel/UCfaY6Tw_PUCVPwmhSdmXA3w",
      "documentUrl": "https://www.youtube.com/channel/UCfaY6Tw_PUCVPwmhSdmXA3w",
      "method": "GET",
      "type": "xmlhttprequest",
      "timeStamp": 1539034200820,
      "frameId": 0,
      "parentFrameId": -1,
      "proxyInfo": null,
      "ip": null,
      "frameAncestors": [],
      "tabId": 2
    },
    "blocked": true
  }]
let permission = false;