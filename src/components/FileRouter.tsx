import type { FC } from 'react';
import { useContext } from 'react';

import { TinkerableContext } from '../TinkerableContext';
import { underAppRoot } from '../urlUtils';
import { defaultErrorComponent, defaultLoadingComponent } from './defaults';
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
