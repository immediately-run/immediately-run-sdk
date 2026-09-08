import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SDK_VERSION } from './version';

// The file this tests is GENERATED (`scripts/gen-version.mjs`, prebuild) and committed, so
// jest and consumers see it without a build. Its own header has claimed since it was written
// that it is "kept honest by version.test.ts" — a file that did not exist until R3-568. This
// is that test.
//
// It is not ceremony. The constant it guards was hand-maintained once and drifted to 0.4.0
// while the package was 0.8.0, which is what `gen-version.mjs` exists to prevent: the
// handshake reports SDK_VERSION to the host, so a stale value misreports the live version to
// the other side of the seam. The generator only runs on `prebuild`, so a version bump
// committed without a build leaves the two disagreeing — exactly the state this catches.
describe('SDK_VERSION', () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
    version: string;
  };

  it('is the version in package.json — the one the host is told', () => {
    expect(SDK_VERSION).toBe(pkg.version);
  });

  it('is a plain semver triple, so a consumer can compare it', () => {
    expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });
});
