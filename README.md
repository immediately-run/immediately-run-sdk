# @tinkerable/sdk

Runtime SDK for code executing inside a [Tinkerable](https://tinkerable.site) sandbox.
It is the API that user code running in the sandboxed preview iframe imports to
query files by MDX frontmatter, dynamically `require` JS modules, navigate, and
hook into the Tinkerable runtime.

## Install

```sh
npm install @tinkerable/sdk
```

`react` and `react-dom` (v19+) are peer dependencies — the host app provides them.

## Top-level exports

The public surface is re-exported from the package root (`@tinkerable/sdk`) and
also reachable via subpaths (`@tinkerable/sdk/boot`, `@tinkerable/sdk/hooks`, …):

- `boot` — entry point that mounts a Tinkerable app into the sandbox.
- `Include` (`components/Include`) — render another file's exported component inline.
- `MDXComponents` (`Link`, …) — MDX component overrides.
- `useMetadataQuery`, `useFileMetadata` (`hooks`) — query files by frontmatter metadata.
- routing helpers (`Router`, `SandboxRouter`, …).
- `MDXProvider` — the MDX context provider used by transformed `.mdx` files.
- `sandboxTypes` — shared TypeScript types for the sandbox runtime.

## API documentation

Full API reference is published to GitHub Pages:
<https://tinkerable-site.github.io/tinkerable-sdk/>

## License

[MIT](./LICENSE)
