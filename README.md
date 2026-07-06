# @immediately-run/sdk

Runtime SDK for code executing inside an [immediately.run](https://immediately.run) sandbox.
It is the API that user code running in the sandboxed preview iframe imports to
query files by MDX frontmatter, dynamically `require` JS modules, navigate, and
hook into the immediately.run runtime.

## Install

```sh
npm install @immediately-run/sdk
```

`react` and `react-dom` (v19+) are peer dependencies — the host app provides them.

## Top-level exports

The public surface is re-exported from the package root (`@immediately-run/sdk`) and
also reachable via subpaths (`@immediately-run/sdk/boot`, `@immediately-run/sdk/hooks`, …):

- `boot` — entry point that mounts an immediately.run app into the sandbox.
- `Include` (`components/Include`) — render another file's exported component inline.
- `MDXComponents` (`Link`, …) — MDX component overrides.
- `useMetadataQuery`, `useFileMetadata`, `useAllMetadata` (`hooks`) — query files by
  MDX frontmatter metadata. `useMetadataQuery(fn)` runs a plain JS query and returns
  the matching `{ path, meta }` entries; `useFileMetadata(path)` reads one file's
  frontmatter; `useAllMetadata()` returns the raw reactive map. All take an optional
  type parameter for typed frontmatter access.
- `getAuthState`, `onAuthChange`, `useAuth` (`auth`) — read or subscribe to the user's
  login / account state (`{ status, user: { login } }`). Poll with `getAuthState()`,
  subscribe with `onAuthChange(listener)` (the listener is called immediately with the
  current state), or use the `useAuth()` React hook.
- `getMounts`, `findMount`, `onMountsChange`, `useMounts`, `waitForMount` (`mounts`) —
  read or subscribe to the filesystem mounts available to the sandbox (e.g. a
  Firestore-backed store mounted at `/firestore` after sign-in). Poll with
  `getMounts()` / `findMount({ type })`, subscribe with `onMountsChange(listener)` or
  the `useMounts()` hook, or `await waitForMount({ type: 'firestore' })` before using a
  mount. Access the files via the `fs` module at the mount's `path`.
- routing (`routing`) — define the app-owned URL suffix. Declarative
  `<Routes>`/`<Route path="/posts/:slug" element={…} />` (rendering a `<Route>`
  registers it, so routes can be conditional or data-derived), or a `routingSpec`
  passed to `boot`. `path` accepts a template (`:slug`, `*`) compiled to an
  anchored regex, or a raw `RegExp` as an escape hatch. Read the match with
  `useRouteParams()` / `useRoute()`. Also `Router`, `navigate`, `useTinkerableLink`.
- `MDXProvider` — the MDX context provider used by transformed `.mdx` files.
- `sandboxTypes` — shared TypeScript types for the sandbox runtime.

## API documentation

Full API reference (TypeDoc, human-browsable) is published to GitHub Pages:
<https://immediately-run.github.io/immediately-run-sdk/>

### For coding agents / LLMs

Two machine-readable surfaces are published next to the HTML, each fetchable in a
single request:

- **`llms.txt`** — <https://immediately-run.github.io/immediately-run-sdk/llms.txt> —
  a concise, plain-Markdown map of every export grouped by module, with its kind,
  import path, and a one-line description (the llmstxt.org convention). Start here.
- **`api.json`** — <https://immediately-run.github.io/immediately-run-sdk/api.json> —
  the complete TypeDoc model (exact signatures, parameters, types, and JSDoc) for
  when you need more than the one-liners.

The installed npm package also ships `.d.ts` carrying the same JSDoc, so your
editor/agent tooling can read the typed API inline without any network access.

## Verify (the CI/deploy gate)

`npm run verify` runs this repo's full CI gate in one command —
`check:circular` → `test` → `build` → `api:check` (the additive-only API-stability
check against the committed snapshot). Run it before pushing; it is the same set of
checks CI enforces, so a local green equals a green CI. (Ways of working §4: the local
verify gate must equal the deploy gate — one `npm run verify` per repo.)

## License

[MIT](./LICENSE)
