import * as react from 'react';

/** Merge the caller's MDX component overrides with those from the surrounding
 *  {@link MDXProvider} context (a function arg receives the parent set to merge). */
declare function useMDXComponents(components: any): any;
/** Provide MDX component overrides (e.g. a custom `a`/`h1`) to the rendered
 *  subtree; transformed `.mdx` modules pick them up. */
declare function MDXProvider(properties: any): react.FunctionComponentElement<react.ProviderProps<{}>>;

export { MDXProvider, useMDXComponents };
