# YouTube Channel Whitelist for uBlock Origin
## Installation
### Chrome
[Chrome Web Store](https://chrome.google.com/webstore/detail/youtube-channel-whitelist/pbgojokkgbikdofpgphemhldcbaejfog?)
### Firefox
[Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/youtube-channel-whitelist/)

## Packaging instructions
Start installing node, gulp and other build dependencies in the root directory:

```npm install --only=dev```

Then replace the applications.gecko.id key in ```/shared/manifest.json``` with either your own key or a string in email format (e.g. `test@example.com`)

Finally, to build the packages:

```gulp build```

The packages will be created in ```/dist/```, ready for submission as an extension, and the debug folders will be updated.

## Debugging
To temporarily install the extension on Firefox, you need to first enter the "Debug Addons" page, available through the menu on the Addons page. Then click "Load Temporary Addon", and point to ```/dist/webext/debug``` and click on any file in the directory to load the extension.

To temporarily install the extension on Chrome, you can load ```/dist/chrome/debug``` as an unpacked extension
