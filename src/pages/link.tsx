import * as React from 'react';
import { FunctionComponent } from 'react';
import { openTab } from './common';

const Link: FunctionComponent<{
    className?: string,
    href: string,
    children: (JSX.Element | string)[] | JSX.Element | string
}> = ({ href, className, children }) => {
    const onClick = (e: React.SyntheticEvent<HTMLAnchorElement>) => {
        const event = e.nativeEvent as MouseEvent;
        const el = event.target as HTMLAnchorElement;

        e.stopPropagation();

        if (event.button === 0) {
            event.preventDefault();
            openTab(el.href);
        }
    }
    return <a href={href} className={className} onClick={onClick}>{children}</a>
}

export default Link;