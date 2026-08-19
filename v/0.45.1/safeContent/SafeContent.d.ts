import { ReactNode } from 'react';
import { RenderMdastOptions } from './renderMdast.js';
import './parseSafeMdast.js';

interface SafeContentProps extends RenderMdastOptions {
    /** The untrusted Markdown/MDX-syntax source to render as data. */
    source: string;
    /** Rendered while the async parse is in flight (default: nothing). */
    fallback?: ReactNode;
}
declare function SafeContent({ source, fallback, ...options }: SafeContentProps): ReactNode;

export { SafeContent, type SafeContentProps };
