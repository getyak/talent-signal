# Talent Signal macOS RC3 verification

## Frozen identity

- Product: Talent Signal macOS Relationship Workbench
- Version: `0.1.0-rc3`
- Bundle version: `2`
- Bundle identifier: `com.talentsignal.macos`
- Source base commit: `3d2085040af6cc1ea557545282a20001d94452c6`
- Archive: `TalentSignalMac-0.1.0-rc3-build2.zip`
- Archive SHA-256:
  `9891645dc3cab2919ec2458ef8df99a6aa1a775031061211622ebcdf305d357a`
- Source archive: `TalentSignalMac-source-0.1.0-rc3-build2.tar.gz`
- Source archive SHA-256:
  `982f52784fb06d759dc8f5f78840cc29afdb864f3177032ad466bdfc58ac80d5`
- Host: Mac mini, Apple silicon, macOS 26.4 build 25E246, Xcode 26.6
- Signature: unsigned local verification build; not distribution-ready

## Verification results

| Check | Result | Direct evidence |
| --- | --- | --- |
| Native build, unit tests, UI target build | Pass | `pnpm macos:check`; 29 passed, 3 live-only skipped, 0 failed |
| Backend typecheck | Pass | contracts, agent, and backend TypeScript builds |
| Backend unit tests | Pass | 27 files, 203 tests, 0 failed |
| Fresh loopback native E2E | Pass | 3/3 in `live-e2e-20260831T105147Z-88027` |
| Response-loss idempotency | Pass | one review POST, one dropped response, zero action-completion POSTs |
| Revoke-after-preview | Pass | revoked source, open preview, zero receipt, zero destination write |
| Frozen Release manual live path | Pass | explicit scope + source + attribution → canonical `no_action` → Action Center exact readback |
| Settlement deletion + relaunch | Pass | zero local Capsule items after settlement and after relaunch |
| Pause / stop / clear truth | Pass | one-step receipts name retained/deleted state and canonical-Task boundary |
| Keyboard primary journey | Pass | direct window-only recording |
| VoiceOver order | Pass | actual Caption Panel records identity through consequence before choice |
| Reduced Motion | Pass | frozen Release state-transition recording |
| 200% text | Pass | frozen Release decision and receipt screenshot sequence |
| macOS XCTest UI runner | Host-limited | runner hung before connection; no UI assertion counted as passed |
| Signed/notarized distribution | Not run | no signing identity or distribution request in scope |

## Canonical live facts

The fresh loopback run produced:

- one applied Pursuit proposal receipt;
- Pursuit revision `1 → 2`;
- changed field `gaps`;
- `external_effects: []` on the receipt and Task;
- exactly one decision review POST despite a deliberately dropped response;
- no action-completion POST; and
- a second proposal whose source was revoked after preview and which produced
  no proposal receipt.

The frozen Release manual journey separately produced Task
`bafeb0d0-f1dc-4c13-86ea-3614db6b91b0`, revision 2, status `no_action`, with
one pinned evidence reference, bounded budget/usage, and zero external effects.
Action Center re-read that exact Task from the backend.

## Truthful limitations

The native E2E uses a synthetic loopback account and deterministic proposal
provider. It proves transport, authorization, identity, versioning,
idempotency, canonical mutation, revocation denial, and readback; it does not
prove model quality on real candidate data. All visual candidate content is
synthetic. No real recruiter study has been completed. The frozen app is
unsigned and not a shippable App Store/TestFlight artifact.
