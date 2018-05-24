"use strict";

((window, browser, undefined) => {
	let settings;
	let recentads = [];
	let blacklisted = [];
	
	let saveSettings = callback => {
		return new Promise((resolve, reject) => {
			browser.storage.sync.set(settings, () => {
				console.log(settings);
				resolve();
			})
		})
	}

	browser.storage.sync.get(null, items => {
		settings = items ? items : {};
		if(!settings.whitelisted) settings.whitelisted = [];
		if(!settings.blacklisted) settings.blacklisted = [];

		console.log(settings);

		browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
			if(message.action === "get"){
				sendResponse(settings);
			}else if(message.action === "update"){
				settings = message.settings;
				saveSettings.then(() => {
					//send the updated settings to the rest of the tabs
					chrome.tabs.query({discarded: false}, tabs => {
						for(let tab of tabs)
							if(!sender.tab || tab.id !== sender.tab.id) //!sender.tab means it came from popup.html
								chrome.tabs.sendMessage(tab.id, {action: "update", settings: settings}, (response) =>  {
									//console.log(response);
								});
					  });
				});
			}else if(message.action === "recentads"){
				sendResponse(recentads);
			}else if(message.action === "blacklist"){
				for(let ad of recentads.slice().reverse()){
					//find the last intercepted ad from this tab
					if(ad.details.tabId === sender.tab.id){
						let channelId = {id: "", display: "", username: ""};

						if(ad.ucid && inblacklist(ad.ucid) === -1){
							channelId.id = ad.ucid
						}else if(ad.channel_url && inblacklist(parseChannel(ad.channel_url)) === -1){
							channelId.id = parseChannel(ad.channel_url);
						}else{
							sendResponse({error: "Advertiser already blacklisted"});
							return; //already exists in blacklist, or UCID not available
						}

						channelId.display = decodeURIComponent(ad.author || ad.title);
						settings.blacklisted.push(channelId);
						saveSettings();
						sendResponse({error: "", channel: channelId, info: ad});
						return; //also break;
					}
				}
				sendResponse({error: "Ad not found"});
			}
		});

		browser.webRequest.onBeforeSendHeaders.addListener((details) => {
			if(details.tabId === -1) return; //probably came from an extension, which we don't want to process

			let request = new XMLHttpRequest();
			let url = parseURL(details.url);
			let cancel = false;
			let adinfo = {};

			if(url.pathname === "/get_video_info" && url.params.video_id){
				if(blacklisted.indexOf(url.params.video_id) !== -1){
					cancel = true;
				}else{
					request.open('GET', details.url, false);  // `false` makes the request synchronous
					request.send(null);

					if (request.status === 200) {
						adinfo = parseURL("?" + request.responseText);
						adinfo.params.ucid = adinfo.params.ucid || parseChannel(adinfo.params.channel_url);

						if(adinfo.params.ucid && inblacklist(adinfo.params.ucid) !== -1){
							//block, and also add video id to the list so that we dont do this synchrous request again
							blacklisted.push(url.params.video_id);
							cancel = true;
						}
					}
				}
			}else{
				console.log("Invalid request", url);
			}

			if(!adinfo.params.author){
				//asynchrously get the author title, very messy but it's the best way 
				//the json method requires sending special headers
				request.open("GET", "https://www.youtube.com/channel/" + adinfo.params.ucid, true);
				request.onreadystatechange = () =>  {
					if(this.readyState === 4 && this.status === 200){
					   let matches = request.responseText.match(/\<title\>(.+)\s\-\sYouTube\<\/title\>/);
					   if(matches && matches[1]){
						   adinfo.params.author = matches[1];
					   }
					}
				};
				request.send();
			}

			adinfo.params.details = details;

			while(recentads.length > 20) 
				recentads.shift(); //just trim a little off the top fam
			recentads.push(adinfo.params);

			console.log("Blocked:", cancel, adinfo);
			return {cancel: cancel};

		}, {urls: ["*://www.youtube.com/get_video_info?*"]}, ["blocking"])
	});

	function inblacklist(search){
		for(let index in settings.blacklisted){
			if(settings.blacklisted[index].id === search)
				return index;
		}
		return -1;
	}

	function parseChannel(search){
		if(!search) return false;

		let matches = search.match(/\/(user|channel)\/([\w-]+)(?:\/|$|\?)/);

		if(matches && matches[2])
			return matches[2];
		else
			return false;
	}

	function parseURL(url) {
	    let parser = document.createElement('a'),
	        params = {},
	        queries, split;
	    // Let the browser do the work
	    parser.href = url.replace(/\+/g, '%20');
	    // Convert query string to object
	    queries = parser.search.replace(/^\?/, '').split('&');
	    for(let i = 0; i < queries.length; i++ ) {
	        let split = queries[i].split('=');
	        params[split[0]] = split[1];
	    }
	    return {
	        protocol: parser.protocol,
	        host: parser.host,
	        hostname: parser.hostname,
	        port: parser.port,
	        pathname: parser.pathname,
	        search: parser.search,
	        params: params,
	        hash: parser.hash
	    };
	}
})(window, chrome ? chrome : browser)
