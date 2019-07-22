# YouTube Channel Whitelist for uBlock Origin


## Installation

[**Chrome Web Store**](https://chrome.google.com/webstore/detail/youtube-channel-whitelist/pbgojokkgbikdofpgphemhldcbaejfog?)

[**Firefox Addons**](https://addons.mozilla.org/en-US/firefox/addon/youtube-channel-whitelist/)

## Usage
For **uBlock Origin**, add the following line to your whitelist:

    *youtube.com/*&disableadblock=1

Although this extension was designed for uBlock Origin, you can also use it with **Adblock Plus**, **AdBlock** and other adblockers compatible with ADP filters if you use the following filter:

    @@||youtube.com/*&disableadblock=1$document

For convenience, I've created this filter list which can be imported to **Opera's Native Adblocker**

    https://raw.githubusercontent.com/x0a/uBO-YouTube/master/shared/whitelist.txt

<br />

# Contributing

## Translations

If you are multilingual, you can help by contributing some translations here: 
https://crowdin.com/project/youtube-channel-whitelist-for/

Feel free to contribute at your leisure.

## Packaging instructions
Start by installing gulp and other build dependencies by running:

    npm install --only=dev

Then replace the ```applications.gecko.id``` key in ```/shared/manifest.json``` with either your own key or a string in email format (e.g. `test@example.com`)

Finally build the packages by running in the root directory:

    gulp build

The packages will be created in ```/dist/```, ready for submission as an extension, and the debug folders will be updated.

## Debugging
To temporarily install the extension on Firefox, you need to first enter the "Debug Addons" page, available through the menu on the Addons page. Then click "Load Temporary Addon", and point to ```/dist/webext/debug``` and click on any file in the directory to load the extension.

To temporarily install the extension on Chrome, you can load ```/dist/chrome/debug``` as an unpacked extension
