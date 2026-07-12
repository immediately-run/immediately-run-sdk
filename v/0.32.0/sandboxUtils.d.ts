declare const sendMessage: (type: string, data?: Record<string, any>) => void;
declare const protocolRequest: (protocolName: string, method: string, params: Array<any>) => Promise<any>;
declare const addListener: (msgType: string, handler: (msg: any) => void, event?: any) => (() => void);

export { addListener, protocolRequest, sendMessage };
