/*
 * SP2-6 (debt §5.2) — SDK_VERSION must equal package.json, baked by
 * scripts/gen-version.mjs (a hand-maintained constant had drifted: 0.4.0 vs the
 * 0.8.0 package, misreporting the live version in the §6 handshake). This guards
 * against re-drift: bumping package.json without regenerating fails CI.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { SDK_VERSION, sdkHandshake } from '../src/runtime';

const pkgVersion = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
).version as string;

describe('SDK_VERSION baked from package.json (SP2-6)', () => {
  it('equals the package.json version', () => {
    expect(SDK_VERSION).toBe(pkgVersion);
  });

  it('is the version the host receives in the handshake', () => {
    expect(sdkHandshake().sdkVersion).toBe(pkgVersion);
  });

  it('is a concrete semver, never the stale 0.4.0 literal', () => {
    expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(SDK_VERSION).not.toBe('0.4.0');
  });
});
