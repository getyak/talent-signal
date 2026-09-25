# Parent account-sync checkpoint, 2026-09-25

Status: implementation and independent review in progress. This checkpoint is
not release approval and does not claim native or live provider acceptance.

The accepted design lives in [ADR 0018](../../decisions/0018-unified-account-login-and-sync.md)
and [ADR 0019](../../decisions/0019-macos-system-authentication-handoff.md).
The remaining product observations are in the
[acceptance matrix](parent-acceptance-plan.md).

## Independent evidence so far

Parent tests use a disposable PostgreSQL 18 instance on loopback, synthetic
accounts and real backend functions or HTTP routes. The resident database and
real account ownership have not been changed.

| Check | Observed result | Boundary |
| --- | --- | --- |
| Normalized ownership and pending signup | Concurrent ownership, verification replay, expiry, pre-hijack and resend cases pass | Synthetic mailbox sink; no actual delivery |
| Account inventory | 10 cases pass, each negative preceded by an empty baseline | Includes deleted history, indirect Lab ownership and unknown owner columns |
| Retirement fence | Four controlled two-connection orderings pass | Database write fence, not a full UI recovery |
| Credential changes | Five parent cases pass after repair | Real password step-up; provider multiplicity uses synthetic identity markers |
| HTTP account state | Six cases pass | Separate auth sessions share account/user IDs; not three native clients |
| Reconciliation | Four normal/stale-proof cases pass; four additional transaction-boundary cases fail | Confirmed findings returned to Pi for repair |
| Web Person | Created through the actual form; HTTP readback has the same Person ID | Synthetic account on the candidate server |
| Web Session | Existing synthetic history opens; a message sent through Web persists in its queue | Model worker disabled; queued text is not a completed model turn |
| Actual Web refresh | Candidate browser crashes in the default timer implementation | Real browser exposed a gap missed by injected-timer tests |
| Native macOS OAuth cancellation | Installed app can leave both login controls pending | Existing runtime; replacement handoff is a separate implementation phase |

## Open review findings

The latest Pi repair request includes:

- Browser-safe refresh timers and refresh of the open Session, including local
  draft preservation, rather than only directory refresh.
- A supported Auth.js callback redirect before ordinary session mutation;
  temporary cookie mutation belongs in a Route Handler or Server Action.
- Original backend/session binding throughout staged provider proof, including
  Apple form-post and replacement-session rejection.
- Password-only accounts can bind their first provider through actual current
  password verification.
- Reconciliation validates credentials under stable locks, serializes session
  revocation, and advances the canonical credential revision after transfer.
- Native iOS Settings and active/foreground/network refresh are implemented and
  tested before declaring phase one complete.

The parent reproduced the database races with real queries and independent
transactions. A correct implementation may make the competing operation wait;
the regression harness must accept that verified ordering rather than create
an artificial deadlock by waiting for the rival inside the locked transaction.

## Remaining acceptance

Native iOS has not yet passed the planned UI checks. A parent probe is prepared
to sign in through the password form, compare the exact Web-created Person and
Session IDs, and observe a remote committed message while preserving a local
draft. It will run through the shared simulator guard after native integration.

Live Apple authorization, actual verification email delivery, the native macOS
handoff, bidirectional record updates, offline recovery and final revision
checks remain pending. No physical iPhone is currently connected. Mocked
provider claims and passing backend tests cannot close those rows.
