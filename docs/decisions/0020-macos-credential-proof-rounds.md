# macOS credential proof rounds

Status: accepted design for the next implementation slice, 2026-09-25. Not
implemented or live-verified. Extends [system authentication](0019-macos-system-authentication-handoff.md)
and preserves [unified-account authority](0018-unified-account-login-and-sync.md).

## Outcome

An Apple-only or Google-only user can set a first password, remove a method or
connect another provider from macOS Settings, regardless of the age of the
ordinary login session. Each change proves the current identity for that exact
intent. The original WK account/user/session and unrelated drafts remain intact.

A recent session or another operation's step-up is not permission for this
change. Keep the existing current-password option. All provider proof rounds
run in ASWebAuthenticationSession, including the second provider in linking.

## Decision and user flow

Relay the existing credential operation's bounded provider round. Add an
allowlisted `credential_round` purpose with explicit `current` and `target`
roles. Keep ordinary `login` separate. There is no reusable reauthenticated
account flag, arbitrary OAuth proxy, or new credential store.

1. Settings freezes the account, user, session fingerprint, account/profile
   revisions, intent and target/removal provider shown to the user. The user
   chooses one currently usable method to verify this operation.
2. The native host opens the first-party authorization endpoint in the system
   browser. A current-provider proof must resolve to a subject already linked
   to that exact account/user. Matching email or an existing browser login is
   insufficient. Confirmation names the canonical destination and exact intent.
3. Returning to the original WK view redeems the current proof into one existing
   `credential_change_attempts` record. No login cookie is created or replaced.
4. Password operations show the new-password form in WK. Unlink completes only
   the frozen removal with the existing last-method guard. Link offers an
   explicit target-provider continuation using the same credential attempt's
   challenge. The target round cannot replace or refresh the current proof.
5. Read the operation result and current Settings before presenting success.
   A URL flag or visible provider row alone is not a mutation receipt.

A password-first link uses the existing password step-up, then the same target
relay. The unreleased direct desktop-link shortcut based on ten-minute login
age is superseded by this flow; it must not remain an alternative authority.

## Transport and frozen authority

Reuse the original WK sealed operation and round references. Native transports
only opaque flow/round refs plus its own state/S256 verifier challenge. Resolve
those refs from server-sealed state and compare current primary/effective
scope; expected DOM IDs are comparison constraints, never authentication.
Selected Lab identity must not fall through to the parent real account.

Desktop state persists immutable flow/round, role, exact intent/provider, actor,
session, revisions, credential snapshot, origin/backend, challenge, original
proof time/deadline, and native pairing/state/challenge hashes. A target round
requires the existing link attempt's exact challenge and secret held server-side
in WK state. Reject unsupported roles, including duplicate-account recovery.

| Entry | Authority and effect |
| --- | --- |
| Existing credential Server Action | Validate the rendered scope and freeze intent/role; capable native host gets a fixed request link, ordinary Web keeps its current flow |
| WK prepare POST | Resolve sealed flow/round, compare live session/scope under shared credential locks, freeze the round; set only this attempt's pairing cookie |
| System authorize | Create provider cookies in its own jar; use the frozen provider/challenge/role and attempt-specific sealed browser cookie |
| Provider approve | Consume the exact assertion/challenge once; current proves linked subject; retain verified metadata, not a new session or credential |
| Confirmation complete | Exact Origin/main-frame and one submitted immutable attempt/ref; emit only the owning one-use code/state callback |
| WK consume | Pairing/code/verifier/current scope and transactional freshness checks; current mints one credential attempt, target completes that existing attempt |
| Password/target continuation | Use the same operation and attempt; no revised scope or renewed current-proof deadline |
| Paired result POST | Read a durable result after uncertain consume; never rerun a mutation to discover its outcome |
| Paired acknowledgment POST | Confirm that the original WK request now carries the server-sealed continuation matching this result/flow; idempotently acknowledge only this round, then return to the fixed purpose route |

Native retains the owned navigation/generation policy from ADR 0019 through all
phases. Use the fixed `com.talentsignal.macos.auth://complete` callback: success
has attempt/code/state; cancel has attempt/state/outcome=cancelled, mutually
exclusive with code. Callback parsers reject fragments, duplicate/empty/unknown
fields and noncanonical paths. No tokens, attempt secret or provider assertion
enters URLs, DOM, display metadata or a general JS bridge. A new password is
entered only in the normal WK password form; it never enters OAuth/relay URLs,
page state, metadata or native bridges.

Use absolute deadlines: original Web flow at most600 seconds, provider proof
at most300 seconds, desktop attempt at most300 seconds and code at most60
seconds. The resulting credential attempt expires at the earliest applicable
proof/flow/normal deadline. Resealing state, target start, return or result read
cannot extend authorization. Store the original verification time.

Target authorize reuses the credential attempt's existing OIDC nonce/challenge.
Do not invent a new login challenge or reverse a hash. If exposing an expected
nonce from the backend, call it `oidc_nonce` and feed the exact expected value
to the provider; do not hash an already-normalized nonce a second time.

## Shared transaction boundary

Provider approve already consumes its challenge. Passing the same assertion
back into the public phase-one step-up API would consume it twice. Extract
private transaction-owned primitives while retaining one authorization path:

- Lock and check canonical account/user/live session, frozen revisions, origin
  and credential state with the same lock order as ordinary mutations.
- Mint a credential attempt from either a just-verified normal proof or an
  internally loaded, approved, unredeemed desktop current-proof record. Verify
  exact current subject ownership, intent and original deadline in that transaction.
- Complete the existing credential attempt with all secret/session/revision,
  password-policy, email-claim, last-method, audit and result checks. Desktop
  target proof is a private internal input tied to that exact target challenge.

Never expose a client-supplied `verified: true` or subject hash as public proof.
Desktop redemption, credential attempt creation and any immediate unlink/result
commit must share a transaction. Keep normal Web/native callers on these same
primitives and retain their existing regression tests.

All consumers of an existing credential grant use one acquisition order:
the desktop row owned by that request, if any; the existing grant; account,
user and live session; then provider challenge/assertion rows. Target prepare
locks its existing grant before account scope and inserts a new desktop row
afterward. Provider approval and cancellation include account locks acquired
indirectly by retirement-fence triggers in this order. A current round's new
grant is created within its transaction and cannot yet be held by another
committed consumer. A database deadlock mapped to a retryable HTTP error is
not evidence that the order is consistent.

The ordinary credential completion's consumed grant and exact account-access
event form the shared durable completion fact. They are written atomically and
matched by grant ID, account, actor, session, intent and outcome. Ordinary
completion must not acquire associated desktop rows after grant/account locks
just to copy a receipt. Result and acknowledgment first verify the original
live actor, then use nonlocking reads of this exact committed fact to select
receipt mode. Pending state retains its original revision and deadline guards;
an existing password, provider row, or consumed timestamp alone is insufficient.
Cancellation locks the grant and checks the same completed fact before any
desktop write. If completion won, report it truthfully; otherwise revoke only
the exact unused grant. Missing or inconsistent evidence stays unknown.

## Recovery

System cancel uses its own sealed attempt/state authority, then returns the
fixed native cancel callback. WK pairing is fresh random authority returned
only to WK prepare and stored as a hash by the backend. Never return it from
system authorize or reconstruct it from a database URL or other configuration.
If system cancel needs a second secret beyond state, generate an independent
random cancel-only capability and store its own hash; keep the two authority
types discriminated in the request contract. WK clears only its own pairing/continuation. Both
jar families use attempt-specific cookies: a delayed A response must not delete
a newer B. Consumed results cannot be relabelled cancelled. Cancellation of an
uncommitted target invalidates only that operation's unused grant.

On uncertain consume, issue an authenticated, paired, verifier-bound read of an
operation-specific durable result. A completed effect returns its immutable
receipt plus current Settings; its own revision increment must not make its
receipt unreadable. Pending continuations still require original revisions and
deadlines before any further write.

Current proof can create a credential attempt before the response is lost.
The baseline start API returns its random secret only once and is not a replay
recovery API. For relay-created attempts, derive a stable high-entropy secret
using HKDF-SHA256 from the random pairing secret with a fixed credential-secret
domain and immutable flow/desktop/credential IDs. Store only its hash. A paired
result read can regenerate that same secret after verifying native verifier and
original actor/session/origin; it never mints a second attempt. Keep pairing
authority until WK continuation acknowledgment or the original deadline.
Native retains that round's verifier, attempt and generation until this server
acknowledgment is confirmed or its deadline ends. Callback arrival, consume
dispatch and a generic WK didFinish are not acknowledgments. The fixed paired
acknowledgment POST must read the newly sealed WK continuation and compare its
flow/attempt to the committed result before acknowledging; normal page URLs or
display metadata cannot assert acknowledgment. The native host fences the whole
consume/result/ack navigation chain with its owning generation.

Only after current-round acknowledgment may target start. Target gets fresh
native state, verifier and generation while retaining the same credential
attempt, current proof and absolute deadline. Late current success, error,
cancel, timeout and navigation events cannot alter the new target round.

If the window closes and native verifier is lost, invalidate an uncommitted
orphan and require fresh proof. A possibly committed result remains unconfirmed;
do not report successful cancellation. Reopening Settings and seeing a provider
row cannot prove that a password was changed or justify an automatic second
write. Do not claim seamless recovery or repeat a possibly committed mutation.
Ordinary credential starts retain random secrets.

## Capability and acceptance

Expose an explicit new host capability/version only after the complete current,
target, result and acknowledgment protocol works. It must not inherit v1's
direct-link authority. Older native hosts show an actionable supported update
route; they do not launch an unsupported round or fall back to embedded Google.
Ordinary browser behavior is unchanged.

Required actual-consumer tests include older-session Apple-only/Google-only
first password; provider-first linking in both orders; password-first linking;
provider-proven unlink and last-method races; matching-email wrong subject;
role/challenge/provider swaps; old A form with B cookie or selected Lab;
concurrent revision/revocation under database locks; absolute proof deadlines;
Apple form POST without Lax cookies; cancel in each phase; old response after B;
and consumed-but-lost response recovered as the same attempt/result.

Use real Server Action, prepare, authorize, Auth.js callback, confirmation,
consume and password/target/unlink consumers. Controlled provider/transport
tests and PostgreSQL locks are distinct from actual-window Apple/Google and
post-login cross-client data evidence. This design adds no production migration
or provider configuration permission by itself.
