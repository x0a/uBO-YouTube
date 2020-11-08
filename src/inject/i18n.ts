import LocaleString from '../_locales/types';
import { err } from './logging'

interface LocaleMessages {
    [messageName: string]: string
}

let locale: LocaleMessages = {};
const seti18n = (_locale: LocaleMessages) => locale = _locale;

const i18n = (messageName: LocaleString, substitutions?: string | number | Array<string | number>): string => {
    const message = locale[messageName];
    if (!message) {
        err('No i18n message found for', messageName);
        return '';
    }

    if (!substitutions)
        return message;

    const subs = substitutions instanceof Array
        ? substitutions.map(i => i + '')
        : [substitutions + ''];
    let result = message;

    for (let i = 0; i < subs.length; i++)
        result = result.replace(new RegExp('\\$' + (i + 1) + '\\$', 'g'), subs[i]);

    return result;
}

export { i18n, seti18n };
export default i18n;