import * as React from 'react';
import { FunctionComponent } from 'react';

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

export default Switch;