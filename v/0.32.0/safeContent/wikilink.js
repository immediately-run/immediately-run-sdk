const WIKILINK = /\[\[([^[\]]+)\]\]/g;
function parseWikiInner(inner) {
  const pipe = inner.indexOf("|");
  let target;
  let label;
  if (pipe === -1) {
    target = inner.trim();
  } else {
    label = inner.slice(0, pipe).trim();
    target = inner.slice(pipe + 1).trim();
  }
  if (target === "") return null;
  return label ? { target, label } : { target };
}
function splitWikiLinks(value) {
  if (value.indexOf("[[") === -1) return null;
  const out = [];
  let lastIndex = 0;
  let produced = false;
  WIKILINK.lastIndex = 0;
  let match;
  while ((match = WIKILINK.exec(value)) !== null) {
    const token = parseWikiInner(match[1]);
    if (!token) continue;
    if (match.index > lastIndex) out.push({ text: value.slice(lastIndex, match.index) });
    out.push({ wiki: token });
    lastIndex = match.index + match[0].length;
    produced = true;
  }
  if (!produced) return null;
  if (lastIndex < value.length) out.push({ text: value.slice(lastIndex) });
  return out;
}
export {
  parseWikiInner,
  splitWikiLinks
};
//# sourceMappingURL=wikilink.js.map