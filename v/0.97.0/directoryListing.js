import "./chunk-VHAA22YE.js";
import { sandboxFs } from "./fs.js";
import { underAppRoot } from "./urlUtils.js";
const README_NAMES = ["README.md", "README.mdx", "readme.md", "index.md", "index.mdx"];
const toDirPath = (repoPath) => {
  const trimmed = repoPath.replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
};
const namesDirectory = (repoPath) => repoPath === "" || repoPath.endsWith("/");
const fsPromises = () => {
  const fs = sandboxFs();
  return fs?.promises ?? null;
};
const isDirectoryPath = async (repoPath) => {
  const promises = fsPromises();
  if (!promises) return false;
  try {
    const st = await promises.stat(underAppRoot(repoPath.replace(/^\/+/, "")));
    return typeof st?.isDirectory === "function" ? Boolean(st.isDirectory()) : false;
  } catch {
    return false;
  }
};
const sortEntries = (entries) => [...entries].sort(
  (a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name, void 0, { sensitivity: "base" }) || a.name.localeCompare(b.name)
);
const pickReadme = (entries) => {
  for (const name of README_NAMES) {
    const hit = entries.find((e) => !e.isDirectory && e.name === name);
    if (hit) return hit;
  }
  return null;
};
const readDirectoryListing = async (repoPath) => {
  const promises = fsPromises();
  if (!promises) throw new Error(`Cannot list ${repoPath || "/"}: the sandbox filesystem is unavailable`);
  const dir = toDirPath(repoPath);
  const raw = await promises.readdir(underAppRoot(dir.slice(1)), { withFileTypes: true });
  const entries = sortEntries(
    raw.map((d) => {
      const isDirectory = d.isDirectory();
      return { name: d.name, isDirectory, path: `${dir}${d.name}${isDirectory ? "/" : ""}` };
    })
  );
  const parent = dir === "/" ? null : toDirPath(dir.slice(0, -1).replace(/[^/]*$/, ""));
  return { dir, parent, entries, readme: pickReadme(entries)?.path ?? null };
};
export {
  isDirectoryPath,
  namesDirectory,
  pickReadme,
  readDirectoryListing,
  sortEntries,
  toDirPath
};
//# sourceMappingURL=directoryListing.js.map