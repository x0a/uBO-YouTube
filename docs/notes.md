## ADS

YouTube uses industry standard VAST in order to retrieve ads for it's videos.
The standard is described in full detail here: 
https://www.iab.com/wp-content/uploads/2015/06/VASTv3_0.pdf

/watch?v= page contains a response which contains the ad in:

response[2].player.args.vmap

and stores it in window.ytplayer.config.args.vmap

On initial load, this is hard coded into the HTML page, in a script tag.
On subsequent viewings, it's provided through the JSON data at /watch?v=*&pbj=1
If

Perhaps the best choice here is to come up with a class to intercept
the page before it loads, make changes, and pass the changes to the page.
And use onbeforescriptexecute to catch the object during initial load.

## CHANNEL INFORMATION
In the Polymer design, YouTube has conveniently placed the channel data in *\[htmlElement\]*.data.navigationEndpoint.browseEndpoint.browseId
or *\[htmlElement\]*.data.response.metadata.channelMetadataRenderer.externalId in the case of the channel page.

The container that we place the whitelist button into is
not necessarily the same container that we get the channelId data from.
So it's necessary to keep track of both separately.
For efficiency reasons, it would be nice to keep track of any parent container
of both. To have easy access to both. But this adds some complexity.
And reduces maintainability. So for now we keep track only keep track of
.dataContainer and .parentContainer. The element that contains the channelId
data, and the element that the button will be placed into.


### TODO
* Fix AdOptions on full screen
* Add Settings menu with toggle-able options
    * Auto close ad overlays (also sends click events to whitelisted channels so channel earns money)

        Close button can be found with _.querySelector_(`".ad-container [role=button][title=Close]"`)

* Change "delete all button" to Settings button on chrome