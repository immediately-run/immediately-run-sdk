import * as react from 'react';
import { AnchorHTMLAttributes, ReactNode } from 'react';

/**
 * Build a PLATFORM-space href (`/present/…`, `/edit/github/…`, `/home`) in the host's URL
 * space, reading `outerHref` from {@link TinkerableContext} the way `useTinkerableLink` does.
 * The returned closure is fresh each render (its output is pure, so identity churn is
 * harmless); an empty context (no host, `vite dev`) yields the path unchanged.
 *
 * Prefer {@link PlatformLink} over calling this directly. An href alone does not reach a
 * platform route from inside the app frame (see that component), so a consumer that renders
 * its own anchor from this string must ask the host itself — otherwise it ships a link that
 * copies and opens-in-new-tab correctly and does nothing at all on a plain click. It is kept
 * exported because the wire and the module surface are additive-only
 * (`SDK_PACKAGING_SPEC` §9): an app pinned to an older SDK may already import it.
 */
declare const usePlatformHref: () => ((path: string) => string);
interface PlatformLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
    /** A root-relative platform path, e.g. `/present/github/acme/todo`. */
    path: string;
    children?: ReactNode;
}
/**
 * The ONE way to render an anchor to a PLATFORM route.
 *
 * It builds the href with {@link platformHref} (resolving against the host's outer origin)
 * and, on a plain left-click, asks the HOST to perform the navigation.
 *
 * **Why the anchor alone does not work (R3-568).** Until R3-568 this component relied solely
 * on `target="_top"`. The app frame's sandbox omits `allow-top-navigation-by-user-activation`
 * deliberately — an app that can move the top-level window on its own schedule is a phishing
 * primitive — so the browser refuses outright and logs *"Unsafe attempt to initiate
 * navigation…"*. Every platform link in every app was inert on the host: measured on
 * production, no Open, no Fork, no Run, and no way to sign in.
 *
 * The host is therefore the only thing that can perform this navigation, and it is asked the
 * same way in-app routing asks — {@link navigate}. The host decides: it accepts a target
 * outside the app's own path prefix only when the target is same-origin, is a recognised
 * platform route, and the HOST's own `navigator.userActivation` says a person just acted.
 * Nothing the app asserts substitutes for that gesture, and a refusal is the host's to report.
 *
 * **The `href` and `target` stay.** They are what make copy-link, middle-click and
 * open-in-new-tab produce something that resolves for another reader — gestures the sandbox
 * does allow (`allow-popups`), which the handler below deliberately declines to intercept.
 * The href is also the correct behaviour with no host at all (`vite dev`), where there is
 * nobody to ask.
 *
 * External URLs (`https://…`) are not platform routes and should stay plain
 * `<a target="_blank">` anchors.
 */
declare function PlatformLink({ path, children, onClick, target, ...rest }: PlatformLinkProps): react.JSX.Element;

export { PlatformLink, type PlatformLinkProps, usePlatformHref };
