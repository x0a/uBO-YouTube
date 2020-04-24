import * as React from 'react';
import { FunctionComponent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faInfoCircle } from '@fortawesome/free-solid-svg-icons'
const Switch: FunctionComponent<{
    checked: boolean;
    onChange: (checked: boolean) => any;
}> = ({ onChange, checked }) => {
    return <label className='switch mb-0'>
        <input
            type='checkbox'
            onChange={(event: React.FormEvent<HTMLInputElement>) => onChange(event.currentTarget.checked)}
            checked={checked} />
        <span className='slider round'></span>
    </label>
}
const SwitchableOption: FunctionComponent<{
    checked: boolean;
    onChange: (checked: boolean) => any;
    text: string;
    tooltip?: string;
    listItem?: boolean;
}> = ({ checked, onChange, text, tooltip, listItem = true }) => {
    const item = <div className='list-group-option'>
        <Switch
            checked={checked}
            onChange={onChange} />
        <span className='ml-2 flex-grow-1'>
            {text}
        </span>
        {tooltip && <div className='tooltip-parent'>
            <FontAwesomeIcon icon={faInfoCircle} />
            <div className='tooltip'>
                <div className='tooltip-inner'>{tooltip}</div>
            </div>
        </div>}
    </div>
    return listItem
        ? <li className='list-group-item'>
            {item}
        </li>
        : item
}

export default SwitchableOption;