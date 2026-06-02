import type { FC } from 'react';
import { useContext } from 'react';

import { TinkerableContext } from '../TinkerableContext';
import { underAppRoot } from '../urlUtils';
import { defaultErrorComponent, defaultLoadingComponent } from './defaults';
import { Include } from './Include';

export const FileRouter: FC = ({
  LoadingComponent = defaultLoadingComponent,
  ErrorComponent = defaultErrorComponent,
}: {
  LoadingComponent?: typeof defaultLoadingComponent;
  ErrorComponent?: typeof defaultErrorComponent;
} = {}) => {
  const { navigationState: { pathParameters, sandboxPath } } = useContext(TinkerableContext);
  const filename = pathParameters?.filename;
  if (!filename) {
    return <ErrorComponent error={new Error(`No filename could be extracted from ${sandboxPath}`)} resetErrorBoundary={() => {}}/>;
  }
  // URL subpaths are repo-relative; the sandbox fs is rooted at `/` with the
  // repo mounted at `APP_ROOT`, so anchor the file path there before resolving.
  return <Include
    filename={underAppRoot(filename)}
    LoadingComponent={LoadingComponent}
    ErrorComponent={ErrorComponent}
    // @ts-ignore
    baseModule={module}
  />
};
