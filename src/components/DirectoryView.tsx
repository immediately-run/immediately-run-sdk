import { Suspense, use, useMemo } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { readDirectoryListing, type DirectoryListing } from '../directoryListing';
import { underAppRoot } from '../urlUtils';
import { defaultErrorComponent, defaultLoadingComponent } from './defaults';
import { Include } from './Include';
import { Link } from './Link';
import { Prose } from './Prose';

const DirectoryListingView = ({ listingPromise }: { listingPromise: Promise<DirectoryListing> }) => {
  const { dir, parent, entries, readme } = use(listingPromise);
  return (
    <Prose filename={readme?.slice(1)}>
      <nav aria-label={`Contents of ${dir}`} data-ir-directory={dir}>
        <h1>{dir}</h1>
        <ul>
          {parent !== null && (
            <li>
              <Link href={parent}>../</Link>
            </li>
          )}
          {entries.map((entry) => (
            <li key={entry.path}>
              <Link href={entry.path}>{entry.isDirectory ? `${entry.name}/` : entry.name}</Link>
            </li>
          ))}
        </ul>
        {entries.length === 0 && <p>This folder is empty.</p>}
      </nav>
      {readme && (
        <>
          <hr />
          <Include filename={underAppRoot(readme)} />
        </>
      )}
    </Prose>
  );
};

/**
 * The page for a folder routed under `/files/<dir>/`: its entries as links (folders first),
 * then the folder's README if it has one — the shape a code host gives a folder URL.
 */
export const DirectoryView = ({
  path,
  LoadingComponent = defaultLoadingComponent,
  ErrorComponent = defaultErrorComponent,
}: {
  /** Repo-relative folder path, e.g. `tickets/`. */
  path: string;
  LoadingComponent?: typeof defaultLoadingComponent;
  ErrorComponent?: typeof defaultErrorComponent;
}) => {
  // Keyed on the path string, so a re-render of the same folder reuses the one read.
  const listingPromise = useMemo(() => readDirectoryListing(path), [path]);
  return (
    <ErrorBoundary fallbackRender={ErrorComponent} resetKeys={[path]}>
      <Suspense fallback={<LoadingComponent />}>
        <DirectoryListingView listingPromise={listingPromise} />
      </Suspense>
    </ErrorBoundary>
  );
};
