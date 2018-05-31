"use strict";

(function(browser, angular){
	let app = angular.module("uYtPlug", []);

	app.directive('onFileChange', ["$parse", $parse => {
		return {
			restrict: 'A',
			link: (scope, element, attrs) => {
				var onChangeHandler = $parse(attrs.onFileChange);
				element.on('change', event => {
					scope.$apply(() => {
						onChangeHandler(scope, {$event:event});
					})
				});
				element.on('$destroy', () => {
					element.off();
				});
			}
		};
	}]);

	app.directive("ngMiddleClick", [() => {
		return {
			restrict: "A",
			link: (scope, element, attrs) => {
				let set = false;

				element.on("auxclick", event => {
					if(event.which === 2){
						event.preventDefault(event);
						element.triggerHandler("click");
					}
				})
			}
		};
	}])

	app.filter('decodeURIComponent', () => {
		return window.decodeURIComponent;
	});

	((parse) => {
		JSON.parse = (string, reviver) => {
			try{
				return parse(string, reviver)
			}catch(e){
				return undefined;
			}
		}
	})(JSON.parse);

	app.controller("main", ["$scope", "$q", ($scope, $q) => {
		$scope.settings = {whitelisted: [], blacklisted: []};
		$scope.recentads = [];
		
		$scope.alert = {
			active: false,
			cancelButton: true,
			confirmDanger: false,
			confirm : null,
			reject: null,
			text: ""
		}

		$scope.createAlert = (text, confirm, danger) => {
			$scope.alert.text = text;
			$scope.alert.confirmDanger = danger || false;
			$scope.alert.cancelButton = confirm || false;
			$scope.alert.active = true;

			return $q((resolve, reject) => {
				$scope.alert.confirm = resolve;
				$scope.alert.reject = reject;
			});
		}

		$scope.refresh = callback => {
			browser.runtime.sendMessage({action: "get"}, response => {
				$scope.settings = response;
				console.log(response);
				
				browser.runtime.sendMessage({action: "recentads"}, response => {
					$scope.recentads = response;
					console.log(response);
					$scope.$digest();
					if(callback) callback();
				})
			})
		}

		$scope.save = () => {
			browser.runtime.sendMessage({action: "update", settings: $scope.settings}, response => {
				if(response) 
					console.log(response);
			})
		}

		$scope.removewhite = index => {
			$scope.createAlert("Are you sure you want to re-enable adblock for '" + $scope.settings.whitelisted[index].display + "'?", true).then(() => {
				$scope.settings.whitelisted.splice(index, 1);
				$scope.save();
			})
		}

		$scope.removeblack = index => {
			$scope.createAlert("Are you sure you want to unblock '" + $scope.settings.blacklisted[index].display + "'?", true).then(() => {
				$scope.settings.blacklisted.splice(index, 1);
				$scope.save();
			})
		}
		$scope.addblack = index => {
			let ad = $scope.recentads[$scope.recentads.length - index - 1];
			if($scope.inblacklist(ad.channelId.id) !== -1)
				return; // already exists

			$scope.settings.blacklisted.push(ad.channelId);
			$scope.save();
		}

		$scope.inblacklist = channelId => {
			for(let channel = 0; channel < $scope.settings.blacklisted.length; channel++){
				if($scope.settings.blacklisted[channel].id === channelId) 
					return channel;
			}
			return -1;
		}

		$scope.inwhitelist = channelId => {
			for(let channel = 0; channel < $scope.settings.whitelisted.length; channel++){
				if($scope.settings.whitelisted[channel].id === channelId) 
					return channel;
			}
			return -1;
		}
		
		$scope.import = (receivedFile, event) => {
			let fileimport = document.querySelector("#import");
			if(receivedFile){
				if(!event.target.files.length) return;
				let file = event.target.files[0];
				if(file.type === "application/json" || file.type === ""){
					let reader = new FileReader();
					reader.onload = () => {
						let results;

						if((results = JSON.parse(reader.result)) && typeof results === "object" && results.blacklisted && results.whitelisted){
							for(let i = 0; i < results.blacklisted.length; i++)
								if($scope.inblacklist(results.blacklisted[i].id) !== -1){
									results.blacklisted.splice(i, 1);
									i--;
								}
							for(let i = 0; i < results.whitelisted.length; i++)
								if($scope.inwhitelist(results.whitelisted[i].id) !== -1){
									results.whitelisted.splice(i, 1);
									i--;
								}
							if(!results.whitelisted.length && !results.blacklisted.length)
								$scope.createAlert("No new items to add");
							else
								$scope.createAlert(["Add", results.whitelisted.length, "items to whitelist and", results.blacklisted.length, "to blacklist?"].join(" "), true).then(() => {
									for(let channel of results.whitelisted)
										$scope.settings.whitelisted.push(channel);
									for(let channel of results.blacklisted)
										$scope.settings.blacklisted.push(channel);
									$scope.save();
								});
						}else{
							$scope.createAlert("File is likely not valid JSON, or missing data.");
						}
						$scope.$digest();
					}
					reader.readAsText(file);
				}else{
					$scope.createAlert("File needs to be of type \"application/json\", detected \"" + file.type + "\" instead");
				}
				fileimport.value = "";
			}else{
				fileimport.click();
			}
		}
		$scope.opensettings = () => {
			browser.tabs.create({
				active: true,
				url:  'settings.html'
			}, null);
			$scope.close();
		}

		$scope.clearsettings = () => {
			$scope.createAlert("This will delete " + $scope.settings.whitelisted.length + " whitelisted items, and " + $scope.settings.blacklisted.length + " blacklisted items. You can backup your settings if you don't want to lose them. Do you want to continue?", true, true).then(() => {
				$scope.settings = {whitelisted: [], blacklisted: []};
				$scope.recentads = [];
				$scope.save();
			})
		}

		$scope.export = () => {
			let objURL = URL.createObjectURL(new Blob([JSON.stringify($scope.settings)], {type : 'application/json'}));
			let link = document.createElement("a");
			link.href = objURL;
			link.download = "ublock-youtube.json";
			document.body.appendChild(link)

			setTimeout(() => {
				link.click();
				document.body.removeChild(link);
			}, 0);
		}
		
		$scope.open = (id, whitelisted) => {
			return "https://youtube.com/channel/" + id + (whitelisted ? "?igno=re&disableadblock=1" : "");
		}

		$scope.close = () => {
			window.close();
		}

		$scope.refresh();
		
		//Show settings if Firefox or not Windows. Circumvents bug
		$scope.settingsPage = !!(browser.runtime.getBrowserInfo || window.navigator.platform.indexOf("Win") === -1);

		browser.runtime.onMessage.addListener((requestData, sender, sendResponse) => {
			if(requestData.action === "update"){
				$scope.settings = requestData.settings;
				$scope.$digest();
			}
		});
	}])
})(chrome ? chrome: browser, angular);
