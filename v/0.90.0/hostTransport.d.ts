interface HostTransport {
    sendMessage(type: string, data?: Record<string, any>): void;
    protocolRequest(protocolName: string, method: string, params: Array<any>): Promise<any>;
    onMessage(handler: (msg: any) => void): {
        dispose(): void;
    };
}
declare function transport(): HostTransport;
declare const sendMessage: (type: string, data?: Record<string, any>) => void;
declare const addListener: (msgType: string, handler: (msg: any) => void, event?: any) => (() => void);

export { type HostTransport, addListener, sendMessage, transport };
