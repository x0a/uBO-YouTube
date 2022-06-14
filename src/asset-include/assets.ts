interface Asset {
    filename: string,
    type: 'string' | 'base64' | 'json'
    contents: any
}
type Assets = Array<Asset>;
const assets: Assets = (() => {
    const nextAssets = '___ASSETS___';
    if(nextAssets !== '___ASSETS___'){
        return nextAssets as Assets;
    }else{
        return undefined;
    }
})();

export const getAssetsList = (): Array<string> => {
    if (!assets) return [];
    return assets.map(({ filename }) => filename);
}

export const getAsset = (file_name: string): Asset => {
    if (!assets) return undefined;
    return assets.find(({ filename }) => filename === file_name);
}

export const removeAsset = (file_name: string): void => {
    if (!assets) return;
    assets.filter(({ filename }) => filename === file_name);
}