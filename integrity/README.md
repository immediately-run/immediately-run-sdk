# SDK integrity trust root

This directory is the **trust root** for `@immediately-run/sdk` artifact integrity
(SDK_PACKAGING_SPEC §5.2.1 / SPEC_REVIEW_FINDINGS2 SP2-2, decision #6).

Each released version V has its manifest committed here as:

```
integrity/v<V>/integrity.json
```

— the same per-file **SHA-384** manifest that `scripts/build-selfhost.mjs` emits
alongside the `v/<V>/` artifacts on gh-pages, but committed **into the repo** and
tagged `v<V>` by the release CI (`.github/workflows/ci.yml`).

## Why a repo copy (not just gh-pages)

`immediately-run-site-main` bakes these hashes into the host's
`sdk-integrity.json`, which the sandbox bundler enforces before evaluating SDK
bytes. Those hashes **must** come from a surface independent of the gh-pages
origin they verify: an attacker who can swap artifact bytes on gh-pages could swap
the manifest in the same write (origin self-attestation), so verification would
pass vacuously. The repo-at-tag copy is a different write surface (commit/tag
protection, audit history) and survives a gh-pages-branch compromise.

site-main's build (R3-15) ingests each covered version's `integrity.json` from
**git-at-tag** here — never from `immediately-run.github.io`.

## How it's maintained

- **New release:** `build-selfhost.mjs` produces the current version's manifest;
  CI runs `sync-repo-integrity.mjs` to copy it here, commits `[skip ci]`, and tags
  `v<version>`.
- **Backfill (floor..current):** `backfill-all-integrity.mjs <floor>` populates a
  manifest for every published version at or above the floor (`0.2.8`). Versions
  predating build-time integrity get a trust-on-first-use manifest hashed from the
  origin's served bytes (marked `backfilledAt`); newer versions carry the stronger
  build-time hashes.

Manifests are immutable once committed (a published version dir never changes).
