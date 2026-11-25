// The author token file for rendered Markdown (MARKDOWN_SYNTAX_SPEC §16.6).
//
// A repo or bundle restyles its Markdown with a token-only stylesheet. It is never
// injected as CSS: it is parsed here into an allow-listed map of public token values,
// and `Prose` applies each one with `style.setProperty` on its own element. A value
// passed to `setProperty` cannot leave its declaration, and with no author selector
// there is no attribute-selector oracle over other writers' files (Grove plans 05 §2.2).
//
// Pure logic only — the file I/O and the change subscription are `proseTokensHook.ts`.

import { PROSE_TOKENS } from './proseStyles';

/** The default token file's name. The one place this name is spelled. */
export const PROSE_TOKEN_FILE = 'immediately.run.css';

/** The bundle marker that may carry a `styles` field naming another token file. */
export const PROSE_MARKER_FILE = 'immediately.run.json';

/** A token file larger than this is refused unread: it sits on the first-paint path. */
export const PROSE_TOKEN_FILE_MAX_BYTES = 16384;

/** A single value longer than this is dropped. */
export const PROSE_TOKEN_VALUE_MAX_LENGTH = 256;

/** The polarity the host theme reports, and the block that applies to it. */
export type ProsePolarity = 'light' | 'dark';

/** Values per block, keyed by the public custom property (`--ink`). */
export interface ProseTokenBlocks {
  readonly root: Readonly<Record<string, string>>;
  readonly light: Readonly<Record<string, string>>;
  readonly dark: Readonly<Record<string, string>>;
}

/** The outcome of parsing a token file. `warnings` name every dropped declaration. */
export type ParsedProseTokenFile =
  | { readonly ok: true; readonly blocks: ProseTokenBlocks; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly reason: string };

const ALLOWED = new Set(PROSE_TOKENS.map((token) => `--${token.name}`));

/**
 * Value fragments that are dropped, case-insensitively. Each one can fetch a resource
 * (`url(` and the image functions), smuggle one in (`\` escapes spell `url(` without its
 * letters, `@` starts an at-rule), or break out of a declaration in a context that
 * re-serialises it (`;`, braces, angle brackets).
 */
const REFUSED_VALUE_FRAGMENTS = [
  'url(',
  'image(',
  'image-set(',
  'cross-fade(',
  'element(',
  'src(',
  '@',
  '\\',
  ';',
  '{',
  '}',
  '<',
  '>',
] as const;

const SELECTORS: Record<string, keyof ProseTokenBlocks> = {
  ':root': 'root',
  ':root[data-theme="light"]': 'light',
  ':root[data-theme="dark"]': 'dark',
};

/** The block a selector names, or `null`. Either quote style; whitespace is not significant. */
const blockFor = (selector: string): keyof ProseTokenBlocks | null =>
  SELECTORS[selector.replace(/\s+/g, '').replace(/'/g, '"')] ?? null;

const refusedFragment = (value: string): string | undefined => {
  const lower = value.toLowerCase();
  return REFUSED_VALUE_FRAGMENTS.find((fragment) => lower.includes(fragment));
};

const byteLength = (text: string): number => new TextEncoder().encode(text).length;

interface RawBlock {
  selector: string;
  declarations: string[];
}

/**
 * Split the text into `selector { decl; decl }` blocks. Quote-aware (a `;` or `}` inside
 * a string stays in its value, where the value check drops it) and comment-stripping.
 * Returns a reason string for anything that is not a flat sequence of blocks: a nested
 * brace, a statement outside a block (`@import …;`), an unterminated string or comment.
 */
const splitBlocks = (text: string): RawBlock[] | string => {
  const blocks: RawBlock[] = [];
  let buffer = '';
  let current: RawBlock | null = null;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) return 'an unterminated comment';
      i = end + 2;
      buffer += ' ';
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) {
        if (text[j] === '\\') j += 1;
        if (text[j] === '\n') return 'an unterminated string';
        j += 1;
      }
      if (j >= text.length) return 'an unterminated string';
      buffer += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === '{') {
      if (current) return 'a nested block';
      current = { selector: buffer.trim(), declarations: [] };
      buffer = '';
    } else if (ch === '}') {
      if (!current) return 'an unmatched "}"';
      if (buffer.trim()) current.declarations.push(buffer.trim());
      blocks.push(current);
      current = null;
      buffer = '';
    } else if (ch === ';' && current) {
      if (buffer.trim()) current.declarations.push(buffer.trim());
      buffer = '';
    } else {
      buffer += ch;
    }
    i += 1;
  }
  if (current) return 'an unclosed block';
  if (buffer.trim()) return `"${buffer.trim().slice(0, 40)}" outside a block`;
  return blocks;
};

/**
 * Parse a token file. All-or-nothing per file for its SHAPE (Grove plans 05 §3, the rule
 * Grove's check-theme-token-only script enforces): any at-rule, any selector but the
 * three token blocks, or any property that is not a custom property refuses the whole file.
 * Per declaration for its CONTENT: an unknown token name or a refused value is dropped with
 * a warning and the rest of the file applies.
 */
export function parseProseTokenFile(text: string): ParsedProseTokenFile {
  if (byteLength(text) > PROSE_TOKEN_FILE_MAX_BYTES) {
    return { ok: false, reason: `it is larger than ${PROSE_TOKEN_FILE_MAX_BYTES} bytes` };
  }
  const split = splitBlocks(text);
  if (typeof split === 'string') return { ok: false, reason: `it contains ${split}` };

  const blocks = { root: {}, light: {}, dark: {} } as Record<keyof ProseTokenBlocks, Record<string, string>>;
  const warnings: string[] = [];
  for (const { selector, declarations } of split) {
    const block = blockFor(selector);
    if (!block) {
      return {
        ok: false,
        reason: `"${selector.slice(0, 60)}" is not one of :root, :root[data-theme="light"], :root[data-theme="dark"]`,
      };
    }
    for (const declaration of declarations) {
      const match = /^(--[A-Za-z0-9_-]+)\s*:([\s\S]*)$/.exec(declaration);
      if (!match) {
        return { ok: false, reason: `"${declaration.slice(0, 60)}" is not a custom property declaration` };
      }
      const name = match[1];
      const value = match[2].trim();
      if (!ALLOWED.has(name)) {
        warnings.push(`${name} is not a prose token; ignored`);
        continue;
      }
      if (!value) {
        warnings.push(`${name} has an empty value; ignored`);
        continue;
      }
      if (value.length > PROSE_TOKEN_VALUE_MAX_LENGTH) {
        warnings.push(`${name} is longer than ${PROSE_TOKEN_VALUE_MAX_LENGTH} characters; ignored`);
        continue;
      }
      const fragment = refusedFragment(value);
      if (fragment) {
        warnings.push(`${name} contains "${fragment}"; ignored`);
        continue;
      }
      blocks[block][name] = value;
    }
  }
  return { ok: true, blocks, warnings };
}

/**
 * The values to set for one polarity, in application order: `:root` first, then the
 * polarity block, so a polarity value wins over the shared one.
 */
export function tokensFor(blocks: ProseTokenBlocks, polarity: ProsePolarity): [string, string][] {
  return Object.entries({ ...blocks.root, ...blocks[polarity] });
}

/**
 * Reads the lookup needs, injected so the walk is tested without a filesystem. Paths are
 * repo-relative with no leading slash (`''` is the repo root).
 * - `size`: the byte size of a regular file, or `null` when there is none;
 * - `read`: a file's UTF-8 text, or `null` when there is none.
 */
export interface ProseTokenProbe {
  size(path: string): Promise<number | null>;
  read(path: string): Promise<string | null>;
}

/** Where the walk landed: the token file to read (or none), and what to warn about. */
export interface ResolvedTokenFile {
  /** The repo-relative token file, or `null` when no author tokens apply. */
  readonly path: string | null;
  /** Its size in bytes when `path` is set. */
  readonly size: number | null;
  /** The directory the walk stopped in (`''` is the repo root). */
  readonly dir: string;
  readonly warnings: readonly string[];
}

const join = (dir: string, name: string): string => (dir ? `${dir}/${name}` : name);

/** The parent of a repo-relative directory, or `null` above the repo root. */
const parentOf = (dir: string): string | null =>
  dir === '' ? null : dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';

/** The directory of a repo-relative file path. */
export const dirOfFile = (file: string): string => {
  const clean = file.replace(/^\/+/, '');
  return clean.includes('/') ? clean.slice(0, clean.lastIndexOf('/')) : '';
};

/**
 * A `styles` value normalised under `dir`, or a reason it is refused: it must be relative,
 * carry no scheme, and stay inside the marker's directory.
 */
const resolveStyles = (dir: string, styles: string): { path: string } | { reason: string } => {
  if (styles.startsWith('/')) return { reason: `"styles": "${styles}" is absolute` };
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(styles)) return { reason: `"styles": "${styles}" names a URL` };
  const parts: string[] = [];
  for (const segment of styles.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') return { reason: `"styles": "${styles}" leaves the directory of its marker` };
    parts.push(segment);
  }
  if (!parts.length) return { reason: `"styles": "${styles}" names no file` };
  return { path: join(dir, parts.join('/')) };
};

/**
 * Find the token file for Markdown in `startDir`. Walk up to the repo root and stop at the
 * first directory holding a marker or the default token file. There, a marker's `styles`
 * string names the file, `styles: false` turns author tokens off, and otherwise the default
 * file applies if it exists. Every refusal is a warning and leaves the defaults in place.
 */
export async function resolveTokenFile(startDir: string, probe: ProseTokenProbe): Promise<ResolvedTokenFile> {
  const warnings: string[] = [];
  for (let dir: string | null = startDir.replace(/^\/+|\/+$/g, ''); dir !== null; dir = parentOf(dir)) {
    const markerPath = join(dir, PROSE_MARKER_FILE);
    const defaultPath = join(dir, PROSE_TOKEN_FILE);
    const [markerText, defaultSize] = await Promise.all([probe.read(markerPath), probe.size(defaultPath)]);
    if (markerText === null && defaultSize === null) continue;

    let styles: unknown;
    if (markerText !== null) {
      try {
        const marker: unknown = JSON.parse(markerText);
        styles = marker && typeof marker === 'object' ? (marker as Record<string, unknown>).styles : undefined;
      } catch {
        warnings.push(`${markerPath} is not valid JSON; its "styles" field is ignored`);
      }
      if (styles !== undefined && styles !== false && typeof styles !== 'string') {
        warnings.push(`${markerPath}: "styles" must be a file name or false; ignored`);
        styles = undefined;
      }
    }
    if (styles === false) return { path: null, size: null, dir, warnings };
    if (typeof styles === 'string') {
      const resolved = resolveStyles(dir, styles);
      if ('reason' in resolved) {
        warnings.push(`${markerPath}: ${resolved.reason}; author tokens are off`);
        return { path: null, size: null, dir, warnings };
      }
      const size = await probe.size(resolved.path);
      if (size === null) warnings.push(`${markerPath}: "styles" names ${resolved.path}, which does not exist`);
      return { path: size === null ? null : resolved.path, size, dir, warnings };
    }
    return { path: defaultSize === null ? null : defaultPath, size: defaultSize, dir, warnings };
  }
  return { path: null, size: null, dir: '', warnings };
}

/**
 * Does a changed repo-relative path bear on the token lookup for `startDir`? True for the
 * resolved token file, and for any marker or default token file in a directory the walk
 * visits (one created or deleted there moves the lookup).
 */
export function affectsTokenLookup(changed: string, startDir: string, resolvedPath: string | null): boolean {
  const path = changed.replace(/^\/+/, '');
  if (resolvedPath !== null && path === resolvedPath) return true;
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (name !== PROSE_MARKER_FILE && name !== PROSE_TOKEN_FILE) return false;
  const dir = dirOfFile(path);
  const start = startDir.replace(/^\/+|\/+$/g, '');
  return dir === '' || start === dir || start.startsWith(`${dir}/`);
}
