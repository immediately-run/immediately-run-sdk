import * as react from 'react';
import { defaultLoadingComponent, defaultErrorComponent } from './defaults.js';
import 'react-error-boundary';

declare const MainContentRedirect: ({ filename }: {
    filename: string;
}) => react.JSX.Element;
declare const MainContentInner: ({ candidatesExistPromise, }: {
    candidatesExistPromise: Promise<[string, boolean][]>;
}) => react.JSX.Element;
declare const MainContent: ({ LoadingComponent, ErrorComponent, }?: {
    LoadingComponent?: typeof defaultLoadingComponent;
    ErrorComponent?: typeof defaultErrorComponent;
}) => react.JSX.Element;

export { MainContent, MainContentInner, MainContentRedirect };
