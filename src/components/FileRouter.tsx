import type { FC } from 'react';
import { Suspense, use, useContext, useMemo } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { TinkerableContext } from '../TinkerableContext';
import { underAppRoot } from '../urlUtils';
import { defaultErrorComponent, defaultLoadingComponent } from './defaults';
import { isDirectoryPath, namesDirectory } from '../directoryListing';
import { DirectoryView } from './DirectoryView';
import { Include } from './Include';
import { Prose } from './Prose';
import { isProseFile } from '../proseStyles';

export const FileRouter: FC = ({
  LoadingComponent = defaultLoadingComponent,
  ErrorComponent = defaultErrorComponent,
}: {
  LoadingComponent?: typeof defaultLoadingComponent;
  ErrorComponent?: typeof defaultErrorComponent;
} = {}) => {
  const {
    navigationState: { pathParameters, sandboxPath },
  } = useContext(TinkerableContext);
  // The default table matches `/files/*`, surfacing the file path under the `*`
  // wildcard (SANDBOX_ROUTING_SPEC §4.1/§7).
  const filename = pathParameters?.['*'];
  if (!filename) {
    return (
      <ErrorComponent
        error={new Error(`No filename could be extracted from ${sandboxPath}`)}
        resetErrorBoundary={() => {}}
      />
    );
  }
  // A trailing slash names a folder outright (`[tickets/](tickets/)` in a README); without
  // one the path may still be a folder, so the fs decides before the module loader is asked
  // to `require` it — which, for a folder, fails with "Cannot find module '/app/tickets'".
  if (namesDirectory(filename)) {
    return <DirectoryView path={filename} LoadingComponent={LoadingComponent} ErrorComponent={ErrorComponent} />;
  }
  return <FileOrDirectory filename={filename} LoadingComponent={LoadingComponent} ErrorComponent={ErrorComponent} />;
};

type Slots = {
  LoadingComponent: typeof defaultLoadingComponent;
  ErrorComponent: typeof defaultErrorComponent;
};

const FileOrDirectory = ({ filename, LoadingComponent, ErrorComponent }: { filename: string } & Slots) => {
  // Keyed on the path string only, so a suspended retry reuses the same probe.
  const isDirectoryPromise = useMemo(() => isDirectoryPath(filename), [filename]);
  return (
    <ErrorBoundary fallbackRender={ErrorComponent} resetKeys={[filename]}>
      <Suspense fallback={<LoadingComponent />}>
        <ResolvedPath
          filename={filename}
          isDirectoryPromise={isDirectoryPromise}
          LoadingComponent={LoadingComponent}
          ErrorComponent={ErrorComponent}
        />
      </Suspense>
    </ErrorBoundary>
  );
};

const ResolvedPath = ({
  filename,
  isDirectoryPromise,
  LoadingComponent,
  ErrorComponent,
}: { filename: string; isDirectoryPromise: Promise<boolean> } & Slots) => {
  if (use(isDirectoryPromise)) {
    return <DirectoryView path={filename} LoadingComponent={LoadingComponent} ErrorComponent={ErrorComponent} />;
  }
  // URL subpaths are repo-relative; the sandbox fs is rooted at `/` with the
  // repo mounted at `APP_ROOT`, so anchor the file path there before resolving.
  const content = (
    <Include
      filename={underAppRoot(filename)}
      LoadingComponent={LoadingComponent}
      ErrorComponent={ErrorComponent}
      // @ts-ignore
      baseModule={module}
    />
  );
  // Markdown gets the default typography; a routed app component or HTML file renders as
  // it always has, so an app's own interface is never restyled.
  return isProseFile(filename) ? <Prose filename={filename}>{content}</Prose> : content;
};
