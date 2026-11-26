import "./chunk-VHAA22YE.js";
import { ensureStyleElement } from "./styleElement.js";
const PROSE_CLASS = "ir-prose";
const PROSE_STYLE_ID = "ir-sdk-prose-styles";
const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
const same = (name, value) => ({ name, light: value, dark: value });
const PROSE_TOKENS = [
  same("bg", "transparent"),
  { name: "ink", light: "#1f2328", dark: "#d6dae0" },
  { name: "ink-2", light: "#59636e", dark: "#8b949e" },
  { name: "ink-3", light: "#8c959f", dark: "#6e7681" },
  { name: "line", light: "#d8dee4", dark: "#2a2f37" },
  { name: "panel", light: "#f3f4f6", dark: "#1a1e24" },
  { name: "accent", light: "#0969da", dark: "#6cb6ff" },
  same("sans", SANS),
  same("disp", "var(--sans, var(--_ir-sans))"),
  same("mono", MONO),
  same("disp-weight", "700"),
  same("prose-measure", "68ch"),
  same("prose-leading", "1.65"),
  same("page-gutter", "clamp(1.25rem, 5vw, 3rem)"),
  same("radius-shape", "8px"),
  same("prose-size", "1.0625rem"),
  same("prose-flow", "1.1em")
];
const t = (name) => `var(--${name}, var(--_ir-${name}))`;
const declarations = (pick, only) => PROSE_TOKENS.filter(only ?? (() => true)).map((token) => `--_ir-${token.name}: ${pick(token)};`).join(" ");
const P = `.${PROSE_CLASS}`;
const GUTTER_ANCHOR_MIN_WIDTH = "48rem";
const HEADINGS = ":is(h1, h2, h3, h4, h5, h6)";
const PROSE_STYLE_TEXT = `@layer ir.defaults {
${P} { ${declarations((token) => token.light)} }
${P}[data-theme="dark"] { ${declarations(
  (token) => token.dark,
  (token) => token.dark !== token.light
)} }
${P} {
  box-sizing: border-box;
  min-height: 100dvh;
  background: ${t("bg")};
  color: ${t("ink")};
  font: 400 ${t("prose-size")} / ${t("prose-leading")} ${t("sans")};
  font-kerning: normal;
  -webkit-font-smoothing: antialiased;
  overflow-wrap: break-word;
  padding-block: clamp(1.5rem, 6vw, 4rem) 6rem;
  display: grid;
  align-content: start;
  grid-template-columns:
    minmax(${t("page-gutter")}, 1fr)
    min(${t("prose-measure")}, 100% - 2 * ${t("page-gutter")})
    minmax(${t("page-gutter")}, 1fr);
}
${P} > * { grid-column: 2; min-inline-size: 0; margin-block: 0; }
${P} > * + * { margin-block-start: ${t("prose-flow")}; }

${P} ${HEADINGS} {
  position: relative;
  font-family: ${t("disp")};
  font-weight: ${t("disp-weight")};
  color: ${t("ink")};
  line-height: 1.25;
  letter-spacing: -0.011em;
  text-wrap: balance;
  scroll-margin-top: 1.5rem;
}
${P} h1 { font-size: 2.25em; letter-spacing: -0.022em; line-height: 1.15; }
${P} h2 { font-size: 1.5em; padding-block-end: 0.3em; border-block-end: 1px solid ${t("line")}; }
${P} h3 { font-size: 1.2em; }
${P} h4 { font-size: 1em; }
${P} :is(h5, h6) { font-size: 0.875em; text-transform: uppercase; letter-spacing: 0.04em; color: ${t("ink-2")}; }
${P} > ${HEADINGS}:not(:first-child) { margin-block-start: 2.2em; }
${P} > :is(h1, h2, h3, h4) + * { margin-block-start: 0.7em; }

${P} .ir-heading-anchor { color: ${t("ink-3")}; text-decoration: none; font-weight: 400; }
${P} .ir-heading-anchor:hover { color: ${t("accent")}; }
@media (hover: hover) and (width >= ${GUTTER_ANCHOR_MIN_WIDTH}) {
  ${P} .ir-heading-anchor {
    position: absolute;
    inset-inline-end: 100%;
    inline-size: 1.2em;
    padding-inline-end: 0.35em;
    text-align: end;
    opacity: 0;
    transition: opacity 120ms ease;
  }
  ${P} ${HEADINGS}:hover .ir-heading-anchor,
  ${P} .ir-heading-anchor:focus-visible { opacity: 1; }
}
@media (hover: none), (width < ${GUTTER_ANCHOR_MIN_WIDTH}) {
  ${P} .ir-heading-anchor {
    float: inline-end;
    min-inline-size: 24px;
    min-block-size: 24px;
    margin-inline-start: 0.5em;
    text-align: center;
    font-size: 0.8em;
    opacity: 0.45;
  }
}

${P} a { color: ${t(
  "accent"
)}; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.18em; }
${P} strong { font-weight: 650; }
${P} :not(pre) > code {
  font-family: ${t("mono")};
  font-size: 0.86em;
  background: ${t("panel")};
  padding: 0.12em 0.36em;
  border-radius: 5px;
}
${P} a code { color: inherit; }
${P} pre {
  font-family: ${t("mono")};
  font-size: 0.85em;
  line-height: 1.55;
  background: ${t("panel")};
  padding: 1em 1.2em;
  border-radius: ${t("radius-shape")};
  overflow-x: auto;
  tab-size: 2;
}
${P} pre code { font: inherit; background: none; padding: 0; }
${P} :is(ul, ol) { padding-inline-start: 1.5em; }
${P} li + li, ${P} li > :is(ul, ol) { margin-block-start: 0.35em; }
${P} li::marker { color: ${t("ink-2")}; }
${P} li.task-list-item { list-style: none; margin-inline-start: -1.3em; }
${P} input[type="checkbox"] { margin-inline-end: 0.5em; accent-color: ${t("accent")}; }
${P} blockquote { padding-inline-start: 1em; border-inline-start: 3px solid ${t("line")}; color: ${t("ink-2")}; }
${P} hr { border: 0; border-block-start: 1px solid ${t("line")}; }
${P} > hr, ${P} > hr + * { margin-block-start: calc(2.5 * ${t("prose-size")}); }
${P} > hr + ${HEADINGS}:not(:first-child) { margin-block-start: max(2.2em, 2.5 * ${t("prose-size")}); }
${P} :is(img, video) { max-width: 100%; height: auto; border-radius: ${t("radius-shape")}; }
${P} table { display: block; overflow-x: auto; border-collapse: collapse; font-size: 0.94em; font-variant-numeric: tabular-nums; }
${P} :is(th, td) { padding: 0.45em 0.8em; border: 1px solid ${t("line")}; text-align: start; }
${P} th { background: ${t("panel")}; }
}
`;
const isProseFile = (path) => /\.mdx?$/i.test(path);
function ensureProseStyles() {
  ensureStyleElement(PROSE_STYLE_ID, PROSE_STYLE_TEXT, { first: true });
}
export {
  PROSE_CLASS,
  PROSE_STYLE_ID,
  PROSE_STYLE_TEXT,
  PROSE_TOKENS,
  ensureProseStyles,
  isProseFile
};
//# sourceMappingURL=proseStyles.js.map