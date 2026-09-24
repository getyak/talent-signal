# One account, multiple sign-in methods, shared data

Status: accepted for implementation, 2026-09-25. Runtime acceptance is tracked in
[the execution plan](../../plans/2026-09-25-unified-account-sync.md).

## Outcome

A person recognizes one Talent Signal account by its primary email. Apple,
Google, and password are credentials for that account, not separate accounts.
Every linked method returns the same `account_id` AND `user_id`. People and
conversation Sessions remain the same records on iOS, Web, and the macOS Web
surface. Device authentication sessions are separate and individually revocable.

## Identity and uniqueness

Retain the existing `users`, `accounts`, `auth_identities`, and
`password_credentials` model. Do not re-key product data or caches by email.
Email lookup uses one shared trim/lowercase normalization rule. Do not collapse
Gmail dots, plus tags, or distinct domains, or rewrite Apple relay addresses.
Provider identity remains `(provider, verified issuer/subject)`; an email match
is a collision to resolve, not authority to read an existing account.

Enforce normalized-email uniqueness for real accounts in PostgreSQL and use
the same transaction/lock discipline across every registration provider. The
database must arbitrate concurrent password/Google/Apple registration. Fixtures
and explicitly isolated Lab identities retain their existing boundary.
Revoking membership must not free an email or revive an old credential.
Password sign-in must resolve a real password credential regardless of the
user's historical `kind`; attaching a password to a Google/Apple user must not
require changing that user's ID or provenance.

Existing collisions require an explicit transitional state. Reserve their
email against new accounts, report the conflict, and preserve each existing
owner's authenticated access until it is resolved. A migration must not pick
the earliest/newest/largest account, rename emails, merge credentials, or delete
records to make an index pass. A normalized-email reservation table with a
unique key and a nullable owner in conflict state is acceptable for this
transition; it is not permission to claim historical conflicts are resolved.
Normal new and linked accounts must have exactly one canonical owner.

New password registration must verify actual email ownership before activating a
canonical claim or admitting private product data. A pending registration is
short-lived and cannot reserve an email indefinitely or prevent a verified
provider's signup. Store only password hashes and verification-secret hashes;
rate-limit starts and attempts, expire and consume challenges atomically, and
return generic public responses. On successful verification, arbitrate ownership
in the same transaction; a concurrently created owner leads to sign-in/binding,
never attaching the pending password automatically. Existing password accounts
remain explicitly legacy-unverified until ownership is proven. Their passwords
are never inherited by an OAuth email match.

Use an explicit injectable transactional email delivery adapter, configured only
on the server, with an isolated test sink for tests. Production may never return
or log verification codes, use the test sink, or pretend an unconfigured delivery
transport succeeded. The parent is locating the user's existing email service;
its real delivery verification is a separate required checkpoint. Keep existing
sign-in and authenticated linking usable while email delivery is unavailable.

## Settings experience

Use the existing quiet account settings surface, with one vertical reading
order on desktop and mobile:

1. Account name and primary email.
2. **Sign-in methods**: Apple, Google, Password, each on one row. Show the
   provider account hint only after authenticated verification, never a token.
   States are Connected / Connect / Set password / Connecting / Needs retry.
3. **Data sync**: Contacts and conversations sync automatically. Show last
   successful observation and a Retry action only where truthful and useful.
4. **Devices**: separate device sessions, current-device label, revoke action.

Chinese copy: `登录方式`, `已绑定`, `绑定`, `设置密码`, `验证当前身份`,
`联系人与对话会自动同步到你的设备`, `离线，恢复连接后重试`.
Do not add a misleading global sync toggle or show backend identifiers in the
normal settings flow. IDs belong in deliberate diagnostics.

Binding starts inside an authenticated account and returns to that account's
settings. Show the exact effect before committing: adding a way to sign in does
not create a workspace, move records, or overwrite the primary email. Never
replace the current session with another person's provider session in a linking
callback. Provider cancellation leaves the original account and drafts intact.
Unlink requires recent proof and cannot remove the final usable login method.
Keep focus, keyboard, accessible labels, 44-point native controls, and narrow
layouts intact. Do not stack confirmation dialogs.

## Binding protocol and failure states

Require recent, explicit authentication to the current identity before credential
changes, plus independent proof of the new provider/credential. A fresh ordinary
session is not a blanket authorization for arbitrary future credential changes.
Create a short-lived, single-use, server-stored attempt bound to account, user,
current auth session, provider, intent, backend origin, expiry, nonce and revision.
Use hashed opaque secrets; exclude credentials and provider tokens from logs.
Preserve existing PKCE/state/nonce validation and Apple's cross-site POST cookie
policy. Recheck current-session validity and account ownership at commit.

Never accept client-supplied account IDs or email strings as identity proof.
Never reuse an ordinary login assertion as an unbound linking ticket. Already
linked to this user is idempotent success; linked to another user is a conflict.
Cancelled, expired, replayed, cross-provider, cross-origin, stale-tab, revoked
session, and concurrent link/unlink attempts must fail with a recoverable state.
Setting/changing a password uses the existing password policy and hashing;
changing an existing password requires current-password or equivalent verified
step-up. At least one usable login method must remain under concurrent removal.

### Web reauthentication without a password

A provider-only account must be able to add its first password, connect the
other provider, or remove a method after reauthenticating with a currently
linked provider. A mandatory "current password" field is not a usable fallback.
Offer the available current methods and name the operation being authorized.
For password setup, collect the new password after provider reauthentication;
do not carry a new password through OAuth redirects, URLs, or cookies.

Treat current-provider proof and new-provider proof as distinct purposes. Bind
each OAuth attempt to the original account, user, backend, session fingerprint,
operation and current credential/profile revisions before leaving Settings.
Retain the original proof time and revisions; a second transaction must not
rebind an old proof to new settings or grant it a fresh validity period.

Apple returns a cross-site form POST. Its transient operation-intent/proof
cookies must have a deliberately reviewed Secure/SameSite policy, while the
normal long-lived session cookie keeps its existing policy. Do not assume a
SameSite=Lax login or linking cookie accompanies that POST. Preserve explicit
operation purpose through the callback and stage a short-lived, one-use proof
without creating/replacing a login session or attaching a credential. Redirect
to a fixed same-origin completion route where the normal session is available,
then recheck the unchanged original session and revisions before consuming the
proof and creating/completing the credential attempt. Store any staged provider
proof encrypted and bounded on the server or in an appropriate HttpOnly sealed
transport; only opaque references may appear in a URL. No bearer tokens or raw
provider tokens enter page state or URLs.

A missing, cancelled, stale or wrong-purpose linking/reauthentication attempt
must fail closed and return to Settings. It must never fall through to ordinary
login, replace the account, or report success because a callback URL contains a
success flag. Success requires authoritative backend settings readback.

Unbound OAuth with an existing email says to sign in with an existing method,
then connect the new method in Settings. Do not create an empty second account.
Public errors must not disclose names, data counts, linked provider details or
workspace information. Authenticated recovery can explain the exact conflict.

Apple relay email may differ from primary email. Binding is possible after both
ownership proofs without changing the primary email. An email owned by another
Talent Signal user still requires explicit conflict resolution. Apple iOS App ID
and Web Services ID configuration must be checked for the intended grouping;
code alone does not prove live Apple identity continuity.

## Historical duplicate resolution

An authenticated conflict screen explains that historical accounts have separate
data. Verify both credentials before showing cross-account counts or proposing
a reconciliation. Reconciliation has prepare/readback/confirm/commit/readback
phases, a frozen revision, an audit receipt and idempotency. Preserve all data and
provenance. No production conflict is resolved by this ADR or by an automated
test alone.

For an entirely empty duplicate, support a narrowly scoped credential transfer
to the explicitly selected canonical user, retiring the redundant login with
an auditable alias/tombstone and revoking its old sessions. "Empty" must use the
full classified account-data inventory, not only People and agent_sessions.
Recheck emptiness and identity ownership inside the transaction. Never transfer
roles/owner privileges from an unrelated multi-member workspace.

Freeze both parties' account/profile revisions and proof timestamps during
prepare. Under the commit transaction's stable lock ordering, compare them and
recheck the initiating session's current validity before any transfer. Removing
or changing either proven credential invalidates the prepared request, even if
the duplicate remains empty. A request that passed the HTTP authentication
guard before session revocation cannot use its cached context to commit later.

Retirement must also close the in-flight-write race. Revoking an auth session
does not revoke an already admitted request, and retaining an account/user
tombstone leaves ordinary foreign keys valid. Keep a persistent active/retired
state on the account row. Every governed write transaction must take a shared
row lock on that same existing account row and verify it is active before the
mutation, retaining the lock until commit. Database guards must cover classified
direct and indirect ownership and background writes, checking both OLD and NEW
account scopes when applicable; unknown coverage fails closed. Do not lock only
an optional retirement record. Existing retention/maintenance exceptions, if
needed, must be narrow and explicit, not a general bypass.

The reconciliation transaction locks both account rows exclusively in a stable
order, then repeats the complete inventory. If a product write acquired its lock
first, reconciliation sees that committed data and refuses the empty transfer.
If retirement wins, the late write sees retired state after waiting and fails
without changing either account. Transfer credentials, revoke old sessions,
write the receipt, and finally mark the source retired in one transaction. Never
silently redirect an old product write to the canonical account. New source
sessions and credential changes must also be rejected after retirement.

If both accounts contain governed data, do not implement a generic account_id
SQL rewrite. Present a protected review-required state and a concrete inventory
for a separately reviewed migration. All data remains accessible through its
original authenticated boundary. Any unresolved collision remains an explicit
acceptance gap; never report universal email uniqueness while it persists.

## Synchronization contract

People use the canonical backend directory. Conversation Sessions use the
existing `/v1/agent-sessions` contract and stable session/message identifiers.
Retain account AND user ownership, revision checks, tombstones, retention,
authorization, conflict copies and local recovery. Private conversations retain
their explicit privacy semantics and do not become durable shared history.
This work does not silently change the current 30-day conversation retention.

On startup, foreground/focus, connectivity recovery and relevant mutations,
refresh BOTH People and Sessions. Use bounded visible-page refresh for changes
made on another active device; pause background polling and coalesce in-flight
work. A healthy two-client foreground scenario should observe the other client's
saved change within 15 seconds, measured in acceptance. Reuse existing directory
cache invalidation and scoped fetch patterns where possible.

Refresh must preserve search, scroll, selected conversation, composing text,
IME composition and pending local writes. Guard every async completion by the
original endpoint/account/user session generation. Changing accounts clears the
old projection and cannot upload old drafts into the new account. Failed sync
preserves recovery without marking work synchronized. Deletes propagate and
offline resurrection is rejected. Prefer one shared refresh coordinator per
surface over independent timers for every component.

## Evidence required

- PostgreSQL integration: all provider registration orderings, case/space
  variants and concurrent duplicate attempts, historical collisions, credential
  ownership, step-up/replay/revocation, last-method removal and rollback.
- Every linked login returns identical account/user IDs; each isolated user is
  denied the other's People and Sessions. Verify binding a password to a
  Google/Apple-created user explicitly.
- iOS and Web tests: foreground refresh, offline recovery, stale response after
  switching accounts, deleted history, preserved draft and scroll, visible errors.
- Real browser and iOS Simulator interaction with disposable synthetic data,
  plus the macOS WebKit surface. Capture screenshots and exact record-ID readback
  for bidirectional People/Session changes, not just list counts.
- Live Apple OAuth must be exercised separately from injected verifier tests.
  If Apple requires a person's credentials/2FA/system confirmation, leave that
  exact checkpoint visible and request only the required human action. Never
  describe simulated Apple assertions as real Apple sign-in.
- Independent review closes confirmed P0/P1 findings; exact-head applicable
  checks and deployment/readback evidence are separate gates.

## Sources and alternatives

The chosen design extends the current account model. A second global user model
or broad workspace graph migration would enlarge risk without improving the
normal binding experience. Silent email-based linking and resetting caches by
provider are rejected because they can grant authority or split history.

- [Google OIDC identity](https://developers.google.com/identity/openid-connect/openid-connect#obtainuserinfo): use subject as provider identity.
- [Auth.js account-linking errors](https://authjs.dev/reference/core/errors#oauthaccountnotlinked): do not enable dangerous automatic email linking.
- [OWASP authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html): reauthentication for sensitive changes.
- [Apple relay](https://developer.apple.com/documentation/signinwithapple/communicating-using-the-private-email-relay-service): relay addresses are distinct identity hints.
- [Apple app grouping](https://developer.apple.com/help/account/capabilities/group-apps-for-sign-in-with-apple): group related native and Web identifiers deliberately.
