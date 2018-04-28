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
						console.log(tabs);
						for(let tab of tabs)
							if(!sender.tab || tab.id !== sender.tab.id) //send to every tab if it came from popup window
								chrome.tabs.sendMessage(tab.id, {action: "update", settings: settings}, function(response) {
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

			if(url.pathname === "/get_video_info" && url.params.video_id){
				if(blacklisted.indexOf(url.params.video_id) !== -1){
					cancel = true;
				}else{
					request.open('GET', details.url, false);  // `false` makes the request synchronous
					request.send(null);

					if (request.status === 200) {
						adinfo = parseURL("?" + request.responseText);

						if(adinfo.params
							&& (
									(adinfo.params.ucid && inblacklist(adinfo.params.ucid) !== -1)
									||
									(adinfo.params.channel_url && inblacklist(parseChannel(adinfo.params.channel_url)) !== -1)
								 )
							){
							//block, and also add video id to the list so that we dont do this synchrous request again
							blacklisted.push(url.params.video_id);
							cancel = true;
						}
					}
				}
			}

			if(!adinfo.params.author){
				//get the author title
				request.onreadystatechange = function() {
					if(this.readyState == 4 && this.status == 200){
					   var matches = request.responseText.match(/\<title\>(.+)\s\-\sYouTube\<\/title\>/);
					   if(matches && matches[1]){
						   adinfo.params.author = matches[1];
					   }
					}
				};
				request.open("GET", "https://www.youtube.com/channel/" + adinfo.params.ucid, true);
				request.send();
			}

			adinfo.details = details;
			recentads.push(adinfo.params);
			
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
	        params = {},
	        queries, split, i;
	    // Let the browser do the work
	    parser.href = url.replace(/\+/g, '%20');
	    // Convert query string to object
	    queries = parser.search.replace(/^\?/, '').split('&');
	    for( i = 0; i < queries.length; i++ ) {
	        split = queries[i].split('=');
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
