import { RefObject } from 'react';

interface ScrollRestorationProps {
    /** The element that scrolls. Omit when the document scrolls. */
    scroller?: RefObject<HTMLElement | null>;
}
/**
 * Null-rendering. Remembers the scroller's offset on the entry being left, and
 * restores it when the reader returns to that entry.
 */
declare const ScrollRestoration: ({ scroller }?: ScrollRestorationProps) => null;

export { ScrollRestoration, type ScrollRestorationProps };
