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

/**
 * "No file here" is a missing path, a directory, or no sandbox fs at all. Any other error
 * (a failed read, a permission error) is not an absence: it propagates with the path named,
 * and the hook warns rather than quietly dropping a marker's boundary or a token file.
 */
const isAbsent = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'not-found' || code === 'unavailable';
};

const failed = (path: string, error: unknown): Error =>
  new Error(`${path} could not be read (${(error as { code?: unknown } | null)?.code ?? String(error)})`);

const probeOf = (fs: MountFs): ProseTokenProbe => ({
  async size(path) {
    try {
      const stat = await fs.stat(path);
      return stat.kind === 'file' ? stat.size : null;
    } catch (error) {
      if (isAbsent(error)) return null;
      throw failed(path, error);
    }
  },
  async read(path) {
    try {
      return await fs.readFile(path, 'utf8');
    } catch (error) {
      if (isAbsent(error)) return null;
      throw failed(path, error);
    }
  },
});

interface Loaded {
  readonly blocks: ProseTokenBlocks | null;
  /** The token file to re-run the lookup for when it changes (`ResolvedTokenFile.watch`). */
  readonly watch: string | null;
}

/** Resolve, size-check, read and parse. Every refusal warns and yields no tokens. */
async function loadTokens(fs: MountFs, startDir: string): Promise<Loaded> {
  const resolved = await resolveTokenFile(startDir, probeOf(fs));
  resolved.warnings.forEach(warn);
  const { path, size, watch } = resolved;
  if (path === null) return { blocks: null, watch };
  if (size !== null && size > PROSE_TOKEN_FILE_MAX_BYTES) {
    warn(`${path} is larger than ${PROSE_TOKEN_FILE_MAX_BYTES} bytes; author tokens are off`);
    return { blocks: null, watch };
  }
  let text: string | null;
  try {
    text = await probeOf(fs).read(path);
  } catch (error) {
    // Keep the watch: fixing the file must restyle the page, even a `styles`-named one.
    warn(`${error instanceof Error ? error.message : String(error)}; author tokens are off`);
    return { blocks: null, watch };
  }
  if (text === null) {
    // Present at the lookup, gone at the read: a delete raced it, and its change re-runs us.
    warn(`${path} disappeared while it was being read; author tokens are off`);
    return { blocks: null, watch };
  }
  const parsed = parseProseTokenFile(text);
  if (!parsed.ok) {
    warn(`${path} is refused because ${parsed.reason}; author tokens are off`);
    return { blocks: null, watch };
  }
  parsed.warnings.forEach((w) => warn(`${path}: ${w}`));
  return { blocks: parsed.blocks, watch };
}

/**
 * The author token values for a routed Markdown file (repo-relative path), or `null` while
 * none apply or before the first read settles — the page renders with the defaults
 * meanwhile and is never suspended on the token file. `undefined` reads nothing.
 */
export function useProseTokens(filename: string | undefined): ProseTokenBlocks | null {
  const startDir = filename === undefined ? null : dirOfFile(filename);
  const [change, setChange] = useState(0);
  const [loaded, setLoaded] = useState<Loaded & { key: string | null }>({ blocks: null, watch: null, key: null });

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
        if (!live) return;
        warn(`${error instanceof Error ? error.message : String(error)}; author tokens are off`);
        setLoaded({ blocks: null, watch: null, key: startDir });
      },
    );
    return () => {
      live = false;
    };
  }, [startDir, change]);

  const watchedPath = loaded.key === startDir ? loaded.watch : null;
  useEffect(() => {
    if (startDir === null) return;
    return openAppFs().onChange((paths) => {
      if (paths.some((p) => affectsTokenLookup(p, startDir, watchedPath))) setChange((n) => n + 1);
    });
  }, [startDir, watchedPath]);

  return loaded.key === startDir ? loaded.blocks : null;
}
