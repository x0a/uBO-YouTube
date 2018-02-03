'use strict';

(function(window, document, browser, undefined){
	const video = 1;
	const channel = 2;
	const search = 3;
	const home = 4;
	const ad = 5;
	const allelse = -1;

	var settings = {whitelisted: [], blacklisted: []};
	browser.runtime.sendMessage({action: "get"}, function(response){
		settings = response;

		document.addEventListener("DOMContentLoaded", function(){
			//<Preparations>
			var th = document.getElementsByTagName("head")[0];
			var s = document.createElement('script');
			s.setAttribute('type', 'text/javascript');
			s.setAttribute('src', browser.runtime.getURL("updateRelated.js"));
			th.appendChild(s);
			document.styleSheets[0].insertRule(".UBO-button.UBO-old { margin-left: 5px; padding: 0 5.5px 0px 6px !important;}", 0);
			document.styleSheets[0].insertRule(".UBO-button.UBO-poly { margin-top: 6px; color: rgba(17, 17, 17, 0.298); outline: none; background:transparent; padding: 10px 16px; border: none; cursor: pointer; font-family: 'Roboto', 'Noto', sans-serif; font-size: 14px; font-weight:500; letter-spacing: 0.007px; text-transform: uppercase; border-radius: 2px; -webkit-font-smoothing: antialiased; whitespace: nowrap}", 0)
			document.styleSheets[0].insertRule(".UBO-button.UBO-poly.yt-uix-button-toggled {color: rgba(17, 17, 17, 0.6);border-bottom: 2px solid darkseagreen; }", 0)
			document.styleSheets[0].insertRule("html[dark] .UBO-button.UBO-poly {color: rgba(255, 255, 255, 0.26)}",0)
			document.styleSheets[0].insertRule("html[dark] .UBO-button.UBO-poly.yt-uix-button-toggled {rgba(255, 255, 255, 0.498)}",0)
			document.styleSheets[0].insertRule("button#blockads { background: transparent; border: transparent; cursor: pointer; }", 0)
			browser.runtime.onMessage.addListener(function(requestData, sender, sendResponse) {
		    //console.log(sender, requestData);
			});
			//</Preparations>
			var mode = getMode();
			var prevurl = location.href;

			if(mode === video) updateVideoPage();
			else if(mode === channel) updateChannelPage();
			else if(mode === allelse) updateVideolists();

			var observer = new MutationObserver(function(mutations) {
				if(location.href !== prevurl){
					mode = getMode();
					prevurl = location.href;
				}

				var found = false;
				for(var mutation of mutations){

					if(mode === video){
						//console.log("video page");
						if(mutation.target.id === "movie_player"
							/*|| (
								mutation.target.id === "player-container"
								&& mutation.addedNodes.length
								&& mutation.addedNodes[0].id === "movie_player"
								&& (found = true)
								&& false //nvm bro
							)*/
							|| mutation.target.className === "ytp-title-channel-name"
						){
							//console.log("+video player");
							var player = mutation.target.id === "movie_player" ? mutation.target : document.querySelector("#movie_player");
							if(player.classList.contains("ad-showing")){
								console.log("Found ad, trying to add button.");
								updateAdShowing(player);
							}
						}else{
							//console.log("!video player")
							if(
								mutation.type === "attributes"
								&& mutation.attributeName === "href"
								&& mutation.target.classList[0] === "yt-simple-endpoint"
								&& mutation.target.parentNode.id === "owner-name"
							){
								//new layout, name property changes
								//console.log("Username changed");
								updateVideoPage();
							}else if(
								mutation.type === "attributes"
								&& mutation.target.id === "continuations"
								&& mutation.attributeName === "hidden"
							){
								//new layout, related has finished loading
								//console.log("Related has finished loading");

								updateVideoPage();
							}else{
								for(var node of mutation.addedNodes){
									if(
										node.id === "watch7-main-container"
										|| node.localName === "ytd-video-secondary-info-renderer"
									){
										//old layout, and newlayout on first load
										//console.log("Username created");
										updateVideoPage(node);
									}
								}
							}

						}
					}else if(mode === channel || mode === allelse){
						//these are all about detecting that loading has finished.
						if(
							mutation.type === "attributes"
							&& mutation.target.localName === "yt-page-navigation-progress"
							&& mutation.attributeName === "hidden"
							&& mutation.oldValue === null
						){
							found = true;
						}
						for(var node of mutation.addedNodes){
							if(node.localName === "yt-page-navigation-progress"){
								//console.log("Progress bar first created");
								found = true;
								break;
							}
						}
						//oldlayout
						for(var node of mutation.removedNodes){
							if(node.id === "progress"){
								found = true;
								break;
							}
						}
					}

					if(found){
						if(mode === channel)
						updateChannelPage();
						else if(mode === allelse)
						updateVideolists();
						break;
					}
				}
			});
			observer.observe(document.body, {
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
			return video;
		}else if(location.href.indexOf("youtube.com/channel/") !== -1 || location.href.indexOf("youtube.com/user/") !== -1){
			return channel;
		}else{
			return allelse;
		}
	}

	function getChannelId(element, mode){
		if(!mode) mode = getMode();
		if(!element) element = document;
		var channeli = {id: "", username: "", display: ""};

		if(mode === video){

			var links = element.querySelectorAll("ytd-video-owner-renderer a, [id='watch7-user-header'] a");

			for(var link of links){
				var matches = link.getAttribute("href").match(/\/(user|channel)\/([\w-]+)(?:\/|$|\?)/);

				if(matches){
					if(matches[1] === "user")
						channeli.username = matches[2]
					else if(matches[1] === "channel"){
						channeli.id = matches[2];
						channeli.display = link.textContent;
					}
				}

			}

		}else if(mode === channel || mode === ad){
			var link;

			if(mode === channel)
				link = location.href;
			else if(mode === ad){
				channeli.display = element.innerText;
				link = element.href;
			}

			matches = link.match(/\/(user|channel)\/([\w-]+)(?:\/|$|\?)/);

			if(matches){
				if(matches[1] === "user")
					channeli.username = matches[2]
				else if(matches[1] === "channel")
					channeli.id = matches[2];
			}

		}else
			return false;

		if(channeli.id || channeli.username)
			return channeli;
		else
			return false;
	}

	function updateURL(verify){
		var channelId = getChannelId();
		if(!channelId) return;

		if(location.href.indexOf("&disableadblock") !== -1){
			if(inwhitelist(channelId) === -1){
				window.history.replaceState(history.state, "", location.href.replace("&disableadblock=1", ""));
				return false;
			}else return true;
		}else{
			if(inwhitelist(channelId) !== -1){
				window.history.replaceState(history.state, "", location.href + (location.href.indexOf("?") === -1 ? "?" : "") + "&disableadblock=1");

				if(verify) verifyDisabled();
				return true;
			}else return false;
		}
	}

	function updateVideoPage(element){
		var newlayout, container;
		if(container = document.querySelector("ytd-video-owner-renderer")){
			newlayout = true;
		}else if(container = document.querySelector("#watch7-subscription-container")){
			newlayout = false;
		}else return;

		if(!element) element = container;

		if(container.parentNode){
			var whitelisted = updateURL();
			var channelId = getChannelId(element);
			var button;
			// Insert some style overrides for this button
			if(!(button = container.parentNode.querySelector(".UBO-button"))){
				button = document.createElement("button");
				button.className = "UBO-button";
				button.addEventListener("click", function(){
					var channelId = getChannelId();

					if(inwhitelist(channelId) !== -1){
						var index;

						while((index = inwhitelist(channelId)) !== -1){
							settings.whitelisted.splice(index, 1);
						}
						button.classList.remove("yt-uix-button-toggled");
					}else{
						settings.whitelisted.push(channelId);
						button.classList.add("yt-uix-button-toggled");
					}

					browser.runtime.sendMessage({action: "update", settings: settings}, function(response){
						if(response) console.log(response)
					})
					updateURL(true);
				}, false);

				if(newlayout){
					button.className += " UBO-poly " + (whitelisted ? " yt-uix-button-toggled" : "");
					button.innerHTML = "ADS";
				}else{
					button.className += " UBO-old yt-uix-button yt-uix-button-size-default yt-uix-button-subscribed-branded hover-enabled" + (whitelisted ? " yt-uix-button-toggled" : "");
					button.innerHTML = "Ads";
				}
				var buttonContainer;

				if(newlayout){
					buttonContainer = document.createElement("div");
				 	buttonContainer.appendChild(button);
				}else
					buttonContainer = button;

				// Add the button after the container
				if (container.nextSibling){
					container.parentNode.insertBefore(buttonContainer, container.nextSibling);
				}else{
					container.parentNode.appendChild(buttonContainer);
				}
			}else{
				if(inwhitelist(channelId) === -1){
					if(button.classList.contains("yt-uix-button-toggled"))
						button.classList.remove("yt-uix-button-toggled");
				}else{
					if(!button.classList.contains("yt-uix-button-toggled"))
						button.classList.add("yt-uix-button-toggled");
				}
			}

			//update related videos
			var videos = document.querySelectorAll(".video-list-item");
			for(var videoi of videos){
				if(videoi.processed) continue;
				var user = videoi.querySelector("[data-ytid]");
				if(!user)
				continue;
				else
				user = user.getAttribute("data-ytid");
				var links = videoi.querySelectorAll("a[href^='/watch?']");
				for(var link of links){
					if(inwhitelist({id: user}) !== -1){

						link.setAttribute("href", link.getAttribute("href") + "&disableadblock=1");
					}
				}
				videoi.processed = true;
			}

			window.postMessage({settings: settings, updateRelated: true}, "*")

		}
	}

	function updateChannelPage(){

		var channelId = getChannelId();
		var disabled = updateURL();

		if(disabled){
			updateVideolists(channelId)
		}
	}

	function updateVideolists(channelId){
		var videos = document.querySelectorAll(".yt-lockup-video");

		for(var videoi of videos){
			if(videoi.processed) continue;
			var user = videoi.querySelector(".g-hovercard.yt-uix-sessionlink");
			var values = {id: ""};
			if(!user || !(values.id = user.getAttribute("data-ytid")))
				if(channelId)
					values = channelId;
				else
					continue;

			if(inwhitelist(values) !== -1){ //exists
				var links = videoi.querySelectorAll("a[href^='/watch?']");
				for(var link of links){
					link.setAttribute("href", link.getAttribute("href") + "&disableadblock=1");
				}
			}
			videoi.processed = true;
		}
		window.postMessage({settings: settings, updateLists: true, channelId: channelId}, "*")
	}

	function updateAdShowing(player){

		var adlink = player.querySelector(".ytp-title-channel-name");
		var locations = [player.querySelector(".videoAdUiBottomBarText"), player.querySelector(".ytp-title-subtext")];

		if(adlink && getChannelId(adlink, ad).id.length){ //the only way we get the channelId
			var newDiv = parseHTML('<div class="videoAdUiAttributionContainer videoAdUiWtaClickable"><button id="blockads" class="yt-uix-tooltip" data-tooltip-text="Block this advertiser"><img src="'+browser.runtime.getURL("img/icon_16.png")+'"></button></div>')
			var removeButton = newDiv.querySelector("#blockads");
			removeButton.addEventListener("click", function(){
				var channeli = getChannelId(adlink, ad);

				if(channeli && inblacklist(channeli) === -1){
					settings.blacklisted.push(channeli);
					browser.runtime.sendMessage({action: "update", settings: settings}, function(response){
						if(response) console.log(response)
						location.reload();
					})
				}
			})

			for(var i = 0; i < locations.length; i++){
				if(!isHidden(locations[i]) && !locations[i].querySelector("#blockads")){
					locations[i].appendChild(newDiv);
					break;
				}
			}

			if(i === locations.length) console.error("No place to put adblock button")
		}else{
			console.error(".ytp-title-channel-name not available.")
		}
	}

	function verifyDisabled(){
		setTimeout(function(){
			var iframe = document.createElement("iframe");
			iframe.height = "1px";
			iframe.width = "1px";
			iframe.id = "ads-text-iframe";
			iframe.src = "https://googleads.g.doubleclick.net/pagead/";

			document.body.appendChild(iframe);
			setTimeout(function(){
				var iframe = document.getElementById("ads-text-iframe");
				if(iframe.style.display == "none" || iframe.style.display == "hidden" || iframe.style.visibility == "hidden" || iframe.offsetHeight == 0)
					prompt("Ads may still be blocked, make sure you've added the following rule to your adblocker whitelist", "*youtube.com/*&disableadblock=1");
				iframe.remove();
			}, 500);
		}, 800)
	}

	function isHidden(el){
		return (el.offsetParent === null)
	}

	function inwhitelist(search){
		for(var index in settings.whitelisted){
			for(var id in search){
				if(id !== "display" && settings.whitelisted[index][id] === search[id] && search[id].length)
				return index;
			}
		}
		return -1;
	}

	function inblacklist(search){
		for(var index in settings.blacklisted){
			for(var id in search){
				if(id !== "display" && settings.blacklisted[index][id] === search[id] && search[id].length)
				return index;
			}
		}
		return -1;
	}

	function parseHTML(markup) {
		if (markup.toLowerCase().trim().indexOf('<!doctype') === 0) {
			var doc = document.implementation.createHTMLDocument("");
			doc.documentElement.innerHTML = markup;
			return doc;
		} else if ('content' in document.createElement('template')) {
			// Template tag exists!
			var el = document.createElement('template');
			el.innerHTML = markup;
			return el.content;
		} else {
			// Template tag doesn't exist!
			var docfrag = document.createDocumentFragment();
			var el = document.createElement('body');
			el.innerHTML = markup;
			for (i = 0; 0 < el.childNodes.length;) {
				docfrag.appendChild(el.childNodes[i]);
			}
			return docfrag;
		}
	}
})(window, document, chrome ? chrome : browser)
