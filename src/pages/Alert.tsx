import * as React from "react";
import { Component, Fragment } from "react"

const noop = () => { };

interface AlertProps {
    onConfirm: () => void;
    onCancel: () => void;
    dismiss: () => void;
    danger: boolean;
    text: string;
}

class Alert extends Component<AlertProps> {
    accepted: () => void;
    rejected: () => void;
    dismiss: () => void;
    text: string;
    danger: boolean;

    constructor(props: AlertProps) {
        super(props);
        this.text = props.text || "";
        this.accepted = props.onConfirm || noop;
        this.rejected = props.onCancel || null;
        this.dismiss = props.dismiss || noop;
        this.danger = props.danger || false;

        this.accept = this.accept.bind(this);
        this.cancel = this.cancel.bind(this);
    }
    static defaultProps(): any {
        return { show: false, confirm: false, danger: false, onConfirm: null, onCancel: null, text: "" };
    }
    cancel() {
        this.rejected();
        this.dismiss();
    }

    accept() {
        this.accepted();
        this.dismiss();
    }

    render() {
        const alertType = this.danger ? "btn-danger" : "btn-primary";

        return <Fragment>
            <div className="overlay" />
            <div className="alert">
                <p className="bold">{this.text}</p>
                <div className="align-right">
                    <button className={"btn btn-sm " + alertType} type="button" onClick={this.accept}>
                        OK
                        </button>
                    {
                        this.rejected &&
                        <button className="btn btn-sm btn-secondary" type="button" onClick={this.cancel}>
                            Cancel
                            </button>
                    }
                </div>
            </div>
        </Fragment>
    }
}
export default Alert;