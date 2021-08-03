class NetReq {
    private _block: boolean;  // the reason why no pending is because the top class will check if the result is a PROMISE or boolean;
    private bodyModifier: (body: string) => string;

    constructor() {
        this._block = false;
    }

    block() {
        this._block = true;
    }
    modifyResponse(fn: (req: Request) => ){

    }
    modifyBody(fn: (body: string) => string) { //** This only modifes response after it has been completed, before the request has been passed down to the original request. It will not affect responses in progress suchas Readable streams */{
        this.bodyModifier = fn;
    }
}