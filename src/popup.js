"use strict";

(function(browser, angular){
	let app = angular.module("uYtPlug", []);
	app.directive('onFileChange', function() {
		return {
			restrict: 'A',
			link: function (scope, element, attrs) {
				var onChangeHandler = scope.$eval(attrs.onFileChange);
				element.on('change', onChangeHandler);
				element.on('$destroy', function() {
					element.off();
				});
			}
		};
	});
	app.filter('decodeURIComponent', function() {
		return window.decodeURIComponent;
	});
	app.controller("main", function($scope, $q){
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

		$scope.createAlert = function(text, confirm, danger){
			$scope.alert.text = text;
			$scope.alert.confirmDanger = danger || false;
			$scope.alert.cancelButton = confirm || false;
			$scope.alert.active = true;

			return $q((resolve, reject) => {
				$scope.alert.confirm = resolve;
				$scope.alert.reject = reject;
			});
		}

		$scope.refresh = function(callback){
			browser.runtime.sendMessage({action: "get"}, function(response){
				$scope.settings = response;
				browser.runtime.sendMessage({action: "recentads"}, function(response){
					$scope.recentads = response;
					$scope.$digest();
					if(callback) callback();
				})
				console.log(response);
			})
		}

		$scope.save = function(){
			browser.runtime.sendMessage({action: "update", settings: $scope.settings}, function(response){
				if(response) 
					console.log(response);
			})
		}

		$scope.removewhite = function(index){
			$scope.createAlert("Are you sure you want to re-enable adblock for '" + $scope.settings.whitelisted[index].display + "'?", true).then(() => {
				$scope.settings.whitelisted.splice(index, 1);
				$scope.save();
			})
		}

		$scope.removeblack = function(index){
			$scope.createAlert("Are you sure you want to unblock '" + $scope.settings.blacklisted[index].display + "'?", true).then(() => {
				$scope.settings.blacklisted.splice(index, 1);
				$scope.save();
			})
		}
		$scope.addblack = function(index){
			let ad = $scope.recentads[$scope.recentads.length - index - 1], display = "";
			for(let i = 0; i < $scope.settings.blacklisted.length; i++)
				if(ad.ucid === $scope.settings.blacklisted[i].id)
					return; // already exists

			if(ad.author)
				display = decodeURIComponent(ad.author);
			else if(ad.title)
				display = decodeURIComponent(ad.title);
			else
				display = decodeURIComponent(ad.ucid);

			$scope.settings.blacklisted.push({display: display, id: ad.ucid, username: ""});
			$scope.save();
		}

		$scope.inblacklist = function(channelId){
			for(let channel = 0; channel < $scope.settings.blacklisted.length; channel++){
				if($scope.settings.blacklisted[channel].id === channelId) 
					return channel;
			}
			return -1;
		}

		$scope.inwhitelist = function(channelId){
			for(let channel = 0; channel < $scope.settings.whitelisted.length; channel++){
				if($scope.settings.whitelisted[channel].id === channelId) 
					return channel;
			}
			return -1;
		}
		
		$scope.import = function(receivedFile){
			let fileimport = document.querySelector("#import");
			if(receivedFile){
				if(!event.target.files.length) return;
				let file = event.target.files[0];
				if(file.type === "application/json"){
					let reader = new FileReader();
					reader.onload = () => {
						let results = JSON.parse(reader.result);

						if(results.blacklisted && results.whitelisted){
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
							$scope.createAlert("File has incorrect data");
						}
						$scope.$digest();
					}
					reader.readAsText(file);
				}else{
					$scope.createAlert("File needs to be application/json, detected \"" + file.type + "\" instead");
				}
				fileimport.value = "";
			}else{
				fileimport.click();
			}
			$scope.$digest();
		}
		$scope.importfile = function(){
			$scope.import(true);
		}

		$scope.clearsettings = function(){
			$scope.createAlert("This will delete " + $scope.settings.whitelisted.length + " whitelisted items, and " + $scope.settings.blacklisted.length + " blacklisted items. You can backup your settings if you don't want to lose them. Do you want to continue?", true, true).then(function(){
				$scope.settings = {whitelisted: [], blacklisted: []};
				$scope.recentads = [];
				$scope.save();
			})
		}

		$scope.export = function(){
			let objURL = URL.createObjectURL(new Blob([JSON.stringify($scope.settings)], {type : 'application/json'}));
			let link = document.createElement("a");
			link.href = objURL;
			link.download = "ublock-youtube.json";
			link.click();
		}
		
		$scope.open = function(id){
			browser.tabs.create({url: "https://youtube.com/channel/" + id});
		}

		$scope.refresh();
	})
})(chrome ? chrome: browser, angular);
