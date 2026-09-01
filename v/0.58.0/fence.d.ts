/** Wrap untrusted, corpus-derived content in a labelled fence for a prompt. */
declare function fenceUntrusted(label: string, content: string): string;

export { fenceUntrusted };
