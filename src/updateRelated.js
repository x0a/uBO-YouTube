window.addEventListener("message", function(event) {
	// We only accept messages from ourselves

	if(event.data && (event.data.updateRelated || event.data.updateLists)){
		var videos;
		if(event.data.updateRelated){
			videos = document.querySelectorAll("ytd-compact-video-renderer");
		}else if(event.data.updateLists){
			videos = document.querySelectorAll("ytd-grid-video-renderer,ytd-video-renderer");
		}
		var channel = (event.data.channelId ? inwhitelist(event.data.channelId) !== -1 : false);

		for(video of videos){
			var user;
			if(video.data.processed) continue;
			if(channel || (video.data &&
				video.data.shortBylineText &&
				video.data.shortBylineText.runs &&
				video.data.shortBylineText.runs[0] &&
				video.data.shortBylineText.runs[0].navigationEndpoint &&
				video.data.shortBylineText.runs[0].navigationEndpoint.browseEndpoint &&
				video.data.shortBylineText.runs[0].navigationEndpoint.browseEndpoint.browseId &&
				(user = video.data.shortBylineText.runs[0].navigationEndpoint.browseEndpoint.browseId)
			)){
				if(channel || (inwhitelist({id: user}) !== -1)){
					var links = video.querySelectorAll("a[href^='/watch?']");
					for(var link of links){
						link.setAttribute("href", link.getAttribute("href") + "&disableadblock=1")
					}

					if(video.data.navigationEndpoint){
						if(video.data.navigationEndpoint.webNavigationEndpointData && video.data.navigationEndpoint.webNavigationEndpointData.url)
							video.data.navigationEndpoint.webNavigationEndpointData.url += "&disableadblock=1";
						if(video.data.navigationEndpoint.commandMetadata && video.data.navigationEndpoint.commandMetadata.webCommandMetadata && video.data.navigationEndpoint.commandMetadata.webCommandMetadata.url)
							video.data.navigationEndpoint.commandMetadata.webCommandMetadata.url += "&disableadblock=1";
					}
				}
				video.data.processed = true;
			}

		}
	}

	function inwhitelist(search){
		for(var index in event.data.settings.whitelisted){
			for(var id in search){
				if(id !== "display" && event.data.settings.whitelisted[index][id] === search[id] && search[id].length)
				return index;
			}
		}
		return -1;
	}
}, false);
