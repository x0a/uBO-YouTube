(function(browser){
  var app = angular.module("uYtPlug", []);
  app.filter('decodeURIComponent', function() {
      return window.decodeURIComponent;
  });
  app.controller("main", function($scope){
  	$scope.settings = {whitelisted: [], blacklisted: []};
    $scope.recentads = [];

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
  		console.log($scope.settings);
  		browser.runtime.sendMessage({action: "update", settings: $scope.settings}, function(response){
  			if(response) console.log(response);
  		})
  	}

  	$scope.removewhite = function(index){
  		if(!confirm("Are you sure you want to re-enable adblock for '" + $scope.settings.whitelisted[index].display + "'?")) return;
  		$scope.settings.whitelisted.splice(index, 1);
  		$scope.save();
  	}

  	$scope.removeblack = function(index){
  		if(!confirm("Are you sure you want to unblock '" + $scope.settings.blacklisted[index].display + "'?")) return;
  		$scope.settings.blacklisted.splice(index, 1);
  		$scope.save();
  	}
  	$scope.addblack = function(index){
  		var ad = $scope.recentads[$scope.recentads.length - index - 1],
  		    display = "";
      for(var i = 0; i < $scope.settings.blacklisted.length; i++)
        if(ad.ucid === $scope.settings.blacklisted[i].id)
          return;
  		if(ad.author)
  			display = decodeURIComponent(ad.author);
  		else if(ad.title)
  			display = decodeURIComponent(ad.title);
  		else
  			display = decodeURIComponent(ad.ucid);

  		$scope.settings.blacklisted.push({display: display, id: decodeURIComponent(ad.ucid), username: ""});
  		$scope.save();
  	}
  	$scope.open = function(id){
  		browser.tabs.create({url: "https://youtube.com/channel/" + id});
  	}

  	$scope.refresh();
  })
})(chrome ? chrome: browser);
