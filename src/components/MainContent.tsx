import { Suspense, use, useMemo } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { navigate, useTinkerableLink } from '../routing';
import { FILES_PREFIX, underAppRoot } from '../urlUtils';
import { sandboxFs, type SandboxFsPort } from '../fs';

import { defaultErrorComponent, defaultLoadingComponent } from './defaults';

// Repo-relative candidate paths. These are kept repo-relative because the
// returned path is reused below to build the redirect URL (which is anchored to
// `/app` by the file router); only the filesystem existence check is resolved
// under `APP_ROOT`, since `bundler.fs` is rooted at `/`.
const candidates = [
  '/src/App.tsx',
  '/src/App.ts',
  '/src/App.js',
  '/App.tsx',
  '/App.ts',
  '/App.js',
  '/README.md',
  '/README.mdx',
  '/README.html',
];

// R3-278: the existence probe goes through the SDK's OWN fs surface (`sandboxFs`),
// not the injected bundler — this was the last direct `bundler.*` read on a
// PUBLIC component, and the one with no fallback: with no injected bundler
// (npm-fetched SDK, `vite dev`, pre-boot) the old read THREW. Unavailable fs
// simply answers `false` for every candidate (the "no main content file" path),
// so the component degrades instead of crashing — the regression case this
// item exists to close.
const fileExists = async (path: string): Promise<[string, boolean]> => {
  const fs = sandboxFs();
  if (!fs) return [path, false];
  const absolute = underAppRoot(path);
  try {
    // stat when the port has it, else readFile (dirs reject with EISDIR → false).
    const stat = (fs.promises as { stat?: Function } | undefined)?.stat ?? (fs as { stat?: Function }).stat;
    if (typeof stat === 'function') {
      await stat.call(fs.promises ?? fs, absolute);
      return [path, true];
    }
    const holder = fs.promises ?? (fs as { readFile: NonNullable<SandboxFsPort['readFile']> });
    await holder.readFile(absolute);
    return [path, true];
  } catch {
    return [path, false];
  }
};

export const MainContentRedirect = ({ filename }: { filename: string }) => {
  const url = useTinkerableLink(filename);
  navigate(url);
  return <>Redirecting to {filename}</>;
};

export const MainContentInner = ({
  candidatesExistPromise,
}: {
  candidatesExistPromise: Promise<[string, boolean][]>;
}) => {
  const candidatesExist = use(candidatesExistPromise);
  const filename = candidatesExist.find(([_, exists]) => exists)?.[0];
  if (!filename) {
    // todo: show file list
    throw new Error(`No main content file present`);
  }
  return <MainContentRedirect filename={FILES_PREFIX + filename} />;
};

export const MainContent = ({
  LoadingComponent = defaultLoadingComponent,
  ErrorComponent = defaultErrorComponent,
}: {
  LoadingComponent?: typeof defaultLoadingComponent;
  ErrorComponent?: typeof defaultErrorComponent;
} = {}) => {
  // TODO: when to invalidate?
  const candidatesExistPromise = useMemo(() => Promise.all(candidates.map(fileExists)), []);
  return (
    <ErrorBoundary fallbackRender={ErrorComponent}>
      <Suspense fallback={<LoadingComponent />}>
        <MainContentInner candidatesExistPromise={candidatesExistPromise} />
      </Suspense>
    </ErrorBoundary>
  );
};
