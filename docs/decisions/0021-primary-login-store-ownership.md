# ADR 0021: Primary-login browser-store ownership

Status: accepted for the local candidate; implementation and app-level acceptance
are required before delivery. This grants no provider, production, preference,
installed-app or release mutation outside the existing task boundary.

## Context

The macOS wrapper already isolates persistent WebKit storage by canonical
origin. Within one store, response order can still change the effective login:
a delayed A response can install its HttpOnly session cookie after B has signed
in. Ignoring A's native callback does not reverse Set-Cookie. Password login,
logout and Auth.js session refresh also write this cookie; a lock around only
native OAuth consume cannot cover the whole browser.

The r32 disposable WebKit experiment confirms shared-store contamination and
isolation using distinct persistent identifiers. With an explicitly persistent
synthetic cookie and graceful shutdown, a separate process reopened B and sent
its cookie. This is bounded API evidence, not crash recovery or application
acceptance. The first two probe variants did not establish persistence; their
receipts remain preserved. Apple supports identified persistent data stores on
macOS14 and later, matching the project target.

## Decision

Use the existing origin store selection with one active identifier and epoch,
plus a small durable uncertainty journal. Do not introduce a customer-facing
profile manager, copy cookies, place provider credentials in native storage, or
change server account/session ownership. Canonical account and user IDs still
own synchronized People and conversation Sessions; a store identifier is only
local browser routing metadata.

### Primary login versus credential settings

Keep the selected store during ordinary workspace use and every current/target
credential-setting round. Adopt the legacy deterministic origin UUID once for
existing installations so their current workspace does not reset on upgrade.

A new primary-login flow starts from a first-party login entry in a fresh store
whenever any old session-cookie writer may remain. This is the default for a
later explicit login, identity switch, unresolved restart or abandoned login.
Choose and persist the new store **before** displaying its password form,
preparing provider proof or dispatching any authentication request. Never move
or replay an existing password POST, OAuth code, challenge or prepared consume
into the replacement store.

The already-selected login-entry store can host that flow's validation retries
and current provider choice before a potentially committing request is pending.
A second primary flow cannot supersede a possibly committing exchange in the
same store. Only the lease-owning host displays an interactive primary-login
form. Its actual Web password/provider controls share a synchronous single-flight
submission gate, including Enter, alternate-method clicks and rapid retries;
a React render-time disabled flag alone is insufficient. Native provider entry
also checks that same active flow. An uncertain password/fetch result keeps
alternate methods and duplicate submission blocked and offers an explicit new
first-party login entry. A durable marker protects restart; it is not a
concurrent-submission gate. Retrying after an uncertain commit starts again from
the first-party entry in a newly selected store. Credential binding remains in the original
logged-in store; it does not rotate or replace the primary login cookie.

### Durable selection and process ownership

One coordinator owns each origin across all hosts. Each immutable lease includes
origin, store UUID, store epoch, host ID and operation ID. An OS-backed process
lock prevents a second app process from independently writing that origin's
selection; additional hosts in the owning process use the same coordinator.
The OS lock uses a stable separate lock identity; do not lock the journal inode
that atomic replacement will replace. Lock failure is an actionable unavailable
state, not permission to use the old UUID. Do not infer exclusivity merely from a SwiftUI Window declaration.

Persist the selected UUID/epoch and an unresolved login-entry marker atomically
and durably **before** loading that entry. Marking uncertainty before exposing
the login form conservatively covers fetch-based password/session writers that
a navigation delegate cannot observe. The journal contains no bearer token,
password, verifier, pairing secret or provider assertion. Use an atomic file
replacement with file and containing-directory durability, bounded schema and
private permissions; an asynchronous preferences update does not prove ordering.
If persistence fails, do not load or dispatch the new authentication flow.

On restart, unresolved state cannot select the prior store for authentication
writes. Persist a new selection before constructing the replacement host. A
missing/damaged previously initialized registry must not silently fall back to
the legacy UUID. Distinguish the one-time legacy adoption from damaged state.

A session installation is settled only after its actual HTTP response and a
correlated, same-store authenticated readback identify the canonical account
and user. Use a read-only first-party status consumer where password login lacks
a native consume receipt. It returns only safe status/actor metadata after real
active backend-session validation and emits no Set-Cookie, with no-store cache
policy. Do not reuse Auth.js /api/auth/session, which can re-sign the session
cookie. DOM state, a Settings URL, a backend committed fact alone, or a generated
native message cannot settle installation. No status read is allowed to mint or
replay a login or credential mutation. A successful status read proves only the
session observed in that request, not that all older cookie writers have settled;
when the password fetch response is not observable to native code, keep the
conservative uncertainty/rotation rule for the next primary login.

### Retire the whole old epoch

Selecting a replacement store retires every old WorkspaceBrowser/controller,
including hidden hosts and retained callbacks. Reconstruct SwiftUI/WK state by
`{origin, storeID, epoch}`, not origin alone. WKWebView copies its configuration
at initialization; changing a configuration object cannot switch an existing
view's jar.

Old responses may affect only the quarantined old store. They cannot select an
old UUID, navigate a replacement host, release its lease or clear its journal.
Every asynchronous transition checks its captured lease. Origin switching and
window reopening consult the same durable registry. A late refresh/logout from
an old epoch is isolated just like a late OAuth consume.

Do not delete quarantined stores during recovery. They may contain unsent,
account-scoped local content. Preserve it without copying it into a different
identity. Later bounded cleanup may remove a specific unreferenced store through
WebKit's public API after all its views are released; never enumerate old stores
and automatically reselect or delete them. Store rotation does not revoke a
backend session that may already have been created, undo a credential mutation,
or establish that an abandoned operation was cancelled.

## Product behavior

Normal workspace use and Settings binding remain quiet and continuous. An
uncertain login offers a real read-only result check and a deliberate new login;
use plain copy such as “尚未确认登录结果”, without exposing cookie/store/epoch
terminology. New login preserves cloud data and does not delete quarantined
local drafts. Do not promise immediate recovery of local-only drafts into the
new account or show a no-op retry button after its authority has been lost.

## Acceptance and limits

Required app-level evidence, beyond the r32 API experiment:

1. Two real hosts share one active lease; a pending session-writing A prevents
   same-store B. A deliberate replacement constructs B in a different selected
   store before proof/input, and late A cannot affect any active B host.
2. Repeat held-response ordering for native consume, old JWT refresh and logout;
   server-authenticated readback from B stays B. Credential rounds still use the
   same primary store and preserve login cookie/People/Session identity.
3. Terminate/relaunch around journal persistence, server commit before response,
   response before receipt and new-store selection before login. Unresolved old
   stores never re-enter. Graceful persistence is not crash durability evidence.
4. Test process lock contention, failed atomic persistence, damaged initialized
   state, same-origin host reconstruction, origin switching and stale callbacks.
5. Run actual password/provider primary login entry and truthful recovery UI;
   preserve unsent local state without exposing it to another account. Use only
   disposable test registries/stores when exercising this behavior locally.

No new backend schema or generic profile system is required. If implementation
cannot enforce these store ownership boundaries, keep primary-login support
unaccepted instead of treating response cancellation as cookie rollback.

## References

- [WebKit persistent profile API](https://webkit.org/blog/14423/building-profiles-with-new-webkit-api/)
- [WKWebsiteDataStore](https://developer.apple.com/documentation/webkit/wkwebsitedatastore)
- [ADR0019 system authentication handoff](0019-macos-system-authentication-handoff.md)
- [ADR0020 credential proof rounds](0020-macos-credential-proof-rounds.md)
- [Independent store-ownership review](../evaluations/account-sync/login-store-ownership-review.md)
- [r32 WebKit probe review](../evaluations/account-sync/login-store-boundary-r32-review.md)
