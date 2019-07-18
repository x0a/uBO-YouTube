import * as React from "react";
import browser from "../browser";
import { FunctionComponent, useEffect, useState } from "react";
import { WhitelistTable, BlacklistTable, MutelistTable, UnmutelistTable } from "./list";
import { bMessage, onSettings } from "./common";
import { Settings } from "../typings";
import Options from "./options";
import ChannelSearch from "./search";
import ImportSubscriptions from "./subscriptions";
import Switch from "./switch";
import RecentAds from "./recentads";

interface AlertProps {
    show: boolean,
    text: string,
    confirm: boolean,
    danger: boolean,
    onConfirm: () => any,
    onCancel: () => any
}
const enum TabType {
    WhitelistTab,
    AdsTab,
    OptionsTab
}
const Main: FunctionComponent<{
    full: boolean,
    search: boolean,
}> = ({ full }) => {
    const defaultAlert = Object.freeze({
        show: false,
        text: "",
        confirm: false,
        danger: false,
        onConfirm: () => { },
        onCancel: () => { }
    } as AlertProps);

    const [settings, setSettings] = useState({
        blacklisted: [],
        whitelisted: [],
        muted: [],
        muteAll: false,
        skipOverlays: true,
    } as Settings);
    const [alert, setAlert] = useState(defaultAlert)
    const [nav, setNav] = useState(TabType.WhitelistTab);

    const showAlert = (text: string, confirm = false, danger = false) => new Promise((resolve, reject) => {
        setAlert({
            show: true,
            text,
            confirm,
            danger,
            onConfirm: () => {
                setAlert(defaultAlert);
                resolve();
            },
            onCancel: () => {
                setAlert(defaultAlert);
                reject();
            }
        })
    }) as Promise<void>;

    useEffect(() => {
        bMessage("get", "settings").then(settings => {
            console.log("Received settings: ", settings);
            setSettings(settings)
        });

        onSettings(settings => {
            console.log("Received settings: ", settings);
            setSettings(settings)
        })
    }, []);

    return <div className={!full && !alert.show ? "main" : ""}>
        {alert.show && <Alert {...alert} />}
        {!(alert.show && !full) &&
            <div className="container-fluid">
                <Nav tabs={[{
                    id: TabType.WhitelistTab,
                    title: "Whitelist"
                }, {
                    id: TabType.AdsTab,
                    title: "Ads"
                }, {
                    id: TabType.OptionsTab,
                    title: "Options"
                }]}
                    nav={nav}
                    onNav={setNav} />

                <div className="tab-content mt-2">
                    <TabPane active={nav === TabType.WhitelistTab}>
                        <div className="row">
                            <div className="col-md">
                                <WhitelistTable list={settings.whitelisted} alert={showAlert} full={full} />
                            </div>
                            <div className="col-md d-sm-none d-md-block">
                                <h4 className="invisible">Find channels</h4>
                                <ChannelSearch alert={showAlert} whitelisted={settings.whitelisted} full={full}>
                                    <ImportSubscriptions settings={settings} alert={showAlert} className="ml-2" />
                                </ChannelSearch>
                            </div>
                        </div>
                    </TabPane>
                    <TabPane active={nav === TabType.AdsTab}>
                        <div className="row">

                            {full && <div className="col-md-3 d-sm-none d-md-block">
                                <h4>Ad Options</h4>
                                <ul className="list-group">
                                    <li className="list-group-item list-group-option">
                                        <Switch
                                            checked={settings.muteAll}
                                            onChange={(e) => bMessage("set", "mute-all", e.currentTarget.checked)} />
                                        <span className="ml-2">Mute ads by default</span>
                                    </li>
                                    <li className="list-group-item list-group-option">
                                        <Switch
                                            checked={settings.skipOverlays}
                                            onChange={(e) => bMessage("set", "skip-overlays", e.currentTarget.checked)} />
                                        <span className="ml-2">Hide overlay ads</span>
                                    </li>
                                </ul>
                            </div>}
                            <div className="col-md-3">
                                {settings.muteAll
                                    ? <UnmutelistTable list={settings.muted} alert={showAlert} full={full} />
                                    : <MutelistTable list={settings.muted} alert={showAlert} full={full} />
                                }
                                <BlacklistTable list={settings.blacklisted} alert={showAlert} full={full} />
                            </div>
                            <div className="col-md">
                                <RecentAds full={full} settings={settings} />
                            </div>
                        </div>
                    </TabPane>
                    <TabPane active={nav === TabType.OptionsTab}>
                        <hr className="d-md-none" />
                        <Options alert={showAlert} settings={settings} />
                    </TabPane>
                </div>
            </div>
        }

    </div >
}

const Alert: (props: AlertProps) => JSX.Element = ({ text, danger, confirm, onConfirm, onCancel }) => {
    return <>
        <div className="overlay" />
        <div className="alert">
            <p className="font-weight-bold-sm">{text}</p>
            <div className="float-right-sm">
                <button type="button"
                    className={"btn btn-sm " + (danger ? "btn-danger" : "btn-primary")}
                    onClick={onConfirm}>
                    OK
                </button>
                {confirm &&
                    <button type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={onCancel}>
                        Cancel
                    </button>}
            </div>
        </div>
    </>
}
interface NavItem {
    id: TabType,
    title: string,
}
const Nav: FunctionComponent<{
    tabs: Array<NavItem>,
    nav: TabType,
    onNav: (id: TabType) => any,

}> = ({ tabs, nav, onNav }) => {
    return <ul className="nav nav-tabs d-sm-none d-md-flex">
        <li className="nav-item">
            <a className="nav-link">
                <img src="/img/icon_16.png" />
            </a>
        </li>

        {tabs.map(tab =>
            <li className="nav-item">
                <a
                    className={"nav-link " + (nav === tab.id && "active")}
                    onClick={() => onNav(tab.id)}
                    href={"#" + tab.title.toLowerCase()}>
                    {tab.title}
                </a>
            </li>)}
    </ul>
}

const TabContainer: FunctionComponent<{
    children: JSX.Element[]
}> = ({ children }) => {

}

const TabPane: FunctionComponent<{
    active: boolean,
    children: JSX.Element[] | JSX.Element | string
}> = ({ active, children }) => {
    return <div className={"tab-pane fade " + (active ? "active show" : "")}>
        {children}
    </div>
}

export default Main;