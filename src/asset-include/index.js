const { ConcatSource } = require("webpack-sources");
const { readFile } = require('fs').promises;
const glob = require('glob');

/** 
 * This is a custom webpack plugin that likely wont have use for any other project
 * It is used to turn a multi-file project (complete with images and JSON files) 
 * into a single file.
 * It can take included assets (final compiled assets emitted by webpack), non-included assets (assets not included in webpack at all) 
 * and turn it into a JSON object which is exposed to the specified script as
 * a variable called ASSETS. The object is a sort of faux filesystem.
 * It is being used here to make assets available such as userscript.js, userscript.css, icon.png, various translation files, available to one file called ubo-yt.user.js
 */

const globP = (pattern) => new Promise((resolve, reject) => glob(pattern, (err, files) => err ? reject(err) : resolve(files)))

class AssetInclude {
  constructor(targets) {
    this.targets = targets;
  }
  apply(compiler) {
    const targets = this.targets;
    if (targets) {
      if (!(targets instanceof Array)) {
        throw "Invalid parameters";
      } else {

      }
    }
    compiler.hooks.emit.tapAsync('AssetMerger', (compilation, callback) => {
      const merger = new Promise(async (resolve, reject) => {
        for (const targetParam of targets) {
          const assets = [];
          const raw = [];
          const target = targetParam.target;
          const includedAssets = targetParam.includedAssets || [];
          const nonincludedAssets = targetParam.nonincludedAssets || [];

          includedAssets.forEach(asset => {
            if (!compilation.assets[asset]) {
              return 'Could not find asset ' + asset + ' in compilation'
            }
            assets.push({
              filename: asset,
              type: 'string',
              contents: compilation.assets[asset].source()
            })
          })
          await nonincludedAssets.map(async ({ filename, type }) => {
            const files = await globP(filename);
            for (const file of files) {
              const buffer = await readFile(file);
              let contents = '';
              if (type === 'string') {
                contents = buffer.toString();
              } else if (type === 'json') {
                contents = JSON.parse(buffer.toString());
              } else if (type === 'raw') {
                raw.push(buffer.toString());
                return;
              } else if (type === 'base64') {
                contents = buffer.toString('base64');
              }
              assets.push({
                file,
                type,
                contents
              })
            }

          })
          const replaceFirst = (str, needle, replacement) => {
            const i = str.indexOf(needle);
            const e = i + needle.length;
            return str.substring(0, i) + replacement + str.substring(e);
          };
          compilation.updateAsset(target, original => {
            const stringifiedAssets = JSON.stringify(assets);
            return new ConcatSource(raw.join('') + '\n\n' + replaceFirst(original.source(), "'___ASSETS___';", stringifiedAssets + ';'))
          })
        }
        resolve()
      })
      merger
        .then(() => callback())
        .catch(err => console.error(err));
    })
  }
}
module.exports = AssetInclude;