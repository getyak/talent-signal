# Build 6 to build 7 source delta

This audit scopes which earlier RC8 evidence remains admissible after the
build 7 repair. It does not relabel an older screenshot, recording, or review
as build 7 evidence.

## Archive identities

- Build 6 source: `system/frozen-rc8/TalentSignalMac-source-0.1.0-build6.tar.gz`,
  SHA-256 `97c70441bde0d9bf332c1fec2e78a9956fb752bf44ce3989ba4b1b44177aab98`.
- Build 7 source: `system/frozen-rc9/TalentSignalMac-source-0.1.0-build7.tar.gz`,
  SHA-256 `ade636a3dca22af7ab366df9cda78a206fc8f57ad683a7a55e9f7e73c030d37f`.
- Build 6 contains 188 files; build 7 contains 201 files; 175 path-and-content
  pairs are byte-identical.

## Relationship Workbench changes

Build 7 intentionally changes:

- `agentTasks.ts`, so an open gap and an already-owned action are both visible
  in the first-response dependency instead of emitting a contradictory
  `No unresolved dependency` sentence;
- the native no-action first-response view and deterministic fixture, so exact
  evidence, dependency, already-owned action, and no-external-effect boundary
  appear on the primary surface;
- `URLMacRelationshipService.swift` plus new
  `UnknownResolutionStore.swift`, so one operation correlation is encrypted
  before dispatch and can be restored across process relaunch;
- the response-loss proxy, native live tests, boundary tests, and UI tests to
  prove restart recovery, one POST, the same operation ID, and visible
  no-duplicate semantics; and
- the macOS build number from 6 to 7.

The expanded source archive also contains current repository backend files
that were absent from the earlier archive. Their presence does not grant them
review authority; reviewers must trace a claim to its exact requirement and
evidence.

## Byte-identical retention boundary

The following files are byte-identical between the two archives:

| File | Build 7 SHA-256 |
| --- | --- |
| `scripts/macos/prove-release-boundaries.mjs` | `105469f44fd1b2c19276f9919e88441657eb01afd660465234e7a33452f75557` |
| `apps/backend/src/modules/captures.ts` | `f748e76e6a06cd5fc837eb6a4e5752162fd3dad082ccaee0ee9995626885e3e0` |
| `apps/backend/src/modules/sourceRetention.ts` | `22afdad14ea6c15e4b96824727454755ca654ee85f00de39d3b19ece4fd74627` |
| `apps/backend/src/database/037_source_retention_derivative_lineage.sql` | `db4eca53ddb0d380afce2c6b0bf1fd2c3978c5559e82be861dcdacb3a02f7047` |
| `apps/macos/Sources/Services/LocalCapsuleStore.swift` | `5085e31ea323bc68bf825030dc2f49de1ce1968981012117e0da26bac924a365` |

RC8 manual-deletion and TTL outputs may therefore prove those unchanged
retention paths. They cannot prove build 7 response-loss persistence,
no-action rendering, product semantics, or the new review verdicts.
