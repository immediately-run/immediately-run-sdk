import * as react from 'react';
import { defaultLoadingComponent, defaultErrorComponent } from './defaults.js';
import 'react-error-boundary';

/**
 * The page for a folder routed under `/files/<dir>/`: its entries as links (folders first),
 * then the folder's README if it has one — the shape a code host gives a folder URL.
 */
declare const DirectoryView: ({ path, LoadingComponent, ErrorComponent, }: {
    /** Repo-relative folder path, e.g. `tickets/`. */
    path: string;
    LoadingComponent?: typeof defaultLoadingComponent;
    ErrorComponent?: typeof defaultErrorComponent;
}) => react.JSX.Element;

export { DirectoryView };
