// The I/O half of the author token file (MARKDOWN_SYNTAX_SPEC §16.6): read the file the
// lookup resolves for a routed Markdown file, and re-read it when the file, or a marker on
// the walked path, changes. The parse and the lookup are pure, in `proseTokens.ts`.

import { useEffect, useState } from 'react';

import { openAppFs, type MountFs } from './fs';
import {
  affectsTokenLookup,
  dirOfFile,
  parseProseTokenFile,
  PROSE_TOKEN_FILE_MAX_BYTES,
  resolveTokenFile,
  type ProseTokenBlocks,
  type ProseTokenProbe,
} from './proseTokens';

const warn = (message: string): void => {
  console.warn(`[immediately.run] ${message}`);
};

/** A missing file, a directory, or no sandbox fs at all are each "no file here". */
const probeOf = (fs: MountFs): ProseTokenProbe => ({
  async size(path) {
    try {
      const stat = await fs.stat(path);
      return stat.kind === 'file' ? stat.size : null;
    } catch {
      return null;
    }
  },
  async read(path) {
    try {
      return await fs.readFile(path, 'utf8');
    } catch {
      return null;
    }
  },
});

interface Loaded {
  readonly blocks: ProseTokenBlocks | null;
  /** The token file the lookup resolved, watched for changes. */
  readonly path: string | null;
}

/** Resolve, size-check, read and parse. Every refusal warns and yields no tokens. */
async function loadTokens(fs: MountFs, startDir: string): Promise<Loaded> {
  const resolved = await resolveTokenFile(startDir, probeOf(fs));
  resolved.warnings.forEach(warn);
  const { path, size } = resolved;
  if (path === null) return { blocks: null, path: null };
  if (size !== null && size > PROSE_TOKEN_FILE_MAX_BYTES) {
    warn(`${path} is larger than ${PROSE_TOKEN_FILE_MAX_BYTES} bytes; author tokens are off`);
    return { blocks: null, path };
  }
  const text = await probeOf(fs).read(path);
  if (text === null) return { blocks: null, path };
  const parsed = parseProseTokenFile(text);
  if (!parsed.ok) {
    warn(`${path} is refused because ${parsed.reason}; author tokens are off`);
    return { blocks: null, path };
  }
  parsed.warnings.forEach((w) => warn(`${path}: ${w}`));
  return { blocks: parsed.blocks, path };
}

/**
 * The author token values for a routed Markdown file (repo-relative path), or `null` while
 * none apply or before the first read settles — the page renders with the defaults
 * meanwhile and is never suspended on the token file. `undefined` reads nothing.
 */
export function useProseTokens(filename: string | undefined): ProseTokenBlocks | null {
  const startDir = filename === undefined ? null : dirOfFile(filename);
  const [change, setChange] = useState(0);
  const [loaded, setLoaded] = useState<Loaded & { key: string | null }>({ blocks: null, path: null, key: null });

  // One read per (directory, change). A result that lands after unmount, or after a newer
  // read has started, is dropped.
  useEffect(() => {
    if (startDir === null) return;
    let live = true;
    loadTokens(openAppFs(), startDir).then(
      (result) => {
        if (live) setLoaded({ ...result, key: startDir });
      },
      (error: unknown) => {
        if (live) warn(`the prose token file could not be read: ${String(error)}`);
      },
    );
    return () => {
      live = false;
    };
  }, [startDir, change]);

  const watchedPath = loaded.key === startDir ? loaded.path : null;
  useEffect(() => {
    if (startDir === null) return;
    return openAppFs().onChange((paths) => {
      if (paths.some((p) => affectsTokenLookup(p, startDir, watchedPath))) setChange((n) => n + 1);
    });
  }, [startDir, watchedPath]);

  return loaded.key === startDir ? loaded.blocks : null;
}
