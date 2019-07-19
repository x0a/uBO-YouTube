import * as React from "react";
import { FunctionComponent, useState, useCallback, useEffect, FormEvent } from "react";
import { Settings } from "../typings";
import {
    Confirm, isSettings, cleanSettings, diffSettings,
    mergeSettings, readJSONFile, bMessage, openTab,
    getExtURL
} from "./common";

const Import: FunctionComponent<{
    settings: Settings,
    alert: Confirm
}> = ({ alert, settings }) => {
    const [inputEl, setInput] = useState(null as HTMLInputElement);
    const inputRef = useCallback((el: HTMLInputElement) => {
        if (el !== null) {
            setInput(el);
        }
    }, []);
    const onFile = (event: FormEvent<HTMLInputElement>) => {
        if (!event.currentTarget.files.length) return;
        const file = event.currentTarget.files[0];

        if (file.type !== "application/json" && file.type !== "")
            return alert(`File needs to be of type "application/json", detected "${file.type}" instead`, false, true);

        readJSONFile(file)
            .then(json => {
                inputEl.value = "";
                if (!isSettings(json))
                    throw "Invalid settings";
                const nextSettings = diffSettings(settings, cleanSettings(json));

                if (!nextSettings.whitelisted.length && !nextSettings.blacklisted.length && !nextSettings.muted.length)
                    return alert("No new items to add");

                alert(`Add ${nextSettings.whitelisted.length} items to whitelist, ` +
                    `${nextSettings.blacklisted.length} to blacklist, and ` +
                    `${nextSettings.muted.length} items to mutelist?`
                    , true)
                    .then(() => {
                        const newSettings = mergeSettings(settings, nextSettings);
                        bMessage("set", "bulk", newSettings)
                            .catch(error => alert("Could not set settings" + error, false, true));
                    })
            })
            .catch(error => {
                inputEl.value = "";
                alert(error, false, true);
            });
    }
    return <>
        <input type="file" ref={inputRef} onChange={onFile} className="d-none" />
        <button type="button" className="btn btn-primary" onClick={() => inputEl.click()}>
            <i className="fas fa-file-import" /> Select file..
        </button>
    </>
}

const Export: FunctionComponent<{
    settings: Settings
}> = ({ settings }) => {
    const [linkEl, setLink] = useState(null as HTMLAnchorElement);
    const [blobURL, setBlobURL] = useState("");
    const linkRef = useCallback((el: HTMLAnchorElement) => el !== null && setLink(el), []);
    useEffect(() => {
        const fileBlob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(fileBlob);
        setBlobURL(url);
        return () => URL.revokeObjectURL(url);
    }, [settings])

    return <>
        <a download="ublock-youtube.json" href={blobURL} ref={linkRef} className="d-none" />
        <button type="button" className="btn btn-primary" onClick={() => linkEl.click()}>
            <i className="fas fa-download" /> Download
        </button>
    </>
}

const Reset: FunctionComponent<{
    alert: Confirm,
    className?: string
}> = ({ alert, className = "" }) => {
    const reset = () => alert(
        "This will erase all whitelisted items, ad options and preferences. " +
        "If you don't want to lose your settings, cancel and click export first.", true, true)
        .then(() => bMessage("set", "reset"));
    return <button
        type="button"
        className={"btn btn-danger " + className}
        title="Erase all settings"
        onClick={reset}>
        <i className="fas fa-trash" /> Reset
    </button>
}

const SettingsPage = () => <button
    className="btn btn-primary btn-sm"
    onClick={() => {
        openTab(getExtURL("settings.html"))
            .then(() => window.close())
    }}>
    <i className="fas fa-cog mr-1" />Options
</button>

const Options: FunctionComponent<{
    settings: Settings,
    alert: Confirm,
}> = ({ settings, alert }) => {
    return <div className="row">
        <div className="d-sm-none d-md-block col-md-6">
            <div className="list-group list-group-flush">
                <div className="list-group-item">
                    <div className="d-flex w-100 justify-content-between">
                        Import settings from file
                        <Import alert={alert} settings={settings} />
                    </div>
                </div>
                <div className="list-group-item">
                <div className="d-flex w-100 justify-content-between">
                        Export settings to file
                        <Export settings={settings} />
                    </div>
                </div>
                <div className="list-group-item">
                <div className="d-flex w-100 justify-content-between">
                        Reset to default settings
                        <Reset alert={alert} className="" />
                    </div>
                </div>
            </div>
        </div>
        <div className="d-md-none float-right-sm">
            <SettingsPage />
        </div>
    </div>
}

export default Options