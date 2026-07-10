import { getAppMountPath } from "./mounts";
import { onFsChange } from "./onFsChange";
const hasFs = (fs) => typeof fs?.promises?.readFile === "function" || typeof fs?.readFile === "function";
function sandboxFs() {
  try {
    const shared = globalThis.__sandpackSharedFs;
    if (hasFs(shared)) return shared;
  } catch {
  }
  try {
    const layers = module?.evaluation?.module?.bundler?.fs?.layers;
    if (Array.isArray(layers)) {
      for (const layer of layers) {
        const fs = layer?.boundContext?.fs;
        if (hasFs(fs)) return fs;
      }
    }
  } catch {
  }
  return null;
}
function fsAvailable() {
  return sandboxFs() != null;
}
const ERRNO = {
  ENOENT: "not-found",
  EROFS: "read-only",
  EACCES: "not-permitted",
  EPERM: "not-permitted",
  EEXIST: "exists",
  ENOTEMPTY: "not-empty"
};
const fsError = (code, message) => {
  const err = new Error(message);
  err.code = code;
  return err;
};
const mapError = (e) => {
  const errno = e?.code;
  const code = (errno ? ERRNO[errno] : void 0) ?? "unknown";
  const err = new Error(e?.message ?? "fs operation failed");
  err.code = code;
  return err;
};
let _decoder;
let _encoder;
const decoder = () => _decoder ?? (_decoder = new TextDecoder());
const encoder = () => _encoder ?? (_encoder = new TextEncoder());
const MIME_BY_EXT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon"
};
function mimeTypeFor(path) {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return void 0;
  return MIME_BY_EXT[path.slice(dot + 1).toLowerCase()];
}
const resolveUnder = (root, relPath) => {
  if (relPath.startsWith("/")) {
    throw fsError("invalid-path", `expected a mount-relative path, got absolute "${relPath}"`);
  }
  const parts = [];
  for (const seg of relPath.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      throw fsError("invalid-path", `"${relPath}" escapes the mount root`);
    }
    parts.push(seg);
  }
  const base = root.endsWith("/") ? root.slice(0, -1) : root;
  return parts.length ? `${base}/${parts.join("/")}` : base;
};
const writableAt = (mount, relPath) => {
  const path = "/" + relPath.split("/").filter((s) => s && s !== ".").join("/");
  const rules = mount.rules;
  if (rules && rules.length) {
    let best;
    for (const r of rules) {
      const sub = r.subtree.endsWith("/") ? r.subtree : r.subtree + "/";
      if (path === r.subtree || path.startsWith(sub) || r.subtree === "/") {
        if (!best || r.subtree.length > best.subtree.length) best = r;
      }
    }
    if (best) return best.mode === "rw";
  }
  return (mount.mode ?? "rw") === "rw";
};
const promisesOf = (port) => port.promises ?? port;
function openFs(mount) {
  const root = mount.path;
  const port = () => {
    const p = sandboxFs();
    if (!p) throw fsError("unavailable", "immediately.run: sandbox filesystem unavailable");
    return promisesOf(p);
  };
  const api = {
    mount,
    async readFile(relPath, encoding) {
      const p = port();
      const abs = resolveUnder(root, relPath);
      try {
        const data = await p.readFile(abs);
        const bytes = typeof data === "string" ? encoder().encode(data) : data;
        return encoding === "utf8" ? decoder().decode(bytes) : bytes;
      } catch (e) {
        throw mapError(e);
      }
    },
    async readBlob(relPath, opts) {
      const bytes = await api.readFile(relPath);
      const type = opts?.type ?? mimeTypeFor(relPath) ?? "application/octet-stream";
      return new Blob([bytes], { type });
    },
    async readObjectUrl(relPath, opts) {
      const blob = await api.readBlob(relPath, opts);
      const url = URL.createObjectURL(blob);
      return { url, revoke: () => URL.revokeObjectURL(url) };
    },
    async writeFile(relPath, data) {
      const p = port();
      const abs = resolveUnder(root, relPath);
      try {
        await p.writeFile(abs, typeof data === "string" ? encoder().encode(data) : data);
      } catch (e) {
        throw mapError(e);
      }
    },
    async readdir(relPath = "") {
      const p = port();
      const abs = resolveUnder(root, relPath);
      try {
        const entries = await p.readdir(abs, { withFileTypes: true });
        return entries.map(
          (d) => typeof d === "string" ? { name: d, kind: "file" } : { name: d.name, kind: d.isDirectory?.() ? "dir" : "file" }
        );
      } catch (e) {
        throw mapError(e);
      }
    },
    async stat(relPath) {
      const p = port();
      const abs = resolveUnder(root, relPath);
      try {
        const s = await p.stat(abs);
        return {
          kind: s.isDirectory?.() ? "dir" : "file",
          size: typeof s.size === "number" ? s.size : 0,
          mtimeMs: typeof s.mtimeMs === "number" ? s.mtimeMs : void 0
        };
      } catch (e) {
        throw mapError(e);
      }
    },
    async exists(relPath) {
      try {
        await api.stat(relPath);
        return true;
      } catch (e) {
        if (e.code === "not-found") return false;
        if (e.code === "unavailable" || e.code === "invalid-path") {
          throw e;
        }
        return false;
      }
    },
    async mkdir(relPath, opts) {
      const p = port();
      const abs = resolveUnder(root, relPath);
      try {
        await p.mkdir(abs, { recursive: opts?.recursive ?? false });
      } catch (e) {
        throw mapError(e);
      }
    },
    async rm(relPath, opts) {
      const p = port();
      const abs = resolveUnder(root, relPath);
      try {
        await p.rm(abs, { recursive: opts?.recursive ?? false });
      } catch (e) {
        throw mapError(e);
      }
    },
    async rename(fromRel, toRel) {
      const p = port();
      const from = resolveUnder(root, fromRel);
      const to = resolveUnder(root, toRel);
      try {
        await p.rename(from, to);
      } catch (e) {
        throw mapError(e);
      }
    },
    canWrite(relPath = "") {
      return writableAt(mount, relPath);
    },
    onChange(cb) {
      if (root !== getAppMountPath()) {
        return () => {
        };
      }
      return onFsChange((change) => {
        if (change.paths.length === 0) return;
        cb(change.paths.map((p) => p.replace(/^\/+/, "")));
      });
    }
  };
  return api;
}
function openAppFs() {
  return openFs({ path: getAppMountPath(), type: "repo" });
}
export {
  fsAvailable,
  mimeTypeFor,
  openAppFs,
  openFs,
  sandboxFs
};
//# sourceMappingURL=fs.js.map