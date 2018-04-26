/*
	This script is injected into the YT page so that we
	can access local JS variables rather than just the dom.
	This is important because the new Polymer design puts
	a lot of important information out of reach and in
	Polymer.

*/
'use strict';

(function(window, document, undefined){
	function Agent(){
		var internalFunctions = {};

		this.registerListener = function(name, func){
			internalFunctions[name] = func;
			return this;
		};

		window.addEventListener("message", function(event){
			if(!event.data || !event.data.internalFunction) return;

			if(event.data.internalFunction in internalFunctions){
				var ret = internalFunctions[event.data.internalFunction](event.data.message);

				if(event.data.callbackId)
					window.postMessage({callbackId: event.data.callbackId, callbackMessage: ret}, event.origin);
				
			}
		})
	}

	new Agent().registerListener("updateChannel", function(){
		//make UCID available in the DOM
		var container = document.querySelector("ytd-browse");
			
		if(container && objGet(container, "data.metadata.channelMetadataRenderer.channelUrl")){
			var link = document.querySelector("link[rel='canonical']");
			
			if(!link){
				link = document.createElement("link");
				link.rel = "canonical";
				document.head.appendChild(link);
			}

			link.href = container.data.metadata.channelMetadataRenderer.channelUrl;
			return link.href;
		}
		return false;
	}).registerListener("updateVideoLists", function(args){
		//channel = are we on a whitelisted channel page?
		var channel = (args.channelId ? inwhitelist(args.channelId, args.settings.whitelisted) !== -1 : false);
		var videos;
		
		if(args.type === "related"){
			videos = document.querySelectorAll("ytd-compact-video-renderer,ytd-playlist-panel-video-renderer");
		}else if(args.type === "general"){
			videos = document.querySelectorAll("ytd-grid-video-renderer,ytd-video-renderer");
		}
		
		for(var video of videos){
			var user;
			if(video.data.processed) continue;
			if(channel || (user = objGet(video, "data.shortBylineText.runs[0].navigationEndpoint.browseEndpoint.browseId"))){
				if(channel || (inwhitelist({id: user}, args.settings.whitelisted) !== -1)){
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
	});

	function objGet(object, key, newVal){
		var levels = key.split(/[\[\]\.]+/);
		var parent = object;
		var lastlevel;
		var current = object;

		for(var level of levels){
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
	
	function inwhitelist(search, whitelist){
		for(var index in whitelist){
			for(var id in search){
				if(id !== "display" && whitelist[index][id] === search[id] && search[id].length)
				return index;
			}
		}
		return -1;
	}

})(window, document);