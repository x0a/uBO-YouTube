import * as React from 'react';
import ReactDOM from 'react-dom';
import Main from './main';

document.addEventListener('DOMContentLoaded', () =>
    ReactDOM.render(
        <Main
            defaultTab={location.hash.substring(1)}
            full={location.href.indexOf('/settings.html') !== -1}
        />,
        document.getElementById('root')
    )
)