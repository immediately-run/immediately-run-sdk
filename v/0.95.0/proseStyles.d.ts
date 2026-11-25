/** The class on the element that wraps rendered Markdown. */
declare const PROSE_CLASS = "ir-prose";
/** The id of the injected `<style>` element (one per document). */
declare const PROSE_STYLE_ID = "ir-sdk-prose-styles";
/** One public token: its name (no leading dashes) and its default per polarity. */
interface ProseToken {
    readonly name: string;
    readonly light: string;
    readonly dark: string;
}
/**
 * The token table — the one home of every name an author may set (the author token file
 * reads its allow-list from here). Names are Grove's wherever Grove has one with the same
 * meaning; `prose-size` and `prose-flow` are the only new ones.
 *
 * `bg` defaults to transparent because the sandbox already paints `<html>` per polarity
 * (sandbox `themeCanvas.ts`); repeating its colours here would be a second copy.
 */
declare const PROSE_TOKENS: readonly ProseToken[];
/** The whole default stylesheet. */
declare const PROSE_STYLE_TEXT: string;
/** Markdown and MDX files get the prose wrapper; app components and HTML do not. The
 *  extensions are the ones the transpiler compiles as MDX (`.md`, `.mdx`); a `.markdown`
 *  file is not compiled, so wrapping it would style nothing it renders. */
declare const isProseFile: (path: string) => boolean;
/**
 * Inject the default stylesheet once per document (idempotent, browser-only).
 *
 * It goes FIRST in `<head>`. Cascade layers rank by the order they first appear, later
 * layers winning, so a sheet appended after an app's own CSS would rank `ir.defaults`
 * above the app's layered rules (Tailwind's `base`/`components`/`utilities`, say).
 * First in the document makes it the lowest layer; unlayered rules beat it either way.
 */
declare function ensureProseStyles(): void;

export { PROSE_CLASS, PROSE_STYLE_ID, PROSE_STYLE_TEXT, PROSE_TOKENS, type ProseToken, ensureProseStyles, isProseFile };
