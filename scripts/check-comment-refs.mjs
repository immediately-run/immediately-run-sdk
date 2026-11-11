import { checkCommentRefs } from '@immediately-run/verify-checks/comment-refs';

// R3-1085 — a backticked span in a comment that names a symbol or path must
// name one that exists. The allow map carries only names a comment
// legitimately cites but this repo's code never spells (platform globals,
// docs-corpus spec names, cross-repo paths); a stale entry is itself a
// finding. Everything else unresolved is the R7 debt ledger in
// verify-baselines/comment-refs.json, which only shrinks.
await checkCommentRefs({
  patterns: ['src/**/*.{ts,tsx}', 'scripts/**/*.{mjs,mts,ts}'],
  ignore: ['**/generated/**'],
  pathRoots: ['src'],
  allow: {
    LLM_AND_AGENTS_SPEC: 'a spec in the docs repo, cited by name',
    SDK_PACKAGING_SPEC: 'a spec in the docs repo, cited by name',
    localStorage: 'platform/library global the repo’s code never spells',
    MDX_FROM_MOUNT_SPEC: 'a spec in the docs repo, cited by name',
    PLATFORM_LAYERING_SPEC: 'a spec in the docs repo, cited by name',
    'reckoner/docs/specs/CONNECTOR_EGRESS_FIXING_SPEC.md':
      'a path in a sibling repo or the docs corpus, cited cross-repo',
    'sandbox/src/bundler/metadataKey.test.ts': 'a path in a sibling repo or the docs corpus, cited cross-repo',
    OpenRouter: 'platform/library global the repo’s code never spells',
    GROVE_AGENT_SPEC: 'a spec in the docs repo, cited by name',
    MessagePort: 'platform/library global the repo’s code never spells',
    TRUST_MODES_SPEC: 'a spec in the docs repo, cited by name',
    AGENT_RUN_DURABILITY_SPEC: 'a spec in the docs repo, cited by name',
    'site-main/src/editor/SandboxListener.ts': 'a path in a sibling repo or the docs corpus, cited cross-repo',
    BUNDLE_EMBEDDING_SPEC: 'a spec in the docs repo, cited by name',
    UI_AS_APPS_SPEC: 'a spec in the docs repo, cited by name',
    DataCloneError: 'platform/library global the repo’s code never spells',
    MediaStreamTrack: 'platform/library global the repo’s code never spells',
    BROWSER_CAPABILITIES_SPEC: 'a spec in the docs repo, cited by name',
    'sandbox/src/fsLayout.ts': 'a path in a sibling repo or the docs corpus, cited cross-repo',
    'docs/api-descriptors.json': 'a path in a sibling repo or the docs corpus, cited cross-repo',
    'docs/specs/SDK_SIMPLIFICATION_SPEC.md': 'a path in a sibling repo or the docs corpus, cited cross-repo',
    'docs/specs/CAPABILITY_REFERENCE.md': 'a path in a sibling repo or the docs corpus, cited cross-repo',
    randomUUID: 'platform/library global the repo’s code never spells',
  },
  baselinePath: 'verify-baselines/comment-refs.json',
});
