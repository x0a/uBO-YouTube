import * as React from "react";
import { FunctionComponent, useEffect, useState, useLayoutEffect, useRef} from "react";
import { WhitelistTable, BlacklistTable, MutelistTable, UnmutelistTable } from "./list";
import { bMessage, onSettings } from "./common";
import { Settings } from "../typings";
import { TabContainer, TabPane } from "./tabs";
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

const Main: FunctionComponent<{
    full: boolean,
    defaultTab?: string
}> = ({ full, defaultTab }) => {
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
                <TabContainer defaultTab={defaultTab || ""}>
                    <TabPane title="Whitelist">
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
                    <TabPane title="Ads">
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
                    <TabPane title="Misc">
                        <hr className="d-md-none" />
                        <Options alert={showAlert} settings={settings} />
                    </TabPane>
                </TabContainer>
            </div>
        }

    </div >
}

const Alert: FunctionComponent<AlertProps> = ({ text, danger, confirm, onConfirm, onCancel, show }) => {
    const alertRef = useRef(null as HTMLDivElement);
    useLayoutEffect(() => {
        if(show){
            const height = alertRef.current.offsetHeight;
            const width = alertRef.current.offsetWidth;
            alertRef.current.style.left = (window.innerWidth / 2 - width / 2) + "px";
            alertRef.current.style.top = (window.innerHeight / 2 - height / 2) + "px";
        }
    }, [show])
    return <div className={show ? "" : "d-none"}>
        <div className="overlay" />
        <div ref={alertRef} className="alert">
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
    </div>
}

export default Main;