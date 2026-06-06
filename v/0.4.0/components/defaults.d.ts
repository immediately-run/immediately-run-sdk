import * as react_jsx_runtime from 'react/jsx-runtime';
import { ErrorBoundaryPropsWithRender } from 'react-error-boundary';

declare const defaultLoadingComponent: () => react_jsx_runtime.JSX.Element;
declare const defaultErrorComponent: ErrorBoundaryPropsWithRender["fallbackRender"];

export { defaultErrorComponent, defaultLoadingComponent };
