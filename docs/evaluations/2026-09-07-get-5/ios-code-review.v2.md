# GET-5 iOS code review — frozen v2 retest

```yaml
reviewer: ios-code-review
artifact: /tmp/get5-ios-review-v2/manifest.json
method: static code, caller integration, and focused test-source review
verdict: changes_required
runtime_proof: not_executed_by_this_reviewer
```

Three v1 findings are fully resolved in the frozen source and their caller integration. IOS-2's original restore/fork race and IOS-5's global Ask blockage are also resolved, but screenshot recovery has two remaining P2 cases below: newly authored screenshots inside a fork cannot restore after reopening, and the previously reported screenshot-cap branch remains actionable. This report preserves the [v1 review](ios-code-review.v1.md) as historical evidence and does not claim native test execution or successful taps.

All iOS references below are relative to `/tmp/get5-ios-review-v2/apps/ios/`. Backend schema/source were read only as current dependencies. The parent task owns the compiled test run, native UI run, and independent validation of the new local-origin backend contract.

## Retest of the five findings

| Finding | v2 result | Exact implementation and caller evidence | Proof level |
| --- | --- | --- | --- |
| IOS-1: expired open proposal can renew itself | **Resolved in source** | `Sources/Features/RelationshipArchiveModels.swift:1726–1738` provides a pure current-intent check; `1751–1759` rejects retired/inactive intents and changes to a pending exact effect. Expiry inserts the hash-only retired intent before removal at `2350–2358`, and the envelope persists it at `2319`. `Sources/Features/RelationshipAskView.swift:4857–4862` gates Save, `5082–5085` gates edits, and the card receives `isCurrent` at `1304`. The ended card omits Save/Edit and allows dismissal. | Static implementation and actual UI call sites inspected; focused unit/UI test source present; no runtime result claimed. |
| IOS-2: delayed screenshot restore transfers live controls into a fork | **Original race resolved; new-task restore subcase remains** | `RelationshipAskView.swift:3658–3667` captures the original Session and verifies both Session and task after the await. `3626–3632` requires an explicit owner and live Session before modifying either the task dictionary or store. Poll, create, resume, and cancel callbacks carry owner checks; polling identity now includes the active Session at `3608`. Fork clears the live dictionary at `2671–2673`. However the unconditional fork exclusion at `3660` also excludes newly created screenshot tasks after reopening. | Static async interleaving reviewed; pure owner predicate test present. A controlled delayed native restore/fork test has not been run by this reviewer. |
| IOS-3: delayed scoped response recreates tombstoned history | **Resolved in source** | `RelationshipArchiveModels.swift:1317–1322` rejects an explicitly missing/tombstoned owner in the legacy recorder. `2636–2645` adds a failure-returning `recordIfOwned`. The real scoped completion now checks the active Session at `RelationshipAskView.swift:4310–4313` and calls that strict recorder at `4322–4330`. | Static store and UI integration inspected; focused remote-tombstone and missing-ID test source present. |
| IOS-4: offline edits extend Session retention | **Resolved in source** | `RelationshipArchiveModels.swift:349–361` defines fixed creation/deadline state. The persisted representation stores/restores creation and the cap at `798–800,848–850`. Pruning uses `retentionDeadline` at `2334`, expiration scheduling uses it at `2393`, and canonical readback applies the earlier server cap at `2733`. Composer and feedback activity no longer change this boundary. Fork retains the original cap at `2622`. | Static persistence and pruning review; a clock-controlled edit/feedback/relaunch regression exists. A separate server-cap cache round-trip execution is still useful proof, not an established defect. |
| IOS-5: one oversized Session blocks unrelated Ask | **Main issue resolved; screenshot subcase remains** | `RelationshipArchiveModels.swift:2770–2777` preflights turn/byte sync bounds; `2803–2805,2836–2838,2852–2865` isolates per-Session failure and returns readiness for the required owner. `RelationshipArchiveView.swift:988–995` carries that owner through its serialization wrapper; all canonical screenshot/unscoped/scoped send callers pass it at `RelationshipAskView.swift:3438,3859,4296`. Fork keeps at most 40 whole turns within 128 KiB at `RelationshipArchiveModels.swift:2605–2623`, preserving the original and reporting omitted context in the UI at `2676–2678`. The 20-screenshot admission limit remains checked only after POST, below. | Static code/caller review plus focused growth/fork test source. Backend `originKind: local` validation and native continuation are separately owned proof. |

## Remaining IOS-2 subcase · P2 · New screenshots inside a fork cannot restore after reopening

**Exact locations:** `Sources/Features/RelationshipAskView.swift:3658–3660`; `Sources/Features/RelationshipArchiveModels.swift:2621,2569`.

Immediate new screenshot submission in a fork is permitted: the response-owner predicate compares the current Session/task, and `recordScreenshotResult` does not reject fork origin. However, `restoreScreenshotTasks` returns for every Session with a nonnil `originSessionID`, including a fork containing a screenshot newly selected and submitted by the user. The same `screenshotTaskIDs` collection holds both inherited references and newly appended tasks, so restoration cannot distinguish them.

**User impact:** after leaving/reopening that fork or relaunching the app, the newly authored screenshot has only its saved summary. Its current detail, progress polling, and waiting-for-user controls are no longer restored, even though they belong to this fork's own request. A user-created task waiting for clarification is stranded in its originating conversation.

**Minimal correction:** distinguish inherited read-only screenshot references from new tasks owned by the fork, and restore only the latter. Keep the v2 post-await Session/task checks; removing all fork restrictions would revive the inherited-task authority problem.

**Focused regression:** fork an original screenshot Session; submit a different screenshot in the fork and return a `waiting_for_user` task; reopen and relaunch. Assert the new task restores and is operable, while the inherited original task remains display-only. No such regression exists in the frozen tests. This is a static-confirmed restore-path defect, not an assertion that the fresh POST itself fails.

## Remaining IOS-5 subcase · P2 · The 21st screenshot is admitted before its Session capacity is checked

**Exact locations:** `Sources/Features/RelationshipArchiveModels.swift:2523–2542,2548–2549`; `Sources/Features/RelationshipAskView.swift:3440–3447,3646–3651,2645`.

`beginScreenshotAdmission` accepts a new request when the Session already has 20 screenshot task IDs. The current synchronization preflight only checks turns and encoded size, so this Session can still pass the required-owner gate and send the create POST. Once accepted, `recordScreenshotTask` rejects the new task because of the 20-task bound. `recordScreenshotResult` returns no success value; its caller nevertheless sets `accepted = true` and discards the selected images. The matching admission key is never cleared because recording returned before that transition.

The user is left with an accepted backend task and an unresolved Session admission. Reattaching the exact original images finds the same task but hits the same permanent recording limit. Normal text continuation remains blocked, and the proposed fork recovery is itself disabled while admission is pending. Screenshot history may still expose the backend task; that does not repair its broken originating Session admission.

**Minimal correction:** reserve/check capacity before any new admission POST and offer a reviewable new-Session/fork path before creating a pending key. Existing accepted or unknown admissions must remain reconcilable even if the local limit was reached concurrently. Make the acceptance-to-recording result explicit so a failed local save cannot be treated as completed recovery.

**Focused regression:** seed 20 unique task IDs, attempt a 21st fresh admission, and assert there is no create POST or new pending key and a usable continuation path is available. Separately simulate an already accepted/unknown 21st request and verify exact-key readback can durably close recovery without discarding history or duplicating the task. The frozen tests do not cover either case.

## Focused regression source reviewed

| Check | Frozen evidence | Assessment |
| --- | --- | --- |
| Expired intent cannot be renewed before or after relaunch | `Tests/AgentSessionContinuityTests.swift:100–123` | Directly exercises the stale-view draft plus same key, checks original source ID, and verifies a new deliberate intent remains possible. |
| Declined intent stays closed; unknown effect stays exact | Same file, `127–142` | Covers terminal reuse and changed pending target payload. |
| Ended proposal has no Save or Edit action | `UITests/Get5SessionUITests.swift:218–233` | Native UI assertion source exists; this uses an ended-state fixture, not an observed seven-day passage. |
| Delayed screenshot belongs to the exact Session/task | `Tests/AskScreenshotAdmissionPolicyTests.swift:29–39` | Checks original/fork/nil/wrong-task predicate; caller inspection confirms it is used after restoration awaits. |
| Remote tombstone and missing owner reject delayed writes | `Tests/AgentSessionContinuityTests.swift:269–281` | Calls both strict and legacy recording APIs after remote deletion. |
| Offline day-29 edits do not extend the day-30 boundary | Same file, `250–265` | Includes composer, feedback, persistence reload, and final reload after removal. |
| A 201-turn Session does not block a new required owner | Same file, `285–313` | Verifies only the small Session is put, notices remain scoped, and original large history survives. |
| Fork keeps whole turns within the byte budget | Same file, `317–333` | Checks a single oversized turn is omitted rather than sliced; empty copied context is explicitly flagged while the original survives. |
| Current owner is carried through the real sync wrapper | `RelationshipArchiveView.swift:954,988–995`; `RelationshipAskView.swift:3438,3859,4296` | Confirmed integration, not merely a store-only test. The earlier v1 busy-sync suspicion remains withdrawn. |
| Admission fingerprints match backend format | `RelationshipArchiveModels.swift:2525–2526` and updated screenshot continuity tests | Requires 64 lowercase hexadecimal bytes; no raw screenshot bytes enter the persisted recovery fingerprint. |

## Boundaries of this retest

- Artifact verification: all 27 files match the v2 manifest. `pnpm docs:check` passed documentation, wiki, and all three architecture-diagram checks after this report was written.
- The immutable creation fields, `contextWasTrimmed`, and optional `originKind: local` are present in the current backend contract. This reviewer does not substitute client declarations for canonical source ownership; the parent has separately assigned backend origin validation.
- New native accessibility containment and hit-target changes were inspected only for integration. No cosmetic tree shape was classified as a correctness defect, and no static check is presented as proof of successful taps.
- No Xcode, Simulator, XCTest invocation, real private data, credentials, or production writes were used. No implementation/test files were modified.
- This verdict applies only to frozen v2. A fix made later in the shared repository needs a new frozen patch or a narrowly identified follow-up verification for the remaining screenshot cases.
