'use strict';

(function(window, document, browser, console, undefined){
	const VIDEO = 1;
	const CHANNEL = 2;
	const SEARCH = 3;
	const ALLELSE = -1;
	const LPOLY = 2; //new polymer layout
	const LBASIC = 1; //old basic layout, less and less supported as time goes on

	let settings = {whitelisted: [], blacklisted: []};

	browser.runtime.sendMessage({action: "get"}, response => {
		settings = response;

		let head = document.documentElement; //available even if DOM contents havent loaded

		//inject styles for uBO buttons
		head.appendChild((() => {
			let el = document.createElement("link");
			el.setAttribute("rel", "stylesheet");
			el.setAttribute("type", "text/css");
			el.setAttribute("href", browser.runtime.getURL("inject.css"));
			return el;
		})());
		//allows us to access local javascript variables, needed to pre-append &disable flag to video lists
		head.appendChild((() => {
			let el = document.createElement("script");
			el.setAttribute("type", "text/javascript");
			el.setAttribute("src", browser.runtime.getURL("inject.js"));
			return el;
		})());

		document.addEventListener("DOMContentLoaded", () => {
			let layout = document.querySelector("ytd-app") ? LPOLY : LBASIC; //dirty, but just for the initial load
			let mode = getMode();
			let prevurl = location.href;
			//in case of settings change due to activity in another tab
			browser.runtime.onMessage.addListener((requestData, sender, sendResponse) =>  {
		    	if(requestData.action === "update"){
					settings = requestData.settings;
					updatePage(mode, layout, true); //force update
				}
			});

			let isPlayerShowingAd = mutation => {
				let player;

				if(mutation.target.id === "movie_player"){
					player = mutation.target;
				}else if(mutation.target.id === "player-container" && mutation.addedNodes.length){
					for(let node of mutation.addedNodes){
						if(node.id === "movie_player"){
							player = node;
							break;
						}
					}
				}

				if(player && player.classList.contains("ad-showing"))
					return player;
				else
					return false;
			}

			let isPolyUserInfo = mutation => {
				if(
					(
						mutation.target.id === "owner-name" 
						&& mutation.addedNodes.length
					) || (
						mutation.type === "attributes"
						&& mutation.target.parentNode
						&& mutation.target.parentNode.id === "owner-name" 
						&& mutation.attributeName === "href"
					)
				){
					return mutation.target.closest("ytd-video-owner-renderer");
				}else{
					return false;
				}
			}

			let isBasicUserInfo = mutation => {
				if(mutation.target.id === "watch7-container" && mutation.addedNodes.length){
					for(let node of mutation.addedNodes){
						if(node.id === "watch7-main-container"){
							return node;
						}
					}
				}

				return false;
			}

			let isRelatedUpdate = mutation => {
				return (
					mutation.type === "attributes"
					&& mutation.target.id === "continuations"
					&& mutation.attributeName === "hidden"
				);
			}

			let hasNewItems = mutation => {
				return (
					mutation.type === "attributes"
					&& mutation.target.localName === "yt-page-navigation-progress"
					&& mutation.attributeName === "hidden"
					&& mutation.oldValue === null
				) || (
					mutation.type === "childList"
					&& mutation.target.id === "items"
				);
			}

			updatePage(mode, layout, false);

			(new MutationObserver(mutations =>  {
				if(location.href !== prevurl){
					mode = getMode();
					prevurl = location.href;
				}

				for(let mutation of mutations){
					if(mode === VIDEO){
						let player, userInfo;

						if(player = isPlayerShowingAd(mutation)){
							updateAdShowing(player);
						}else if(userInfo = isPolyUserInfo(mutation)){
							updateVideoPage(LPOLY, userInfo);
						}else if(userInfo = isBasicUserInfo(mutation)){
							updateVideoPage(LBASIC, userInfo);
						}else if(isRelatedUpdate(mutation)){
							updateRelated(LPOLY);
						}
					}else if(mode === CHANNEL || mode === SEARCH || mode === ALLELSE){
						let loadedDesign = 0;

						if(hasNewItems(mutation)){ //new items in videolist
							loadedDesign = LPOLY;
						}else if(mutation.target.id === "subscriber-count"){
							callAgent("updateChannel"); //update the UCID in the dom
						}else{
							for(let node of mutation.removedNodes){
								if(node.id === "progress"){
									loadedDesign = LBASIC; //old layout, progress bar removed
									break;
								}
							}
						}

						if(loadedDesign){
							if(mode === CHANNEL)
								updateChannelPage(loadedDesign);
							else if(mode === SEARCH)
								updateSearchPage(loadedDesign);
							else if(mode === ALLELSE)
								updateVideolists(loadedDesign);
							break;
						}
					}

				}
			})).observe(document.body, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ["hidden", "href"],
				attributeOldValue: true
			});
		})
	})

	function getMode(){
		if(location.href.indexOf("youtube.com/watch?") !== -1){
			return VIDEO;
		}else if(location.href.indexOf("youtube.com/channel/") !== -1 || location.href.indexOf("youtube.com/user/") !== -1){
			return CHANNEL;
		}else if(location.href.indexOf("youtube.com/results?") !== -1){
			return SEARCH;
		}else{
			return ALLELSE;
		}
	}

	function getChannelId(element, mode, collect){
		//get channel ID, username (if available), and display name from DOM
		let links, link, channelId = {id: "", username: "", display: ""};
		
		if(!mode) 
			mode = getMode();

		if(!element) 
			element = document;

		if(mode === VIDEO){
			//links from the underbar
			links = element.querySelectorAll("ytd-video-owner-renderer a, #watch7-user-header a");
		}else if(mode === SEARCH){
			links = element.querySelectorAll("a");
			channelId.display = element.querySelector("#channel-title span").textContent;
		}else if(mode === CHANNEL){
			//metadata link from the header, should contain the ID/username if we set it previously
			links = [location];
			link = document.querySelector("link[rel='canonical']");

			if(link){
				links.push(link);
				channelId.username = link.getAttribute("username") || "";
			} 
			//get the display name while we are at it
			channelId.display = document.querySelector("#channel-header #channel-title,.branded-page-header-title-link").textContent;
		}else return false;

		for(let link of links){
			if(!link.href) continue;

			let matches;

			if(matches = link.href.match(/\/(user|channel)\/([\w-]+)(?:\/|$|\?)/)){
				if(matches[1] === "user"){
					channelId.username = matches[2] //we can safely assume that /user/$1 is a username
				}else if(matches[1] === "channel"){
					channelId.id = matches[2];

					if(link.textContent){ //to weed out the metadata link on channel pages
						channelId.display = link.textContent;
					}
				}
			}
		}
		//pass links and mode to the pointer, if we are given one
		if(collect){
			collect.mode = mode;
			collect.links = links;
		}

		if(channelId.id || channelId.username)
			return channelId;
		else
			return false;
	}

	function updateURL(verify, channelId){
		channelId = channelId || getChannelId();
		if(!channelId) return;

		if(location.href.indexOf("&disableadblock=1") !== -1){
			//ads are enabled, should we correct that?
			if(inwhitelist(channelId) === -1){
				window.history.replaceState(history.state, "", reflectURLFlag(location.href, false));
				return false;
			}else return true;
		}else{
			//ads are not enabled, lets see if they should be
			if(inwhitelist(channelId) !== -1){
				window.history.replaceState(history.state, "", reflectURLFlag(location.href, true));

				if(verify) callAgent("verifyDisabled");
				return true;
			}else return false;
		}
	}

	function reflectURLFlag(url, shouldContain){
		//take url, return url with flags removed if add is off
		//return url with flags added if add is on
		let search = /((?!\?)igno=re&disableadblock=1&?)|(&disableadblock=1)/g

		if(shouldContain){
			url = reflectURLFlag(url, false); //remove first, then add
			let paramsStart = url.indexOf("?");
			return url + (paramsStart === -1 ? "?igno=re" : (paramsStart === url.length - 1 ? "igno=re" : "")) + "&disableadblock=1"

		}else{
			return url.replace(search, "");
		}
	}

	function updatePage(mode, layout, forceUpdate){
		if(mode === VIDEO) updateVideoPage(layout, undefined, forceUpdate);
		else if(mode === CHANNEL) callAgent("updateChannel", {}, () => updateChannelPage(layout, forceUpdate));
		else if(mode === SEARCH) updateSearchPage(layout, forceUpdate);
		else if(mode === ALLELSE) updateVideolists(layout, undefined, forceUpdate);
	}

	function whitelistButton(layout, toggled, ref){
		if(ref){
			//button already exists, update whitelist toggle on pre-existing button rather than create new one
			if(!toggled){
				if(ref.classList.contains("yt-uix-button-toggled"))
					ref.classList.remove("yt-uix-button-toggled");
			}else{
				if(!ref.classList.contains("yt-uix-button-toggled"))
					ref.classList.add("yt-uix-button-toggled");
			}

			return;
		}

		let button = document.createElement("button");
		button.className = "UBO-button";
		button.addEventListener("click", event => {
			let data = {}
			let mode = getMode();
			let channelEl = mode === SEARCH ? event.target.closest("ytd-channel-renderer") : null;
			let channelId = getChannelId(channelEl, mode), button = event.target; //allow parent scope to be discarded

			if(inwhitelist(channelId) !== -1){
				let index;

				while((index = inwhitelist(channelId)) !== -1){
					settings.whitelisted.splice(index, 1);
				}
				button.classList.remove("yt-uix-button-toggled");
			}else{
				settings.whitelisted.push(channelId);
				button.classList.add("yt-uix-button-toggled");
			}

			browser.runtime.sendMessage({action: "update", settings: settings}, response => {
				if(response) console.log(response)
			})

			if(mode !== SEARCH) 
				updateURL(true, channelId);
			updatePage(mode, layout, true);

		}, false);

		if(layout === LPOLY){
			let buttonContainer;
			button.className += " UBO-poly " + (toggled ? " yt-uix-button-toggled" : "");
			button.innerHTML = "ADS";
			buttonContainer = document.createElement("div");
			buttonContainer.appendChild(button);

			return buttonContainer;
		}else if(layout === LBASIC){
			button.className += " UBO-old yt-uix-button yt-uix-button-size-default yt-uix-button-subscribed-branded hover-enabled" + (toggled ? " yt-uix-button-toggled" : "");
			button.innerHTML = "Ads";

			return button;
		}
	}
	function updateVideoPage(layout, container, forceUpdate){
		if(!container){
			if(layout === LPOLY){
				container = document.querySelector("ytd-video-owner-renderer")
			}else if(layout === LBASIC){
				container = document.querySelector("#watch7-subscription-container")
			}
		}
		if(!container) return;

		let data = {}
		let channelId = getChannelId(container, VIDEO, data);
		let whitelisted = updateURL(false, channelId);
		let button;
		console.log(channelId, whitelisted)
		if(button = whitelistButton(layout, whitelisted, container.parentNode.querySelector(".UBO-button"))){
			//add the new button, otherwise the status was updated on a pre-existing button
			if(container.nextSibling){
				container.parentNode.insertBefore(button, container.nextSibling);
			}else{
				container.parentNode.appendChild(button);
			}
		}

		for(let link of data.links){
			//this link hasn't been looked at
			//or the channel changed
			//or the whitelist state changed
			//or the link changed to something that we didnt set it to
			if(!link.channelId || link.channelId !== channelId.id || link.whitelisted !== whitelisted || link.sethref !== link.href){
				link.href = link.sethref = reflectURLFlag(link.href, whitelisted);
				link.whitelisted = whitelisted;
				link.channelId = channelId.id;
			}
		}

		updateRelated(layout, forceUpdate);
	}

	function updateRelated(layout, forceUpdate){
		if(layout === LPOLY){
			//update via local JS variables on the page
			callAgent("updateVideoLists", {settings: settings, type: "related", forceUpdate: forceUpdate})
		}else if(layout === LBASIC){
			//update via information available on the DOM
			let videos = document.querySelectorAll(".video-list-item");
			for(let vid of videos){
				if(!forceUpdate && vid.processed) continue;
				let user = vid.querySelector("[data-ytid]");
				if(!user)
					continue;
				else
					user = user.getAttribute("data-ytid");
				let inwhite = inwhitelist({id: user}) !== -1
				let links = vid.querySelectorAll("a[href^='/watch?']");
				if(inwhite || forceUpdate){
					for(let link of links){
						link.setAttribute("href", reflectURLFlag(link.getAttribute("href"), inwhite));
					}
				}
				vid.processed = true;
			}
		}
	}

	function updateChannelPage(layout, forceUpdate){
		let channelId = getChannelId(null, CHANNEL);
		let whitelisted = updateURL(false, channelId);
		let container, button;

		if(layout === LPOLY) 
			container = document.querySelector("#edit-buttons");
		else if(layout === LBASIC) 
			container = document.querySelector(".primary-header-actions");

		if(!container) return;

		if(button = whitelistButton(layout, whitelisted, container.querySelector(".UBO-button")))
			container.appendChild(button); //add only if it doesn't already exist

		if(whitelisted || forceUpdate){
			updateVideolists(layout, channelId, forceUpdate);
		}
	}

	function updateSearchPage(layout, forceUpdate, DOMUpdated){
		if(!DOMUpdated){
			callAgent("updateSearch", {}, () => updateSearchPage(layout, forceUpdate, true))
			return;
		}

		let channels;

		if(layout === LPOLY){
			channels = document.querySelectorAll("ytd-channel-renderer");
		}

		if(!channels) return;

		for(let channel of channels){
			let data = {};
			let container = channel.querySelector("#subscribe-button");
			let button;

			if(button = whitelistButton(layout, inwhitelist(getChannelId(channel, SEARCH, data)) !== -1, container.querySelector(".UBO-button")))
				container.insertBefore(button, container.firstChild);
		}
		updateVideolists(layout, null, forceUpdate);
	}

	function updateVideolists(layout, channelId, forceUpdate){
		//videos from places like the home page, channel page, search results, etc.
		//basically anything that isn't the /watch?v= page
		if(layout === LPOLY){
			callAgent("updateVideoLists", {settings: settings, channelId: channelId, type: "general", forceUpdate: forceUpdate});
		}else if(layout === LBASIC){
			let videos = document.querySelectorAll(".yt-lockup-video");

			for(let vid of videos){
				if(!forceUpdate && vid.processed) continue;

				let user = vid.querySelector(".g-hovercard.yt-uix-sessionlink");
				let values = {id: ""};

				if(!user || !(values.id = user.getAttribute("data-ytid")))
					if(channelId)
						values = channelId;
					else
						continue;
				let inwhite = inwhitelist(values) !== -1
				if(inwhite || forceUpdate){ //exists
					let links = vid.querySelectorAll("a[href^='/watch?']");

					for(let link of links){
						link.setAttribute("href", reflectURLFlag(link.getAttribute("href"), inwhite));
					}
				}
				vid.processed = true;
			}
		}
	}

	function updateAdShowing(player){
		let container, blacklistButton;

		if(!player.querySelector("#BLK-button")){
			container = player.querySelector(".ytp-right-controls");

			if(!container){
				console.error("Cannot find .ytp-right-controls");
				return;
			}
			//parseHTML('<button class="ytp-button" id="BLK-button"><span class="BLK-tooltip">Blacklist this advertiser</span><div class="BLK-container"><img src="' +  + '"></div></button>').querySelector("#BLK-button");
			blacklistButton = (() => {
				let el = document.createElement("button");
				el.setAttribute("id", "BLK-button");
				el.setAttribute("class", "ytp-button");
				el.appendChild((() => {
					let el = document.createElement("span");
					el.setAttribute("class", "BLK-tooltip");
					el.appendChild(document.createTextNode("Blacklist this advertiser"));
					return el;
				})());
				el.appendChild((() => {
					let el = document.createElement("div");
					el.setAttribute("class", "BLK-container");
					el.appendChild((() => {
						let el = document.createElement("img");
						el.setAttribute("src", browser.runtime.getURL("img/icon_16.png"));
						return el;
					})());
					return el;
				})());
				return el;
			})();
			blacklistButton.addEventListener("click", () => {
				browser.runtime.sendMessage({action: "blacklist"}, response => {
					if(response && response.error) 
						console.error(response.error, response);
					else
						location.reload();
				})
			})
			container.insertBefore(blacklistButton, container.firstChild);
		}
	}

	function callAgent(externalFunction, data, callback){
		let msgFunc;
		let callbackId = "";

		if(callback){
			if(typeof callback !== "function"){
				console.error("Callback supplied is not a function");
				return false;
			}
			callbackId = Math.random().toString(36).substring(7); //random 7 char string
			window.addEventListener("message", msgFunc = event => {
				if(event.data.origin || !event.data.callbackId || event.data.callbackId !== callbackId) return;
				callback(event.data.callbackMessage);
				window.removeEventListener("message", msgFunc);
			});
		}
		//external for us, means internal for them
		window.postMessage({internalFunction: externalFunction, message: data, callbackId: callbackId, origin: true}, "*");
	}

	function inwhitelist(search){
		if(!search) return;

		for(let index in settings.whitelisted){
			for(let id in search){
				if(
					(search.id.length > 4
					&& settings.whitelisted[index].id === search.id)
					|| 
					(search.username.length > 4
					&& settings.whitelisted[index].username === search.username)
				){
					return index;
				}
				
			}
		}
		return -1;
	}
})(window, document, chrome ? chrome : browser, console)
