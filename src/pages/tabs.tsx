
import * as React from "react";
import { FunctionComponent, useState, cloneElement } from "react";

const TabContainer: FunctionComponent<{
    children: React.ReactElement<TabPaneProps>[],
    defaultTab?: string;
}> = ({ children, defaultTab }) => {
    const navTitles = children.map(child => [child.props.id, child.props.title]);
    const firstTab = navTitles.findIndex(([id, _]) => id === defaultTab) !== -1 ? defaultTab : navTitles[0][0];
    const [currentTab, setCurrentTab] = useState(firstTab);
    const tabs = children.map(child => cloneElement(child, {
        key: child.props.id,
        active: child.props.id === currentTab
    }));

    return <>
        <ul className="nav nav-tabs d-sm-none d-md-flex">
            <li className="nav-item">
                <a className="nav-link">
                    <img src="/img/icon_16.png" />
                </a>
            </li>

            {navTitles.map(([id, title]) =>
                <li key={title} className="nav-item">
                    <a
                        className={"nav-link " + (currentTab === id ? "active" : "")}
                        onClick={() => setCurrentTab(id)}
                        href={"#" + id}>
                        {title}
                    </a>
                </li>)}
        </ul>
        <div className="tab-content mt-2">
            {tabs}
        </div>
    </>;
}

interface TabPaneProps {
    active?: boolean,
    title: string;
    id: string;
    children: JSX.Element[] | JSX.Element | string
}
const TabPane: FunctionComponent<TabPaneProps> = ({ active, children }) => {
    return <div className={"tab-pane fade " + (active ? "active show" : "")}>
        {children}
    </div>
}

export { TabContainer, TabPane }