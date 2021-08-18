import * as React from 'react';
import { FunctionComponent, useState, useRef } from 'react';
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
        {tooltip && <Tooltip text={tooltip} />}
    </div>
    return listItem
        ? <li className='list-group-item'>
            {item}
        </li>
        : item
}

const Tooltip: FunctionComponent<{
    text: string;
    className?: string;
}> = ({ text, children, className }) => {
    const [show, setShow] = useState(false);
    const [x, setX] = useState(0);
    const [y, setY] = useState(0);
    const tooltip = useRef(null as HTMLDivElement);
    const tooltipParent = useRef(null as HTMLSpanElement)
    // TODO:: figure this shit out, how to calculate optimal place to put tooltip when its a fixed size bvased on a fixed width

    return <>
        <div className={'tooltip-dyn ' + (show ? 'visible' : 'invisible')} style={{ left: x, top: y }} ref={tooltip}>
            {text}
        </div>
        <span ref={tooltipParent}
            onMouseEnter={(event) => {
                const parentWidth = tooltipParent.current.offsetWidth;
                const parentHeight = tooltipParent.current.offsetHeight;
                const { top, left } = tooltipParent.current.getBoundingClientRect();
                const childHeight = tooltip.current.offsetHeight;
                const childWidth = tooltip.current.offsetWidth;

                const rightX = left + parentWidth + 8
                const rightY = (top + (parentHeight / 2)) - (childHeight / 2);
                if (rightX + childWidth > window.innerWidth) {
                    // place above instead
                    setX((left + (parentWidth / 2)) - (childWidth / 2))
                    setY(top - parentHeight - 4)
                } else {
                    setX(rightX);
                    setY(rightY);
                }
                setShow(true)
            }}
            className={className || ''}
            onMouseLeave={() => setShow(false)}>
            {children || <FontAwesomeIcon icon={faInfoCircle} />}
        </span>
    </>

    // <div className='tooltip-parent'>
    //    <span>{children || <FontAwesomeIcon icon={faInfoCircle} />}</span>
    //   <div className='tooltip'>
    //       <div className='tooltip-inner'>{text}</div>
    //   </div>
    // </div>
}
export { SwitchableOption, DropdownSelection, Tooltip }
export default SwitchableOption;