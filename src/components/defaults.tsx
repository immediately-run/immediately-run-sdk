import { ErrorBoundaryPropsWithRender } from 'react-error-boundary';
import { Spinner } from '../loading';

/**
 * Default Suspense fallback for the SDK content loaders (Include / FileRouter /
 * MainContent).
 *
 * It used to be bare `<>loading...</>` text, which React paints unstyled in the
 * top-left on the iframe's white canvas — reading as a "white flash with loading…"
 * between the host's skeleton and the app (LOADING_UX_SPEC §9 / I3). Instead, a
 * calm, centred indicator: `Spinner` renders **nothing** for the first ~150ms (the
 * §6.2 spinner floor), so a fast wait shows no flash at all; a longer wait gets a
 * subtle centred spinner that inherits the app's own text colour. The host themes
 * the iframe canvas behind it (sandbox `themeCanvas.ts`), so there is no white.
 */
export const defaultLoadingComponent = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      minHeight: 48,
    }}
  >
    <Spinner />
  </div>
);

export const defaultErrorComponent:ErrorBoundaryPropsWithRender["fallbackRender"] = ({error}) => <>ERROR {String(error)}</>;
