import "./chunk-VHAA22YE.js";
const escapeForRegexp = (str) => str.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&");
const WILDCARD_GROUP = "wild";
const compileTemplate = (template) => {
  const token = /(:[A-Za-z_][A-Za-z0-9_]*)|\*/g;
  let src = "";
  let last = 0;
  let m;
  while ((m = token.exec(template)) !== null) {
    src += escapeForRegexp(template.slice(last, m.index));
    src += m[1] ? `(?<${m[1].slice(1)}>[^/]+)` : `(?<${WILDCARD_GROUP}>.*)`;
    last = m.index + m[0].length;
  }
  src += escapeForRegexp(template.slice(last));
  return new RegExp(`^${src}$`);
};
const templateCache = /* @__PURE__ */ new Map();
const toRegExp = (pattern) => {
  if (pattern instanceof RegExp) {
    return pattern;
  }
  let compiled = templateCache.get(pattern);
  if (!compiled) {
    compiled = compileTemplate(pattern);
    templateCache.set(pattern, compiled);
  }
  return compiled;
};
const matchRoute = (pattern, path) => {
  const match = path.match(toRegExp(pattern));
  if (!match) {
    return null;
  }
  const params = {};
  for (const [key, value] of Object.entries(match.groups ?? {})) {
    if (value !== void 0) {
      params[key === WILDCARD_GROUP ? "*" : key] = value;
    }
  }
  return params;
};
export {
  compileTemplate,
  matchRoute,
  toRegExp
};
//# sourceMappingURL=routeMatch.js.map