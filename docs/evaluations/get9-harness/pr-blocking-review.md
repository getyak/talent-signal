# GET-9 PR 172 blocking-review follow-up

Date: 2026-09-10. Reviewer: independent design_review agent.
Baseline: `630961ea`, followed by the parent's uncommitted blocking-review fixes.
The reviewer changed only this evidence document and ran no model, database
migration, Simulator operation or deployment.

## Current decision

All four original blocking threads can close within their stated scope. Both
P1 defects and both P2 defects are addressed, including the follow-up recovery,
expiry and old-sign-out issues found during this review. No confirmed P0/P1
remains in this delta. The final native result and real SDK probe have been
independently read back below. This is not a full-suite or release claim.

## Calendar sync preference

The original `DeviceCalendarHandoffView.sync` checked sync-off only inside its
optional canonical-activity/store branch. Agent cards supply neither, so they
could proceed to EventKit despite the setting. The new unconditional guard
blocks the Agent path before claiming or calling EventKit. Its failure text
does not claim canonical storage. Existing canonical saves can still finish
in-app with sync disabled.

The EventKit operation now holds a `RuntimeWorkRegistry` write lease through
the asynchronous call and receipt handling. Account maintenance/transition
cannot begin during that operation. The lease is released on claim failure and
after every asynchronous result. This is not a claim that Simulator tests prove
physical-device EventKit or Data Protection behavior.

## Calendar clock and continuation

Before the fix, an independent no-network probe of the actual compiled
calendar capability and continuation fingerprint used two clocks one second
apart on the same day: system prompt, tool description and fingerprint all
changed. `harnessSessions.ts` invalidates the old binding and deletes mirrored
entries on that mismatch, confirming the review's continuation regression.

The new static policy and tool description point to the current request's
`context.calendar_clock`. Both Claude entry points include that dynamic field.
The clock still supplies frozen reference time, timezone and local dates;
tool-side source, timezone, duration and human-review rules remain unchanged.
Policy/configuration changes still alter the fingerprint. Independent focused
Agent tests passed 15/15, including unchanged continuation identity across
changed dates/timezones and changed policy producing a different identity.
This unit evidence does not itself prove SDK resume over a real transport.

## Protected, scoped native calendar receipts

The original global files/UserDefaults retained candidate titles and event
details without the repository's explicit scoped protection. The replacement
uses endpoint/account/user scope injected at `RuntimeWorkspaceRoot`, complete
file-protection write options plus explicit attributes, and backup exclusion.
No authorized scope fails closed. Legacy details are redacted into opaque
hashed-filename markers rather than assigned to an arbitrary account.

Pending/unknown records contain only state; successful records retain actual
saved-event readback. Expiry and sign-out replace details with markers rather
than removing the duplicate-write guard. This preserves uncertainty when
EventKit may already have committed. The follow-up startup sweep scans all
expired receipts without requiring an exact-source read. Sign-out cleanup uses
the original ending's `startedAt` cutoff so retrying an old ending preserves
receipts written after that cutoff. Source review confirms both added tests
exercise those previously missing boundaries.

Expiry is opportunistic on store construction/read, not an operating-system
background deletion guarantee. Cleanup failures can retain protected files for
a later retry. Simulator assertions explicitly allow absent Data Protection
attributes; physical-device assertions still require `.complete`. A Simulator
pass must not be described as physical-device protection verification.

## Chrome reviewed-image recovery

The original panel stored its request key and reviewed envelope only in memory.
The new trusted-context local journal holds at most 20 short-lived operation
records, with a 30-day retention boundary: origin, opaque session binding,
request key, creation time and completion flag. No pixels, title or excerpt are
stored. Serialized worker operations claim before submission, preserve the
original key and block a second unresolved key for that session/origin.

Recovery uses a read-only query for the original key. The Web session binding
is checked before forwarding, and backend lookup is restricted to the current
account and creating user, returning task ID/status only. Deleted/expired tasks
are reported unavailable and are not recreated. Same-user replacement login
does not inherit the old binding. A missing receipt remains unknown.

Follow-up fixes retain a completed record after initial success and claim only
after a valid destination tab is ready. A definite pre-submit session rejection
is marked `no_submit` and may safely release the claim. Independent direct
loading of the real worker with a synthetic Chrome API confirmed initial
success retains one recovery record and a pre-submit redirect creates none.
Independent extension tests passed 40/40.

The last follow-up P2 was the equivalent reply-loss window in `recoverHandoff`
itself. This is now closed: both `received` and `unavailable` mark the operation
completed rather than removing it before the panel receives the result. An
independent no-network probe loading the actual final service-worker module
with a synthetic Chrome API confirmed recovery leaves one completed record.
At the 20-record cap, only the oldest completed record may be evicted; pending
records are not capacity victims. The added regression exercises that boundary.
Final extension log `/tmp/get9-review-extension-final.log` reports 41/41 passed
and package validation of 10 required files and nine local scripts.

## Final native and SDK evidence

Independent `xcresulttool get test-results summary` on
`/tmp/get9-ios-full-latest-dd/Logs/Test/Test-TalentSignal-2026.09.10_06-59-23-+0800.xcresult`
returned Passed, 49 passed, zero failed and zero skipped. The aligned
`/tmp/get9-review-calendar-fourth.log` identifies 13 AppSessionEnding and 34
RelationshipCapture unit tests, plus two UI tests. Sync-off completed in 6.768
seconds, and the production-confirmation/real-EventKit-readback case completed
in 10.436 seconds. The sync-off test asserts the service remains in its
before-confirmation state and that no saved UI appears. This is an iOS 26.5
Simulator result; physical-device protection remains a separate boundary.

The reviewer read the real probe implementation
`scripts/evals/probe-claude-calendar-continuation.mjs` and final output
`/tmp/get9-review-live-clock-continuation-second.log`. Three real Hao SDK turns
completed in the same SDK session, mirrored 28 entries, and took 18.166 seconds.
The second prompt contains no prior random code but recalls it exactly. The
continuation factory rejects any fingerprint change, including across the
different request dates. The third result correctly stages the year-end
relative-date request at 2027-01-01 07:00–07:30 UTC in Asia/Shanghai; no calendar
event is written. The probe finds zero owned main-session resume transcripts
remaining. It uses an in-memory host SessionStore and does not establish a new
product-database continuation or native Calendar integration pass.

The parent reports backend recovery tests 18/18. The first live probe's setup
failure from the wrong proxy port, earlier Simulator protection-attribute
failure, and mixed-build compilation failure remain retained, not counted as
product passes. The earlier full-suite and model-quality failures likewise
remain distinct historical results. These targeted checks justify closing the
four reviewed defects without claiming every GET-9 acceptance gate is complete.
