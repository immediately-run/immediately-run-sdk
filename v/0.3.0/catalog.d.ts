/** One advertised method, as the host generated it from its gate table. */
interface ApiMethod {
    /** Catalog name, `protocol-` stripped — e.g. `spaces:share`, `contribute:run`. */
    name: string;
    /** The capability this method requires (already held — it's in your catalog). */
    capability: string;
    /** True when the method STREAMS (use {@link invokeStream}) vs. single-reply. */
    stream?: boolean;
}
/**
 * Call a catalog method by name — `invoke('spaces:share', { spaceId, login, role })`.
 * A thin generic over the host protocol: the host validates params and gates the
 * call (an un-granted method → `forbidden`, even if you name it directly). For a
 * STREAMING method (`ApiMethod.stream`), use {@link invokeStream}.
 */
declare const invoke: <T = unknown>(name: string, params?: Record<string, unknown>) => Promise<T>;
/** Call a STREAMING catalog method by name, yielding its events. */
declare function invokeStream<T = unknown, R = unknown>(name: string, params?: Record<string, unknown>): AsyncGenerator<T, R, void>;
/** The methods this app may call (grant-filtered, §5.5). Poll for a one-off read;
 *  use {@link onCatalogChange} / {@link useCatalog} to react. */
declare const getCatalog: () => ApiMethod[];
/** Subscribe to catalog changes (e.g. a grant added/revoked). Invoked immediately
 *  with the current catalog, then on every change. Returns an unsubscribe fn. */
declare const onCatalogChange: (listener: (catalog: ApiMethod[]) => void) => (() => void);
/** React hook returning this app's method catalog, re-rendering on change. Hand
 *  it to an embedded agent as its tool list to confine the agent to the app's
 *  authority (§5.9). */
declare const useCatalog: () => ApiMethod[];

export { type ApiMethod, getCatalog, invoke, invokeStream, onCatalogChange, useCatalog };
