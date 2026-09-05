# Native Lab test-workspace evaluation

Date: 2026-09-05. Scope: the protected iOS journey over the migration 045
test-workspace backend. The proof uses an iPhone 17 Pro Simulator, a signed
Debug app, synthetic fixture identities, and a disposable loopback PostgreSQL
database. It does not establish physical-device Keychain behavior, live S3
cleanup, TestFlight distribution, or production deployment.

## Outcome

The app can create and enter a real empty server account without copying people,
conversations, captures, drafts, or pending actions from the original account.
Before any server mutation, it saves the operation ID, entry ID, original
session, and a client-generated child credential in an endpoint-scoped,
ThisDeviceOnly Keychain journal. The server returns identity metadata and keeps
only the credential hash. The app validates the delegated session online and
checks the exact account, user, role, expiry, contract, and empty-workspace
receipt before replacing the visible workspace root.

Entry closes Lab and exposes a persistent vermilion test-workspace banner.
Relaunch suppresses offline restoration, validates the delegated session, and
recovers the same workspace. Return validates and restores the original account
before revoking the child entry. End additionally reuses a durable stop ID and
keeps the server cleanup receipt until the workspace reports `deleted`, zero
data rows, zero active sessions, and no cleanup error. Backend switching is
blocked while this protected journey is open.

Malformed, unreadable, or identity-mismatched journals close account content.
An expired original credential stays recoverable through a fresh sign-in by the
same owner. A preparing operation can resume with its original workspace and
entry IDs after process loss. The final native journey read the original
`/v1/people` response before and after the isolated lifecycle and found it
byte-identical.

## Evidence

- [Native proof](native-proof.json) is the sanitized attachment emitted by the
  passing UI journey. It records empty and deleted timestamps, zero remaining
  rows and sessions, and the unchanged original response.
- [Review result](review.json) records the exercised recovery, identity, UI,
  cleanup, localization, and release boundaries.
- [Source proof](source-proof.json) fixes the hashes of the iOS journey,
  backend contract, and test sources reviewed for this milestone.
- `/tmp/talent-signal-lab-v2/workspace-native-20260905-0319.xcresult` passed one
  33.9-second Chinese native journey with zero skips on iOS 26.5.
- `/tmp/talent-signal-lab-v2/workspace-related-units-20260905-0322.xcresult`
  passed 40 signed tests across workspace, session, session-ending, runtime,
  and Product Lab state.
- `/tmp/talent-signal-lab-v2/workspace-native-check-20260905-0319.log` records
  the clean Release build with the public device-Lab flag disabled and the
  disposable backend lifecycle.

The first real UI attempts were retained as negative evidence. They exposed a
missing generated-project membership, a UITest bundle-configuration lookup,
and an exact `Date` equality check that rejected valid Keychain bytes. The final
implementation compares the complete journal after millisecond normalization
while the storage layer independently verifies exact written bytes.

## Remaining boundary

The native empty-workspace capability is complete for source and Simulator
delivery. Physical-device Keychain verification and live object-store deletion
remain release-environment checks. This milestone made no external model calls,
used no candidate data, performed no external business writes, and published no
build. Controlled observation windows, online assignment, Web batch review,
hosted CI, and the final release audit remain separate Lab work.
