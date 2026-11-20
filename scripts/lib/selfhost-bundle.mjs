/*
 * The single-request transport bundle of a self-hosted SDK version
 * (`<out>/v/<version>/bundle.json`), shared by the build that writes it
 * (`build-selfhost.mjs`) and the gate that audits a finished payload
 * (`check-selfhost-resolvable.mjs`).
 *
 * Wire shape — the sandbox bundler is coded against exactly this:
 *
 *   { "schemaVersion": 1, "files": { "<rel>": "<utf8 file content>", … } }
 *
 * `files` holds every fetchable file of the version plus `manifest.json`: the key
 * set of `integrity.json`'s `files`, minus the bundle's own entry. The bundle is
 * TRANSPORT, not a trust surface: a consumer unpacks it and verifies each file
 * against that file's own pinned hash, as it does for a per-file fetch. So the
 * property worth enforcing here is that unpacking reproduces the pinned bytes —
 * everything below asks that one question from a different side.
 */

/** The bundle's file name inside a version dir, and its key in `integrity.json`. */
export const BUNDLE_FILE = 'bundle.json';
export const BUNDLE_SCHEMA_VERSION = 1;

/**
 * The bundled files whose content does not hash to its pinned value, plus pinned
 * files the bundle lacks. `sha384(bytes)` returns the `sha384-<base64>` form the
 * integrity manifest carries. The bundle's own integrity entry is ignored.
 */
export const bundleEntryMismatches = (bundle, integrityFiles, sha384) => {
  const files = bundle?.files ?? {};
  const out = [];
  for (const [rel, want] of Object.entries(integrityFiles)) {
    if (rel === BUNDLE_FILE) continue;
    const content = files[rel];
    if (typeof content !== 'string' || sha384(Buffer.from(content, 'utf8')) !== want) out.push(rel);
  }
  return out;
};

/**
 * Audit a finished payload's bundle against its integrity manifest and its files.
 * Returns human-readable findings; empty means the bundle is a faithful copy.
 *
 *   bundleBytes     the bytes of bundle.json as published
 *   integrityFiles  integrity.json's `files`
 *   manifestFiles   manifest.json's `files`
 *   readFileBytes   (rel) => Buffer of the published per-file copy, or null if absent
 */
export const auditBundle = ({ bundleBytes, integrityFiles, manifestFiles, readFileBytes, sha384 }) => {
  const findings = [];
  let bundle;
  try {
    bundle = JSON.parse(bundleBytes.toString('utf8'));
  } catch (e) {
    return [`${BUNDLE_FILE} is not valid JSON (${e.message})`];
  }
  if (bundle?.schemaVersion !== BUNDLE_SCHEMA_VERSION) {
    findings.push(`${BUNDLE_FILE} declares schemaVersion ${bundle?.schemaVersion}, expected ${BUNDLE_SCHEMA_VERSION}`);
  }
  if (typeof bundle?.files !== 'object' || bundle.files === null) {
    findings.push(`${BUNDLE_FILE} has no "files" object`);
    return findings;
  }
  // The bundle's own bytes are pinned, so the fetch layer can verify before caching.
  const ownPin = integrityFiles[BUNDLE_FILE];
  if (ownPin === undefined) findings.push(`integrity.json does not pin ${BUNDLE_FILE}`);
  else if (sha384(bundleBytes) !== ownPin) findings.push(`${BUNDLE_FILE} does not hash to its own integrity entry`);
  // Transport, not a module file: the manifest must not list it, and it never holds itself.
  if (manifestFiles.includes(BUNDLE_FILE)) {
    findings.push(`manifest.json lists ${BUNDLE_FILE} (it is transport, not a module file)`);
  }
  if (BUNDLE_FILE in bundle.files) findings.push(`${BUNDLE_FILE} contains itself`);

  const pinned = new Set(Object.keys(integrityFiles).filter((rel) => rel !== BUNDLE_FILE));
  for (const rel of Object.keys(bundle.files)) {
    if (rel !== BUNDLE_FILE && !pinned.has(rel)) {
      findings.push(`${BUNDLE_FILE} carries ${rel}, which integrity.json does not pin`);
    }
  }
  for (const rel of bundleEntryMismatches(bundle, integrityFiles, sha384)) {
    findings.push(
      rel in bundle.files
        ? `${BUNDLE_FILE} entry ${rel} does not hash to its pinned value`
        : `${BUNDLE_FILE} is missing the pinned file ${rel}`,
    );
  }
  // And against the per-file layout served beside it: both channels must hand a
  // consumer the same bytes, whichever one it takes.
  for (const [rel, content] of Object.entries(bundle.files)) {
    if (!pinned.has(rel)) continue; // already reported above
    const onDisk = readFileBytes(rel);
    if (onDisk === null) findings.push(`${BUNDLE_FILE} carries ${rel}, which the payload does not ship as a file`);
    else if (typeof content === 'string' && !Buffer.from(content, 'utf8').equals(onDisk)) {
      findings.push(`${BUNDLE_FILE} entry ${rel} differs from the published file`);
    }
  }
  return findings;
};
