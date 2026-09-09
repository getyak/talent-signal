# GET-9 unscoped Web conversation review

Reviewed: 2026-09-09T17:33:06.555835+00:00. Independent reviewer: `design_review`. Product code was read
only. This records the initial unscoped Web increment before requested fixes.

## Outcome

One confirmed P1 remains open. Two P2 state/recovery defects also require
correction. The passing focused tests do not cover these paths. This review
must not be used to approve the unscoped Web flow or overall GET-9 delivery.

## P1: bind the request to the identity shown in the initiating UI

[use-workspace-chat.ts](../../../apps/web/components/relationship-workspace/use-workspace-chat.ts#L22)
uses `accountId` only for local state. Its request supplies no account/user/login
binding. [route.ts](../../../apps/web/app/api/workspace-chat/route.ts#L12)
authenticates whichever cookie currently exists, and
[workspaceChat.ts](../../../apps/web/lib/server/workspaceChat.ts#L15) creates a
Session after a 404 under that identity.

Concrete path: leave account A's workspace open in one tab; switch to account B
in another tab, changing the shared cookie; send or retry from the stale A tab
before its props refresh. The POST runs as B. A's Session UUID is absent in B,
so the helper creates a B Session and can read B's authorized private Memory.
The resulting B response is accepted into the hook state still labeled A.
The hook's account-change AbortController effect cannot detect an already
changed cookie while account props remain unchanged.

Bind the intent to the displayed account/user and actual login identity, then
compare that binding to current authenticated claims before Session reads,
creation or SDK execution. The existing Chrome handoff's signed identity-bound
pattern is reusable. Do not send an access token to the client. Add regressions
for a changed account and a same-user replacement login; rejected stale intents
must make zero backend calls. Keep retries bound to their original identity.

## P2: scope navigation splits visible history from the actual Session

[controller](../../../apps/web/components/relationship-workspace/use-relationship-agent-controller.ts#L145)
passes `null` to the hook while a relationship scope is selected.
[hook effect](../../../apps/web/components/relationship-workspace/use-workspace-chat.ts#L10)
then aborts and discards `active`, including its Session ID, but does not clear
`state.turns`. Returning to the same account's unscoped home displays those old
turns again. The next request creates a new empty Session while the UI presents
one continuous conversation. A follow-up referring to the preceding visible
answer therefore lacks that dialogue in the model request.

Preserve and restore the same Session after navigation, or clear both visible
history and active Session together with an explicit new-conversation state.
Test home conversation -> relationship -> home -> follow-up.

## P2: successful reply deletes a newer unsent draft

The start-panel textarea remains editable while `busy`. The new
[controller branch](../../../apps/web/components/relationship-workspace/use-relationship-agent-controller.ts#L436)
unconditionally calls `clearStoredDraft()` after a successful response. If the
user writes the next message while waiting, completion clears that new text.

Clear the submitted text when submitting, or only clear after completion when
the current composer still equals the submitted value and scope. Preserve new
text typed during the request. Add a deferred-response composer regression.

## Verified behavior and limits

- Unscoped ordinary input returns through `workspaceChat.ask` before the old
  contact-draft/UI-command planner; scoped commands keep their existing path.
- Requests use UUID Session/message keys; task idempotency remains stable for
  an unchanged pending objective. There is no automatic remote provider retry.
- The server retrieves canonical Session payload and appends a canonical task
  reference only after task completion. Expected revisions prevent overwriting
  concurrent Session updates. A lost save reply is handled by rereading turns
  and skipping an already present message ID. A conflict surfaces for retry;
  it does not silently merge or discard other turns.
- Deleted/inaccessible Sessions are rejected. Backend task admission and replay
  retain account/source availability checks, and Session mutation validates
  canonical task references. No source-lifecycle bypass was found in this
  helper. Those backend guarantees were inspected, not broadly re-tested here.
- The local-backend 404 fallback applies only when no explicit capture ID was
  requested; authenticated account context remains available for an empty
  workspace. Explicit missing captures still fail.
- The Calendar card is rendered only when its source request ID matches the
  canonical task ID. It generates an ICS draft after an explicit click and
  states that import confirmation happens in the Calendar app. It does not
  claim an external Calendar write succeeded.
- This Web review did not exercise Session resurrection races or actual source
  revocation against PostgreSQL, and did not rerun browser/Simulator journeys.
  The owner is conducting live UI acceptance separately.

## Independent checks

`workspaceChat.test.ts`, `workspace-chat/route.test.ts` and
`localBackend.test.ts`: **21/21 passed**. No hook/navigation/composer test was
present for the confirmed defects above. Documentation checks passed after
writing this review. Product code and prior evaluation failures were unchanged.

## Fix verification — 2026-09-09T17:37:31.931922+00:00

The three findings above are now **closed at code-review scope**. The initial
findings remain as historical evidence; this section supersedes their open
status for the reviewed implementation.

- **P1 identity binding closed.** `WorkspacePage` supplies an HMAC of the exact
  account/user/access-token/expiry claims. The binding reaches the hook via
  `initialSessionVersion` and is sent as `x-workspace-session`. The POST route
  reads claims once, rejects missing/different binding before parsing the body
  or calling the Session helper, and constructs its backend client with the
  access token from those same claims. The HMAC does not expose the credential.
  Real-HMAC route regressions independently passed for changed account, user,
  replacement token, expiry and missing binding, with no helper calls on
  rejection. Expired claims still return the typed session-expired 401.
- **P2 Session continuity closed.** The hook now receives `enabled` separately
  from identity. Entering a relationship aborts the pending request but retains
  the unscoped Session ID and pending intent. Returning home uses that same
  Session. Only account/login binding changes reset active context; rendered
  turns are filtered by that binding, so prior-login turns do not appear under
  a new identity. This closure is based on the implementation; a navigation
  interaction test was not independently run.
- **P2 composer loss closed.** The start-panel textarea is disabled while busy,
  preventing new text from being entered before the successful completion
  clears the submitted draft. Existing submit/composition guards remain.
- The widened desktop rail is scoped to the unscoped workspace. The mobile
  active-thread selector is wired to `data-has-conversation` and overrides the
  earlier hide rule. Actual mobile layout was not independently rendered in
  this verification, so this is not visual acceptance.

Independent rerun: the same three focused Web files now pass **26/26** tests.
Documentation checks passed after this update. No new confirmed P0/P1 was found.
No prior browser proof is counted as acceptance of this new binding, and no
claim is made about the still-running full iOS suite, the reported RTL failure,
or overall GET-9 completion.
