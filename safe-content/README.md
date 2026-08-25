# @immediately-run/safe-content

The immediately.run **safe renderer**: untrusted Markdown/MDX-syntax content rendered
as **data**, with no evaluator anywhere in the pipeline (TRUST_MODES_SPEC §5.1).

- `parseSafeMdast` — MDX-syntax → mdast using the micromark/mdast tree with **no
  acorn**: expression nodes carry their source as inert strings, never evaluated.
- `renderMdast` — mdast → React elements. JSX tags resolve **only** through a
  component registry by name, with literal string props only; unknown tags render
  their children inert; URLs pass an allowlist; wiki-links resolve through the
  shared link-space resolver (`@immediately-run/mdx-plugins`).
- `SafeContent` — the React component wiring the two.

This is the S3 content-framework tier's first extraction from `@immediately-run/sdk`
(PLATFORM_LAYERING_SPEC §4, R3-279). The SDK re-exports everything byte-compatibly
(`@immediately-run/sdk/safeContent/*` keeps working); depend on this package directly
only when you want the renderer without the platform client.

`@immediately-run/mdx-plugins` is a deliberate dependency (the anti-drift coupling):
the compiled and interpreted paths share one grammar, so a wiki-link or heading anchor
means the same byte on both sides.

**A T2 tool, not a platform gate:** it stops content executing as code; it certifies
nothing to the host.
