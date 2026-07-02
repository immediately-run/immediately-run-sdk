import * as react_jsx_runtime from 'react/jsx-runtime';
import { defaultLoadingComponent, defaultErrorComponent } from './defaults.js';
import 'react-error-boundary';

declare const MainContentRedirect: ({ filename }: {
    filename: string;
}) => react_jsx_runtime.JSX.Element;
declare const MainContentInner: ({ candidatesExistPromise, }: {
    candidatesExistPromise: Promise<[string, boolean][]>;
}) => react_jsx_runtime.JSX.Element;
declare const MainContent: ({ LoadingComponent, ErrorComponent, }?: {
    LoadingComponent?: typeof defaultLoadingComponent;
    ErrorComponent?: typeof defaultErrorComponent;
}) => react_jsx_runtime.JSX.Element;

export { MainContent, MainContentInner, MainContentRedirect };
