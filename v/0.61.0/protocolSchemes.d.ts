/** Every `protocol-*` scheme the SDK speaks, keyed by its wire name. */
declare const SCHEMES: {
    readonly "protocol-analytics": "analytics";
    readonly "protocol-contribute": "contribute";
    readonly "protocol-dnd": "dnd";
    readonly "protocol-editor": "editor";
    readonly "protocol-feed": "feed";
    readonly "protocol-fetch": "fetch";
    readonly "protocol-ipc": "ipc";
    readonly "protocol-launch": "launch";
    readonly "protocol-llm": "llm";
    readonly "protocol-recents": "recents";
    readonly "protocol-secrets": "secrets";
    readonly "protocol-settings": "settings";
    readonly "protocol-spaces": "spaces";
    readonly "protocol-task": "task";
    readonly "protocol-theme": "theme";
    readonly "protocol-vcs": "vcs";
};

export { SCHEMES };
