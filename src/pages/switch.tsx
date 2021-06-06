import * as React from 'react';
import { FunctionComponent, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faInfoCircle, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';

const realBlur = ({ relatedTarget, currentTarget }: React.FocusEvent) => {
    return relatedTarget !== currentTarget
        && !(currentTarget as HTMLElement).contains(relatedTarget as Node)
}

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
const DropdownSelection: FunctionComponent<{
    items: Array<{
        text: string,
        value: number,
        warning?: string
    }>,
    selected: number;
    onSelect: (selection: number) => void
}> = ({ items, selected, onSelect }) => {
    const [show, setShow] = useState(false);
    return <div className='dropdown' onBlur={(e) => realBlur(e) && setShow(false)}>
        <button className='btn btn-secondary dropdown-toggle' onClick={() => setShow(!show)}>
            {items.find(({ value }) => value === selected)?.text}
        </button>
        <div className={'dropdown-menu ' + (show ? 'show' : '')}>
            {items.map(({ text, value, warning }) => <a
                className='dropdown-item'
                href='#'
                key={value}
                onClick={() => {
                    setShow(false);
                    onSelect(value);
                }}>{text + ' '}{warning && <span className='float-right tooltip-parent'>
                    <FontAwesomeIcon icon={faExclamationTriangle} />
                    <div className='tooltip'>
                        <div className='tooltip-inner'>{warning}</div>
                    </div>
                </span>}</a>)}
        </div>
    </div>
}
const SwitchableOption: FunctionComponent<{
    checked: boolean;
    onChange: (checked: boolean) => any;
    text: string;
    tooltip?: string;
    listItem?: boolean;
}> = ({ checked, onChange, text, tooltip, listItem = true, children }) => {
    const item = <div className='list-group-option'>
        <Switch
            checked={checked}
            onChange={onChange} />
        <span className='ml-2 flex-grow-1'>
            {text}
        </span>
        {children}
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
export { SwitchableOption, DropdownSelection }
export default SwitchableOption;