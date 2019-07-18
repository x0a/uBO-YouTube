import * as React from "react";
import ReactDOM from "react-dom";
import Main from "./main";

document.addEventListener("DOMContentLoaded", () =>
    ReactDOM.render(
        <Main
            search={location.hash === "#searchpermissions"}
            full={location.href.indexOf("/settings.html") !== -1}
        />,
        document.getElementById('root')
    )
)