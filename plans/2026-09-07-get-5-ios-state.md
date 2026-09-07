# GET-5 iOS Session state

## Outcome

Keep the same recoverable session and ordered transcript through contact proposals, confirmation, relaunch, feedback, forks, exports, and account-isolated synchronization. No copied or synchronized context confers execution authority.

## Ownership and boundary

Own `RelationshipArchiveModels.swift`, new dedicated state/sync helpers, and model/store tests. UI, authentication lifecycle, and backend routes belong to parallel workers. Do not run Xcode or Simulator; root owns verification.

## Evidence and approach

The current singleton contact proposal deletes an otherwise empty unscoped session on promotion; contact receipts always create another session. Scoped persisted responses discard readable text. Store persistence already provides protected atomic writes and bounded retention.

1. Active: add per-session proposals with exact source references and preserve message/session identity.
2. Add persisted feedback, safe fork origin/context, and readable user-requested export.
3. Add authenticated revision-based sync with conflict recovery and deletion tombstones; coordinate wire contract with backend worker.
4. Provide focused tests and hand off for root-run iOS validation.

## Verification

Exercise two simultaneous proposals, relaunch/pending request recovery, decline/expiry source preservation, confirmation continuity, feedback toggles, fork authority stripping, sanitized exports, CAS concurrent edits, and tombstone propagation.

## Implemented state (ready for root verification)

- Version 8 protected cache migrates the singleton proposal into per-session proposals; promotion records the immutable source turn and receipt completion binds the original session. Decline/expiry preserve source identity with truthful display status; unknown contact writes remain recoverable and cannot be overwritten/dismissed.
- Session-owned composer drafts and scoped request recovery keys prevent same-relationship sessions from leaking drafts or idempotency keys. Composer drafts retain the existing seven-day boundary.
- Feedback is per-turn metadata. Fork copies at most 40 completed turns, keeps explicit origin and screenshot source references for deletion propagation, and drops pending operations, proposal authority, receipts, and feedback. The UI worker guards copied screenshot references from live reactivation.
- Markdown export uses readable conversation and receipt labels. It excludes internal receipt/operation IDs and pending credentials. Root owns final localization changes to the context helper.
- The authenticated sync client follows all pages, uses revision CAS, merges immutable transcript order by retaining the server prefix, persists pending deletion tombstones, preserves live display only when readback content is equivalent, applies source retractions, and skips digest-identical writes. Logout generation checks prevent an in-flight pull from restoring cleared state.
- Added `AgentSessionContinuityTests.swift` for proposal isolation, confirmation identity, pending recovery, expiry, composer isolation, feedback/fork/export, screenshot chronology, concurrent merge, deletion, conflict preservation, freshness, and redaction. Updated obsolete singleton-loss expectations and high-precision contact fixtures in `RelationshipArchiveTests.swift`.

## Verification status

`swiftc -frontend -parse` passes for the owned Swift files and tests. `git diff --check` passed before root localization edits. Root owns Xcode/Simulator validation and full docs checking; no Xcode or Simulator was run by this worker. The initial root build exposed an initializer access-before-initialization issue, now fixed by direct array initialization.

## Integration notes

UI uses `synchronize(using:) async -> Bool` before asking, per-session draft APIs, and `beginAsk(..., sessionID:)`. Stable source message IDs derive from protected request UUIDs. Backend schema and redaction support every added field including composer draft age. Canonical screenshot task content is fetched by the UI only for original sessions; copied references remain read-only context.

## Admission interruption correction

Root-run tests exercised 498 cases and exposed one proposal expiry boundary failure: rounded capture time could extend the draft deadline by less than one second. The deadline now derives from the injected clock directly; capture time stays stable for request idempotency.

Screenshot admission now persists only its typed pending key, bounded request identity hash, original capture time, and objective before transport. Restored screenshot admissions cannot enter the scoped/unscoped text or research request entrypoints. Only an accepted canonical screenshot task with the matching admission key clears the pending state; restoring an older task cannot erase a newer interrupted upload. Added a relaunch/retry/mismatch/no-raw-persistence regression. UI owns reattachment and replay gating; backend owns the matching optional sync fields. Awaiting the root-run signed XCTest rerun.

## Independent lifecycle review corrections

- Expired, declined, completed, and replaced proposal intents now leave only a protected SHA-256 intent tombstone. Stale view state cannot create a fresh proposal with the retired key after prune or relaunch; deliberate new-message intent keys remain allowed. `isContactProposalCurrent` is a pure freshness read for rendering. A pending approved recovery key cannot change its exact draft/target/confirmation effect.
- Session retention uses immutable `createdAt` and a server-authoritative expiry cap. Legacy caches derive their earliest observable turn/receipt/update time once; original admission time that was never persisted cannot be reconstructed more precisely. Offline draft and feedback edits no longer extend the deadline.
- Delayed scoped answers use `recordIfOwned`; both this strict path and legacy explicit-ID recording refuse deleted/missing owners. The legacy first-response fixture now creates its protected Session before recording the answer.
- Synchronization isolates per-session bounds, conflicts, and deletion failures while authentication, unavailable pulls, and malformed global readback still stop admission. A required Session is allowed only after its own successful sync and continued ownership. Other local history remains intact.
- Forks copy whole recent turns within a conservative 128 KiB content budget and forty-turn limit, expose `contextWasTrimmed`, preserve source references only for copied turns, and retain actual origin IDs. Unsynced-source forks use explicit `originKind: local` client-declared provenance; the backend independently validates source ownership/lifecycle and rejects known expired/deleted/foreign originals.
- Added native regressions for expiry resurrection, pending-effect mutation, fixed offline retention, deleted/missing owner callbacks, oversized-session isolation, and byte-bounded forks. Syntax and diff checks pass; root owns the next compiled test run.

## Screenshot capacity and fork ownership correction

A full twenty-reference Session now rejects a new screenshot admission before reserving a key or sending bytes. The UI receives a pure, actionable capacity notice and preserves the selected images and composer text. Forking copies at most nineteen inherited screenshot references, leaving room for a new capture; explicit inherited-reference metadata distinguishes read-only copied tasks from new tasks owned by the fork after relaunch. The backend validates that metadata as an immutable subset of source references.

If another device fills the final slot after a request was already admitted, the matching admitted canonical receipt may be retained as one local overflow reference. This recovery exception clears the pending state, preserves the actual outcome, and routes continuation through the bounded fork; subsequent capture admission and oversized sync remain blocked for that original Session. No ordinary twenty-first request is admitted. Added native regressions for capacity refusal, fork-owned restoration, inherited-task immutability, and admitted-race receipt recovery. The UI worker wired matching preflight and owner guards. Root owns compiled validation.
