"use strict";

(function(window, browser, undefined){
	var settings;
	var recentads = [];
	var blacklisted = [];
	
	function saveSettings(callback){
		browser.storage.sync.set(settings, function(){
			console.log(settings);
			callback();
			//console.log(browser.runtime.lastError);
		})
	}

	browser.storage.sync.get(null, function(items){
		settings = items ? items : {};
		if(!settings.whitelisted) settings.whitelisted = [];
		if(!settings.blacklisted) settings.blacklisted = [];

		console.log(settings);

		browser.runtime.onMessage.addListener(function(message, sender, sendResponse){
			if(message.action === "get"){
				sendResponse(settings);
			}else if(message.action === "update"){
				settings = message.settings;
				saveSettings(function(){
					//send the updated settings to the rest of the tabs
					chrome.tabs.query({discarded: false}, function(tabs) {
						for(var t of tabs)
							if(t.id !== sender.tab.id)
								chrome.tabs.sendMessage(t.id, {action: "update", settings: settings}, function(response) {
									//console.log(response);
								});
					  });
				});
			}else if(message.action === "recentads"){
				sendResponse(recentads);
			}else if(message.action === "blacklist"){
				for(var ad of recentads.slice().reverse()){
					//find the last intercepted ad from this tab
					if(ad.details.tabId === sender.tab.id){
						var channelId = {id: "", display: "", username: ""};

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

		browser.webRequest.onBeforeSendHeaders.addListener(function(details){
			if(details.tabId === -1) return; //we dont want to process our own requests

			var cancel = false;
			var url = parseURL(details.url);
			var request = new XMLHttpRequest();
			var adinfo = {};

			if(url.pathname === "/get_video_info"){
				if(url.searchObject.video_id && blacklisted.indexOf(url.searchObject.video_id) !== -1){
					cancel = true;
				}else{
					request.open('GET', details.url, false);  // `false` makes the request synchronous
					request.send(null);

					if (request.status === 200) {
						adinfo = parseURL("?" + request.responseText);

						browser.tabs.sendMessage(details.tabId, adinfo, function(response){
							//console.log(response);
						});

						if(adinfo.searchObject
							&& url.searchObject.video_id
							&& (
									(adinfo.searchObject.ucid && inblacklist(adinfo.searchObject.ucid) !== -1)
									||
									(adinfo.searchObject.channel_url && inblacklist(parseChannel(adinfo.searchObject.channel_url)) !== -1)
								 )
							){
							blacklisted.push(url.searchObject.video_id);
							cancel = true;
						}
					}
				}
			}
			adinfo.searchObject.details = details;
			recentads.push(adinfo.searchObject);

			console.log("Blocked:", cancel, adinfo);
			return {cancel: cancel};

		}, {urls: ["*://www.youtube.com/get_video_info?*"]}, ["blocking"])
	});

	function inblacklist(search){
		for(var index in settings.blacklisted){
			if(settings.blacklisted[index].id === search)
				return index;
		}
		return -1;
	}

	function parseChannel(search){
		var matches = search.match(/\/(user|channel)\/([\w-]+)(?:\/|$|\?)/);

		if(matches && matches[2])
			return matches[2];
		else
			return false;
	}

	function parseURL(url) {
	    var parser = document.createElement('a'),
	        searchObject = {},
	        queries, split, i;
	    // Let the browser do the work
	    parser.href = url.replace(/\+/g, '%20');
	    // Convert query string to object
	    queries = parser.search.replace(/^\?/, '').split('&');
	    for( i = 0; i < queries.length; i++ ) {
	        split = queries[i].split('=');
	        searchObject[split[0]] = split[1];
	    }
	    return {
	        protocol: parser.protocol,
	        host: parser.host,
	        hostname: parser.hostname,
	        port: parser.port,
	        pathname: parser.pathname,
	        search: parser.search,
	        searchObject: searchObject,
	        hash: parser.hash
	    };
	}
})(window, chrome ? chrome : browser)
