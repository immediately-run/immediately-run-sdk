# Provider icons provenance

`sprite.generated.ts` vendors the monochrome provider icon set from
[sst/opencode](https://github.com/sst/opencode) —
`packages/ui/src/assets/icons/provider/*.svg` at commit
`0dcedc199c83c88ef206b4d89351f4a0e4a9a61d` (2026-08-10), MIT-licensed
(opencode's repo-root LICENSE; the set carries no per-directory notice).

Regenerate with `node scripts/sync-provider-icons.mjs` (fetches at the pinned commit,
optimizes with svgo, enforces monochrome). Bump the pin deliberately; the diff is the
review.

Provider marks are trademarks of their owners and identify the provider.

---

MIT License

Copyright (c) 2025 opencode

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
