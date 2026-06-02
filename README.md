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
- `useMetadataQuery`, `useFileMetadata` (`hooks`) — query files by frontmatter metadata.
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
- routing helpers (`Router`, `SandboxRouter`, …).
- `MDXProvider` — the MDX context provider used by transformed `.mdx` files.
- `sandboxTypes` — shared TypeScript types for the sandbox runtime.

## API documentation

Full API reference is published to GitHub Pages:
<https://immediately-run.github.io/immediately-run-sdk/>

## License

[MIT](./LICENSE)
