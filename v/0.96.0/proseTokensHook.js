import "./chunk-VHAA22YE.js";
import { useEffect, useState } from "react";
import { openAppFs } from "./fs.js";
import {
  affectsTokenLookup,
  dirOfFile,
  parseProseTokenFile,
  PROSE_TOKEN_FILE_MAX_BYTES,
  resolveTokenFile
} from "./proseTokens.js";
const warn = (message) => {
  console.warn(`[immediately.run] ${message}`);
};
const isAbsent = (error) => {
  const code = error?.code;
  return code === "not-found" || code === "unavailable";
};
const failed = (path, error) => new Error(`${path} could not be read (${error?.code ?? String(error)})`);
const probeOf = (fs) => ({
  async size(path) {
    try {
      const stat = await fs.stat(path);
      return stat.kind === "file" ? stat.size : null;
    } catch (error) {
      if (isAbsent(error)) return null;
      throw failed(path, error);
    }
  },
  async read(path) {
    try {
      return await fs.readFile(path, "utf8");
    } catch (error) {
      if (isAbsent(error)) return null;
      throw failed(path, error);
    }
  }
});
async function loadTokens(fs, startDir) {
  const resolved = await resolveTokenFile(startDir, probeOf(fs));
  resolved.warnings.forEach(warn);
  const { path, size, watch } = resolved;
  if (path === null) return { blocks: null, watch };
  if (size !== null && size > PROSE_TOKEN_FILE_MAX_BYTES) {
    warn(`${path} is larger than ${PROSE_TOKEN_FILE_MAX_BYTES} bytes; author tokens are off`);
    return { blocks: null, watch };
  }
  let text;
  try {
    text = await probeOf(fs).read(path);
  } catch (error) {
    warn(`${error instanceof Error ? error.message : String(error)}; author tokens are off`);
    return { blocks: null, watch };
  }
  if (text === null) {
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
function useProseTokens(filename) {
  const startDir = filename === void 0 ? null : dirOfFile(filename);
  const [change, setChange] = useState(0);
  const [loaded, setLoaded] = useState({ blocks: null, watch: null, key: null });
  useEffect(() => {
    if (startDir === null) return;
    let live = true;
    loadTokens(openAppFs(), startDir).then(
      (result) => {
        if (live) setLoaded({ ...result, key: startDir });
      },
      (error) => {
        if (!live) return;
        warn(`${error instanceof Error ? error.message : String(error)}; author tokens are off`);
        setLoaded({ blocks: null, watch: null, key: startDir });
      }
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
export {
  useProseTokens
};
//# sourceMappingURL=proseTokensHook.js.map