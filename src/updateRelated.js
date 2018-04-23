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
		
		if(container && objGet(container, "data.metadata.channelMetadataRenderer.channelUrl")){
			var link = document.querySelector("link[rel='canonical']");
			
			if(!link){
				link = document.createElement("link");
				link.rel = "canonical";
				document.head.appendChild(link);
			}

			link.href = container.data.metadata.channelMetadataRenderer.channelUrl;
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
			if(channel || (user = objGet(video, "data.shortBylineText.runs[0].navigationEndpoint.browseEndpoint.browseId"))){
				if(channel || (inwhitelist({id: user}) !== -1)){
					var url, links = video.querySelectorAll("a[href^='/watch?']");
					for(var link of links){
						link.setAttribute("href", link.getAttribute("href") + "&disableadblock=1")
					}

					if(url = objGet(video, "data.navigationEndpoint.webNavigationEndpointData.url"))
						objGet(video, "data.navigationEndpoint.webNavigationEndpointData.url", url + "&disableadblock=1");
					if(url = objGet(video, "data.navigationEndpoint.commandMetadata.webCommandMetadata.url"))
						objGet(video, "data.navigationEndpoint.commandMetadata.webCommandMetadata.url", url + "&disableadblock=1");
				}
				video.data.processed = true;
			}

		}
	}
	function objGet(object, key, newVal){
		var levels = key.split(/[\[\]\.]+/);
		var parent = object;
		var lastlevel;
		var current = object;

		for(level of levels){
			if(!level) continue;
			if(current[level] !== undefined){
				parent = current;
				lastlevel = level;
				current = current[level];
			}
			else{
				//console.log("Failed at", level);
				return;
			}
		}

		if(newVal){
			parent[lastlevel] = newVal;
		}
		return parent[lastlevel];
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
