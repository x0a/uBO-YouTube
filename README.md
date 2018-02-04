# YouTube Channel Whitelist for uBlock Origin
## Installation
### Chrome
[Chrome Web Store](https://chrome.google.com/webstore/detail/youtube-channel-whitelist/pbgojokkgbikdofpgphemhldcbaejfog?utm_source=chrome-app-launcher-info-dialog)
### Firefox
[Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/youtube-channel-whitelist/)

## Compilation instructions
Start by replacing the applications.gecko.id key in ```/shared/manifest.json``` with either your own key or a string in email format (e.g. "test@test.com")

To build a Chrome-compatible package, run ```node /tools/create_chrome_package.js```
To build a Firefox-compatible package, run ```node /tools/create_webext_package.js```

The resulting packages will be created in ```/dist/```, ready for submission as an extension.

## Debugging
To temporarily install the extension on Firefox, you need to first enter the "Debug Addons" page, available through the menu on the Addons page. Then click "Load Temporary Addon", and point to the created XPI.

To temporarily install the extension on Chrome, you need to extract the package, enter developer mode on Chrome and point it to the extracted directory.
