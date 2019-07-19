
import * as React from "react";
import { FunctionComponent, useState, cloneElement } from "react";
import slugify_ from "slugify";

const slugify = (str: string) => slugify_(str, { lower: true });

const TabContainer: FunctionComponent<{
    children: React.ReactElement<TabPaneProps>[],
    defaultTab?: string;
}> = ({ children, defaultTab }) => {
    const navTitles = children.map(child => [child.props.title, slugify(child.props.title)]);
    const firstTab = navTitles.findIndex(([_, id]) => id === defaultTab) !== -1 ? defaultTab : navTitles[0][1];
    const [currentTab, setCurrentTab] = useState(firstTab);
    const tabs = children.map(child => cloneElement(child, {
        key: child.props.title,
        active: slugify(child.props.title) === currentTab
    }));
    
    return <>
        <ul className="nav nav-tabs d-sm-none d-md-flex">
            <li className="nav-item">
                <a className="nav-link">
                    <img src="/img/icon_16.png" />
                </a>
            </li>

            {navTitles.map(([tabTitle, slug]) =>
                <li key={tabTitle} className="nav-item">
                    <a
                        className={"nav-link " + (currentTab === slug ? "active" : "")}
                        onClick={() => setCurrentTab(slug)}
                        href={"#" + slug}>
                        {tabTitle}
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
    children: JSX.Element[] | JSX.Element | string
}
const TabPane: FunctionComponent<TabPaneProps> = ({ active, children }) => {
    return <div className={"tab-pane fade " + (active ? "active show" : "")}>
        {children}
    </div>
}

export { TabContainer, TabPane }