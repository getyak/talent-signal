# GET-5 iOS code review — frozen v1

```yaml
reviewer: evidence-safety-reviewer
lens: iOS correctness, evidence integrity, and asynchronous lifecycle
verdict: fail
score: null
confidence: direct
artifact: /tmp/get5-ios-review-v1/manifest.json
review_method: static source and test-contract inspection; no Xcode or Simulator execution
```

The frozen implementation has five actionable P2 findings below. “Direct” means the cited code contains the described transition; the proposed UI reproductions were not executed by this reviewer. The parent task owns current native runtime proof and any post-v1 repairs. No other review reports were read, and no production or test files were changed.

All iOS line references below name files under `/tmp/get5-ios-review-v1/apps/ios/`. The manifest hashes identify the exact reviewed copies. Backend files are read-only dependency evidence from the repository, not part of the frozen iOS snapshot. This is an implementation review, not a legal assessment or a claim that real-user workflow value has been established.

## Actionable findings

### IOS-1 · P2 · Saving an already-open proposal recreates its expired authority

**Location:** `Sources/Features/RelationshipArchiveModels.swift:1690–1704,1722–1729`; UI caller `Sources/Features/RelationshipAskView.swift:4788–4838`.

`saveContactProposal` prunes expired proposals before looking up the existing operation. When an open view still holds the expired `contactDraft` and its operation key, `previous` becomes nil. Saving the same draft therefore allocates a new capture time, source message ID, and seven-day deadline. The view's confirmation predicate checks identity lookup and nonempty fields, but never the protected proposal's current existence or deadline (`RelationshipAskView.swift:5430–5444`). Nothing observes removal from the store to invalidate that `@State` draft.

**User impact:** a proposal that should be expired remains confirmable, is represented as newly captured, and reaches `saveContact` at line 4852. Merely editing the still-open card can also recreate it. The user has not supplied fresh source information, and the recorded source authority is extended.

**Minimal correction:** distinguish creation from editing/approval of an existing proposal. For the latter, require the same active protected proposal, original source ID, and unexpired deadline; preserve pending outcome reconciliation separately. Clear or disable the open card when its protected proposal expires or is invalidated.

**Reproduction/test:** create a proposal at time T, retain its draft and key as the view does, advance the injected store clock to T + seven days, and call `saveContactProposal` with that key and `.newPerson`. It must return false, append no new source turn, and perform no capture POST. Repeat for an edit. The frozen `testProposalExpiryKeepsTheOriginalConversation` only checks that the expired proposal lookup returns nil; it does not attempt the subsequent save.

### IOS-2 · P2 · A delayed screenshot restore inserts live original-task controls into a fork

**Location:** `Sources/Features/RelationshipAskView.swift:3604–3611`, with `3576–3599` and `2652–2664`.

`restoreScreenshotTasks` captures the original Session and checks `originSessionID == nil` only before its first await. After a fetch returns, `recordScreenshotResult` resolves the mutable `activeSessionID` again. Forking is allowed while this restore is pending because restoring does not set `isSending`. Fork changes `activeSessionID` without cancelling the initial view task. The late original result is consequently recorded into the fork and added to its live `screenshotTasks` dictionary.

**User impact:** a copied, read-only conversation acquires the original screenshot's live detail card, including resume/cancel controls. `ScreenshotContactInlineResult` exposes the waiting/failed task detail at lines 7105–7119; its callbacks still address the original task. This defeats the otherwise-correct fork authority stripping.

**Minimal correction:** capture and carry the originating Session ID through restoration, recording, and binding. After each await, reject completion if that owner is no longer the active Session or is a fork. Give recording an explicit owner rather than reading mutable view state. Apply the same ownership rule to unstructured screenshot cancel/resume callbacks.

**Reproduction/test:** open an original Session containing a `waiting_for_user` screenshot; hold its restore GET in a controlled fake; fork while the request is pending; then release the response. Assert the fork still has only stale copied text, no live screenshot card, and no original-task resume/cancel path. The original Session's transcript identity should remain unchanged.

### IOS-3 · P2 · A late scoped response locally recreates a tombstoned Session

**Location:** `Sources/Features/RelationshipArchiveModels.swift:1298–1305,1325–1344`; completion caller `Sources/Features/RelationshipAskView.swift:4250–4268`.

`record(sessionID:)` treats an explicitly supplied but absent ID as available for creation. It never checks `syncTombstones`. Meanwhile `applyRemote` removes the Session and records its tombstone at lines 2611–2615. A scoped response that was already accepted before another device deleted the Session can complete after this tombstone has been applied. Its UI guard only checks cancellation, selected scope, and pending objective; all can still match in the visible view.

**User impact:** deleted conversation content and the late answer reappear in local memory and protected persistence. A later successful sync removes them again, but offline continuation or process termination can preserve the resurrected local state. The server-side tombstone still prevents canonical resurrection; this finding concerns the local display/cache boundary.

**Minimal correction:** when an append supplies a Session ID, require that same live Session to exist and reject any tombstoned owner. Return an explicit failure instead of allocating/reusing an absent ID. Retain an operation/owner generation through asynchronous completion so removal cannot be reversed by a callback.

**Reproduction/test:** begin a scoped Ask, hold its response, apply a remote deletion record through sync, then deliver the response and invoke the existing recording path. Assert the Session remains absent both immediately and after reloading persistence. Also test local deletion of the pending scoped owner. The frozen tombstone test ends after synchronization and never invokes a late recorder.

### IOS-4 · P2 · Offline activity extends Session retention beyond the canonical deadline

**Location:** `Sources/Features/RelationshipArchiveModels.swift:2252–2254,2309–2311`, with `2406–2414,2503–2509`.

Local expiration uses `updatedAt + 30 days`. Composer edits and feedback update `updatedAt`, so they extend retention of every prior message. Although `AgentSessionRemoteRecord` includes `expiresAt`, the store only checks it during `applyRemote`; it does not persist that deadline in `AgentSession`. The backend creates an immutable `created_at` and `expires_at = created_at + 30 days` (`apps/backend/src/modules/agentSessions.ts`, `mutateAgentSession`).

**User impact:** after editing a 29-day-old Session, an offline device continues displaying and retaining its sensitive transcript after the canonical 30-day deadline. Repeated edits can keep it locally indefinitely. This also gives the recruiter an apparently usable Session that the server has already expired.

**Minimal correction:** persist a fixed Session creation/expiration boundary, preserve it across edits, merges, and restart, and schedule local pruning against it. Use canonical `expiresAt` when available and a conservative fixed local deadline before first sync. Forking must not renew inherited source authority.

**Reproduction/test:** create at T, edit the composer or toggle feedback at T + 29 days, then advance to T + 30 days without syncing. Assert the Session and its retained proposal/source content are unavailable and remain unavailable after process restart. Test that a remote deadline survives a cache round trip.

### IOS-5 · P2 · Crossing a Session bound blocks unrelated new Ask requests

**Location:** `Sources/Features/RelationshipArchiveModels.swift:1208–1215,1322,2687–2704`; callers `Sources/Features/RelationshipAskView.swift:3803–3805,4238–4240`.

The client appends turns without checking the canonical Session limits. The current contract allows at most 200 turns, and `mutateAgentSession` rejects request bodies above 240 KiB (`packages/contracts/src/agentSessionSchemas.ts`; `apps/backend/src/modules/agentSessions.ts:362–364`). `synchronize` uploads every local Session and aborts at the first rejected PUT. Every canonical Ask requires this entire synchronization to succeed, including an Ask in a different newly created Session.

**User impact:** one long but ordinary conversation can become permanently unsynchronizable and prevent sending in unrelated Sessions. The next valid question cannot recover the oversized record; the user must discover and delete history to unblock the global gate. The screenshot path has a related unhandled boundary: its 21st accepted task fails `recordScreenshotTask` at lines 2465–2466 only after the server request has run, leaving recovery unable to attach that task.

**Minimal correction:** check the actual canonical payload/turn/task budget before admission and present a recoverable continuation path that preserves existing history. Prevent one unrelated rejected Session from being an unconditional global prerequisite for the current Session's Ask; still require canonical synchronization of the Session actually used for context. Do not silently truncate immutable messages.

**Reproduction/test:** use a synthetic 200-turn synchronized Session, accept one additional reply, then submit a valid question from a new Session. Assert graceful continuation or a scoped bound error, and that the unrelated question can proceed. Separately cross 240 KiB and the 20-screenshot limit, including response-unknown retry, without losing accepted-task recovery.

## Explicit checks

| # | Concrete check | Static result and evidence |
| --- | --- | --- |
| 1 | Two Sessions for the same relationship keep separate composer text and pending scoped keys through restart. | Implemented in per-Session fields and `beginAsk`; covered by `testComposerDraftAndPendingAskAreIsolatedBetweenSessionsOfTheSameRelationship`. Runtime not rerun here. |
| 2 | Concurrent transcript union preserves existing IDs/objectives/task identity and refuses incompatible identity. | `mergeRemote:2560–2588` checks immutable identity and unions remote order with local additions; backend validates the existing prefix. No additional defect established. |
| 3 | Background synchronization does not immediately reject Send merely because another sync is busy. | Checked the actual `RelationshipArchiveView:988–995` wrapper: it waits for the active sync before entering the MainActor store. The initial busy-sync suspicion is withdrawn. |
| 4 | Offline deletion is durable before network DELETE, and remote tombstones cannot be uploaded as a fresh canonical record. | `delete:1478–1498`, `applyRemote:2611–2621`, and synchronization of negative revisions implement the boundary. Late local recording remains IOS-3. |
| 5 | PUT/DELETE loss and conflicts preserve local state for a later list/readback. | Sync fetches current revisions before retry; server CAS and tombstones reject stale replacement. No general retry defect established; immutable-ID late completion is separately reported. |
| 6 | A proposal names its exact source message and visible field excerpts. | `saveContactProposal:1704–1728` preserves source ID/text; `stageAgentContactProposal:4613–4632` supplies message provenance; the card shows verbatim source/excerpts at 5511–5522. |
| 7 | Contact outcome-unknown state prevents editing, replacement, decline, and deletion. | Pending target is persisted before POST; guards at Models1694–1698,1784–1787,1483–1485 and UI5008 preserve the original operation. Existing tests cover restart. |
| 8 | Contact success is tied to readback and keeps the originating Session/source message. | UI4860–4895 checks result shape and calls `recordContactReceipt`; receipt identity is checked on retry at Models1359–1375. Canonical native test exists; it was not executed by this reviewer. |
| 9 | Expired proposal authority cannot be renewed by a stale open card. | **Fail: IOS-1.** |
| 10 | Session retention survives offline edits and process restart. | **Fail: IOS-4.** |
| 11 | Empty-input voice interception excludes committed text, whitespace, attachments, IME marked text, and toolbar regions. | `AskVoiceHoldPolicy` and `AskVoiceHoldSurface` provide explicit guards; `Get5AskInputPolicyTests` covers the predicate. Actual UIKit hit testing, keyboard focus, and accessibility remain native runtime proof. |
| 12 | Voice/Ask tasks are cancelled when the native destination disappears. | `RelationshipAskView:880–893` cancels named tasks and clears media; Ask completions check cancellation. Screenshot restore ownership still fails on an in-place fork, IOS-2. |
| 13 | Markdown rendering does not fetch image URLs, execute HTML, or activate arbitrary URL schemes. | `AgentMarkdownParser` renders HTML literally and image alt text only; links permit HTTP(S) with a host and no credentials. No automatic network effect found in this renderer. |
| 14 | Answer/code copy is a user action with a bounded device-local pasteboard. | `RelationshipAskView:7359–7363` and `AgentMarkdownCode` use `localOnly: true` plus five-minute expiry. Feedback is a reversible per-turn enum with a timestamp. |
| 15 | Regenerate retains the old answer and cannot silently reuse attachment-only evidence. | Callback sends the selected objective as a new request; controls exclude media, screenshot/proposal blocks, pending drafts, voice, and active sends at UI1254–1258. Native control behavior is not inferred from static code. |
| 16 | Share/fork strip live citation and action authority. | Export includes text and status notes, omits operational IDs; fork uses `readOnlyResponse`, empty receipts/pending approvals, and stale turns. Async screenshot restoration bypasses that boundary, IOS-2. |
| 17 | Screenshot admission preserves ordered input identity and capture time; interruption cannot replay its text as ordinary chat. | `AskScreenshotAdmissionPolicy`, `beginScreenshotAdmission:2441–2459`, UI3233–3240, and dedicated recovery UI implement this; frozen tests cover same/different image identities and restart. |
| 18 | Repeated screenshot status updates preserve the original transcript message, objective, and date. | `recordScreenshotTask:2468–2485` reuses those values; accepted admission clears only the matching token. Existing focused test covers update identity. |
| 19 | Session growth remains inside server limits without blocking other conversations. | **Fail: IOS-5.** |
| 20 | Native navigation has one owner and deferred external destinations return through the archive. | `RelationshipArchiveView:205–215,898–982` uses `navigationDestination` and deferred transitions. Interactive back, route lifetime, and actual sheet dismissal require the parent's native run. |

## Proof limits and handoff

- Verification: all 27 copied files match `manifest.json`; `pnpm docs:check` passed (documentation, wiki, and all three architecture diagrams).
- No real conversations, screenshots, credentials, or production endpoints were used.
- No build, XCTest, Simulator, or tap verification was run by this reviewer. Existing test source is coverage evidence, not a fresh passing result.
- The code paths above are reproducible with synthetic clocks and controlled async responses. Native timing tests are specifically requested for IOS-1/2/3; the report does not claim those UI sequences have already been observed.
- The evidence-safety release veto is expired proposal authority reaching capture (IOS-1). The fork/action, deletion, and retention defects must also be resolved before declaring the GET-5 lifecycle complete.
- Post-v1 fixes require a new snapshot or explicitly scoped verification; they do not retroactively change this frozen review.
