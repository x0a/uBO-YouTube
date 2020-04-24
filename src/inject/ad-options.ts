import icons from './icons';
import { MenuItem } from '../typings';
import { i18n } from './i18n';

export default class AdOptions {
    unMuteIcon: Element;
    muteIcon: Element;
    playIcon: Element;
    muteButton: MenuItem;
    skipButton: MenuItem;
    blacklistButton: MenuItem;
    menu: HTMLDivElement;
    optionsButton: HTMLButtonElement;
    tooltip: HTMLSpanElement;

    buttonFocused: boolean;
    menuFocused: boolean;
    menuOpen: boolean;
    private _muted: boolean;

    static uboIcon: string;

    constructor(onBlacklist: EventListener, onMute: EventListener, onSkip: () => {}) {
        this.toggleMenu = this.toggleMenu.bind(this);
        this.lostFocus = this.lostFocus.bind(this);
        this.unMuteIcon = AdOptions.generateIcon(icons.unMute);
        this.muteIcon = AdOptions.generateIcon(icons.mute);
        this.playIcon = AdOptions.generateIcon(icons.play);
        this.muteButton = this.generateMenuItem(
            i18n('muteBtn'),
            i18n('muteAdvertiserTooltip'),
            this.muteIcon,
            onMute
        )

        this.skipButton = this.generateMenuItem(
            i18n('skipBtn'),
            i18n('skipTooltip'),
            icons.fastForward,
            () => {
                this.closeMenu();
                onSkip()
            }
        )
        this.blacklistButton = this.generateMenuItem(
            i18n('blacklistBtn'),
            i18n('blacklistAdvertiserTooltip'),
            icons.block,
            onBlacklist
        );
        this.menu = (() => {
            let el = document.createElement('div');
            el.setAttribute('class', 'UBO-menu hidden');
            el.appendChild(this.blacklistButton);
            el.appendChild(this.muteButton);
            el.appendChild(this.skipButton);
            el.addEventListener('focusin', () => this.menuFocused = true);
            el.addEventListener('focusout', () => {
                this.menuFocused = false;
                this.lostFocus();
            });
            return el;
        })();

        this.optionsButton = (() => {
            let el = document.createElement('button');
            el.setAttribute('class', 'UBO-ads-btn ytp-button hidden');

            el.appendChild(this.tooltip = (() => {
                let el = document.createElement('span');
                el.setAttribute('class', 'UBO-ads-tooltip');
                return el;
            })());

            el.appendChild((() => {
                let el = document.createElement('div');
                el.setAttribute('class', 'UBO-icon-container');
                el.appendChild((() => {
                    let el = document.createElement('img');
                    el.setAttribute('src', AdOptions.uboIcon);
                    return el;
                })());
                return el;
            })());

            el.addEventListener('click', this.toggleMenu);
            el.addEventListener('focusin', () => this.buttonFocused = true);
            el.addEventListener('focusout', () => {
                this.buttonFocused = false;
                this.lostFocus();
            });
            return el;
        })();

        this.menuOpen = false;
        this.menuFocused = false;
        this.buttonFocused = false;
        this.muted = false;
        this.reset();
    }

    generateMenuItem(text: string, description: string, iconVector: string | Element, onClick: EventListener): MenuItem {
        const defaultIcon = iconVector instanceof Element ? iconVector : AdOptions.generateIcon(iconVector);

        let el: MenuItem = document.createElement('button') as MenuItem;
        let currentIcon = defaultIcon;
        let itemText = document.createTextNode(text);
        let tooltipText = document.createTextNode(description);

        el.setAttribute('class', 'UBO-menu-item');
        el.appendChild(currentIcon);
        el.appendChild(itemText);
        el.appendChild((() => {
            let el = document.createElement('span');
            el.setAttribute('class', 'UBO-ads-tooltip');
            el.appendChild(tooltipText);
            return el;
        })())

        el.setIcon = newIcon => {
            el.replaceChild(newIcon, currentIcon);
            currentIcon = newIcon;
        }
        el.setText = newText => {
            itemText.data = newText;
        }
        el.setDescription = newDescription => {
            tooltipText.data = newDescription;
        }
        el.setDefaults = () => {
            el.setIcon(defaultIcon);
            el.setText(text);
            el.setDescription(description);
        }
        el.addEventListener('click', onClick);
        return el;
    }

    static generateIcon(iconVector: string): Element {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 512 512');
        svg.setAttribute('class', 'UBO-icon');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttributeNS(null, 'fill', 'currentColor');
        path.setAttributeNS(null, 'd', iconVector);

        svg.appendChild(path);
        return svg;
    }

    set muted(shouldMute: boolean) {
        if (shouldMute) {
            this.muteButton.setIcon(this.unMuteIcon);
            this.muteButton.setText(i18n('removeMuteBtn'));
            this.muteButton.setDescription(i18n('removeMuteTooltip'));
        } else {
            this.muteButton.setDefaults();
        }
        this._muted = shouldMute;
    }
    get muted() {
        return this._muted;
    }
    set muteOption(enabled: boolean) {
        this.muteButton.disabled = !enabled;
    }

    set blacklistOption(enabled: boolean) {
        this.blacklistButton.disabled = !enabled;
    }

    set skipOption(enabled: boolean) {
        this.skipButton.disabled = !enabled;
    }

    set advertiserName(title: string) {
        this.tooltip.textContent = i18n('adOptionsTooltip', title);
    }

    reset() {
        this.tooltip.textContent = i18n('adOptionsDefaultTooltip');
        this.blacklistOption = false;
        this.muteOption = false;
        this.skipOption = false;
    }

    toggleMenu() {
        if (this.menuOpen) {
            this.closeMenu();
        } else {
            this.openMenu();
        }
    }

    lostFocus() {
        requestAnimationFrame(() => {
            if (!this.menuFocused && !this.buttonFocused) {
                this.closeMenu();
            }
        })
    }

    closeMenu() {
        this.menu.classList.add('hidden');
        this.tooltip.classList.remove('hidden');
        this.menuOpen = false;
    }

    openMenu() {
        this.menu.classList.remove('hidden');
        this.tooltip.classList.add('hidden');
        this.menu.style.left = (this.optionsButton.offsetLeft - (this.menu.offsetWidth / 2) + (this.optionsButton.offsetWidth / 2)) + 'px';
        this.menu.style.bottom = '49px';
        this.menuOpen = true;
    }

    show() {
        this.optionsButton.classList.remove('hidden');
    }

    hide() {
        this.closeMenu();
        this.optionsButton.classList.add('hidden');
    }

    renderButton() {
        return this.optionsButton;
    }
    renderMenu() {
        return this.menu;
    }
}
