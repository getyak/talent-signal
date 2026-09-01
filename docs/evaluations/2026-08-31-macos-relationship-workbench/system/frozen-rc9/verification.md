# RC9 build 7 verification

## Frozen identity

| Item | Value |
| --- | --- |
| Release archive | `TalentSignalMac-0.1.0-build7.zip` |
| Release SHA-256 | `2c6722462fba3b39faeaa3478c18b46f2e5241813e480234dcb5d806652a9cba` |
| Release binary SHA-256 | `c2411978b3c082962ab7719154c8bd0329294137adeb42a717ad2eaf22b87625` |
| Architectures | `x86_64 arm64` |
| Version/build | `0.1.0 (7)` |
| Source archive | `TalentSignalMac-source-0.1.0-build7.tar.gz` |
| Source SHA-256 | `ade636a3dca22af7ab366df9cda78a206fc8f57ad683a7a55e9f7e73c030d37f` |

The release archive is an unsigned local verification artifact, not a
notarized App Store submission. The source archive was extracted after freeze
and compared byte-for-byte with every included current source path; no
difference was found.

## Checks

| Check | Result |
| --- | --- |
| `pnpm backend:check` | Passed: Agent 49/49, Backend 216/216, fresh PostgreSQL migration/runtime evaluations passed |
| `pnpm macos:check` | Passed: native unit/integration tests passed and the UI-test target compiled; runtime UI automation is not claimed by this command |
| `pnpm docs:check` | Passed: 11 canonical documents, 335 Markdown files, wiki and architecture diagrams |
| Validator contract tests | Passed 4/4 |
| Native live E2E | Passed 5/5 on macOS 26.4 against a fresh synthetic loopback PostgreSQL backend |
| Focused menu-bar privacy test | Passed 1/1; build 7 source and binary expose no system-notification sink |
| Direct frozen no-action surface | Captured from the extracted build 7 Release ZIP with screenshot SHA-256 `fb31c29e4b40352a01a6128906d1362c28bf3c824490fc1621206a1ef5a61dd4` and AX excerpt SHA-256 `8279362e3f1fa5ff2615b0327386932ef6ba77e0263c7becb31dac78327c0df8` |

The native live bundle is
`system/live-e2e-build7-relaunch-r2`. Its summary SHA-256 is
`bd1ba8ca9dd9b3bcf9ba024442d76f333f5f5167cfcf442622c86e81958c95c7`.
The five tests cover reviewed Capsule to no-action readback, relative-time
clarification, explicit Proposal decision and Receipt, revocation between
preview and decision, and immutable Capsule version separation. All asserted
external-effect arrays are empty.

## Existing-action continuity

The no-action first response now keeps four things visible together:

1. the exact reviewed evidence;
2. the current relationship dependency;
3. `Prepare the exact client policy question` as an already-owned action; and
4. the boundary that no message, calendar event, or duplicate recruiter task
   was created.

When an open gap and an open owned action both exist, the canonical briefing
summarizes both instead of allowing one to hide the other. The direct frozen
surface is explicitly labelled deterministic synthetic fixture and does not
claim canonical backend readback.

## Durable response-loss recovery

The build 7 decision path encrypts a minimal operation-correlation record
before the consequential request leaves the process. It persists the original
operation, task, Proposal, scope, and evidence-reference IDs, but excludes
candidate message text and bearer credentials. On relaunch, an authenticated
exact-scope match restores `outcome_unknown`; the UI permits only a GET-based
reconciliation of the original operation ID, never a second decision POST.

The live proof intentionally committed one decision and dropped its response,
then blocked the first four operation readbacks so the original service
instance returned `outcome_unknown`. A newly constructed service instance
restored the encrypted record and reconciled the original ID. The proxy state
(SHA-256 `3d8b2cb224fa7eb724506ec73a63fbd31318a12b2426ab57d0cc8bccfeb38bc6`)
records:

- one decision-review POST;
- one dropped response;
- four deliberately blocked operation GETs;
- six total operation GETs, including relaunch recovery and receipt recheck;
- zero action-completion POSTs; and
- a verified canonical Receipt after relaunch.

The Receipt SHA-256 is
`a58c61315b56b9b8490c631dfef514f547e479f2f03fe81d5b842c4b015c64bc`.
The encrypted record is cleared only after the canonical Receipt or a terminal
conflict/failure is verified, or after explicit sign-out.

## Privacy, deletion, and TTL

The build 7 notification proof is
`system/frozen-rc9/notification-privacy-summary.json`, SHA-256
`bec6b3266e71d5144bf8d4b9b26ab6fe93df045daaa4b1bac51f1f9da7394a34`.
It binds the focused menu-bar privacy test and absent notification sink to the
frozen build 7 ZIP and binary hashes.

The manual-deletion and TTL implementation paths are byte-identical between
the build 6 and build 7 source archives: `prove-release-boundaries.mjs`,
`captures.ts`, `sourceRetention.ts`, migration 037, and
`LocalCapsuleStore.swift`. Therefore the RC8 destructive retention proofs stay
admissible for those unchanged paths through the exact source-delta audit; no
claim is made that older UI media proves the new build 7 surfaces.

## Evidence boundaries

All live, visual, deletion, and retention inputs are synthetic and local. The
frozen surface capture proves rendering and accessibility of the new path; the
live bundle proves canonical behavior. Neither proves production signing,
notarization, real-candidate processing, or App Store distribution.
