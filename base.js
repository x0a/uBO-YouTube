"use strict";

(function(window, browser, undefined){
	var settings;
	var recentads = [];
	var blackvideos = [];

	browser.storage.sync.get(null, function(items){
		settings = items ? items : {};
		console.log(settings);
		if(!settings.whitelisted) settings.whitelisted = [];
		if(!settings.blacklisted) settings.blacklisted = [];

		browser.runtime.onMessage.addListener(function(message, sender, sendResponse){
			if(message.action === "get"){
				sendResponse(settings);
			}else if(message.action === "update"){
				settings = message.settings;

				browser.storage.sync.set(settings, function(){
					console.log(settings);
					//console.log(browser.runtime.lastError);
				})
			}else if(message.action === "recentads"){
				sendResponse(recentads);
			}
		});
		browser.webRequest.onBeforeSendHeaders.addListener(function(details){
			if(details.tabId === -1) return;
			var cancel = false;
			var url = parseURL(details.url);
			var request = new XMLHttpRequest();
			var adinfo = {};

			console.log(details);
			if(url.pathname === "/get_video_info"){
				if(url.searchObject.video_id && blackvideos.indexOf(url.searchObject.video_id) !== -1){
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
									(adinfo.searchObject.channel_url && inblacklist(adinfo.searchObject.channel_url, true) !== -1)
								 )
							){
							blackvideos.push(url.searchObject.video_id);
							cancel = true;
						}
					}
				}
			}
			console.log("Blocked:", cancel);
			recentads.push(adinfo.searchObject);

			return {cancel: cancel};

		}, {urls: ["*://www.youtube.com/get_video_info?*"]}, ["blocking"])
	});

	function inblacklist(search, url){
    if(url){
      var matches = search.match(/\/(user|channel)\/([\w-]+)(?:\/|$|\?)/);
      if(matches){
        if(matches[2])
          search = matches[2];
				console.log(matches);
      }else return -1;
    }

		for(var index in settings.blacklisted){
			if(settings.blacklisted[index].id === search)
				return index;
		}
		return -1;
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
