import * as React from "react";
import { FunctionComponent } from "react";

const Switch: FunctionComponent<{
    checked: boolean;
    onChange: (event: React.FormEvent<HTMLInputElement>) => any;
}> = ({ onChange, checked }) => {
    return <label className="switch mb-0">
        <input type="checkbox" onChange={onChange} checked={checked} />
        <span className="slider round"></span>
    </label>
}

export default Switch;