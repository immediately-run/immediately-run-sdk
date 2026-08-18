// The sandbox↔SDK wire vocabulary — re-exported from the published contract.
//
// Until R3-274b1 this file was a COPY of a module generated in the sandbox repo,
// carried here by hand because this package does not depend on that one and a build
// that reads a sibling checkout is the coupling R3-274d removed. It now comes from
// `@immediately-run/sandbox-protocol`, which owns the descriptors and publishes a
// module per side (PLATFORM_LAYERING_SPEC §2 / S1 target 1).
//
// The file stays at this path because its exports are public API — `api-snapshot.json`
// pins them, and a fork pinned to an older SDK imports them from here.
//
// To change the wire: edit the descriptors in that package, publish, bump the pin.
// `npm run protocol:check` fails until this repo's source and the pinned contract
// agree.
export * from '@immediately-run/sandbox-protocol/sdk';
