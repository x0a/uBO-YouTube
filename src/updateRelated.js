/*
	This script is injected into the YT page so that we
	can access local JS variables rather than just the dom.
	This is important because the new Polymer design puts
	a lot of important information out of reach and in
	Polymer.

*/
window.addEventListener("message", function(event) {
	// We only accept messages from ourselves
	if(!event.data) return;
	//For some reason, YouTube doesn't update the <link> tag when switching channel page,
	//and doesn't provide the UCID anywhere in the page except for in local JS variables.
	//Solution is to transfer the UCID from JS variables to DOM for continuity
	if(event.data.updateChannel){
		var container = document.querySelector("ytd-browse");
		var link = document.querySelector("link[rel='canonical']")
		if(link && container && container.data && container.data.metadata && container.data.metadata.channelMetadataRenderer && container.data.metadata.channelMetadataRenderer.channelUrl){
			link.href = container.data.metadata.channelMetadataRenderer.channelUrl;
		}else{
			console.error("link[rel=canonical] not found. Or ytd-browse missing information")
		}
	}else if(event.data.updateRelated || event.data.updateLists){
		var videos;
		var channel = (event.data.channelId ? inwhitelist(event.data.channelId) !== -1 : false);

		if(event.data.updateRelated)
			videos = document.querySelectorAll("ytd-compact-video-renderer");
		else if(event.data.updateLists)
			videos = document.querySelectorAll("ytd-grid-video-renderer,ytd-video-renderer");
		
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
