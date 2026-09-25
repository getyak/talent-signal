# Unified account acceptance plan

Status: in progress. Matrix rows define required evidence, not runtime success;
the [execution plan](../../../plans/2026-09-25-unified-account-sync.md) tracks results.

Owner: parent agent. Implementation/test receipts from Pi are inputs to an
independent review, not substitutes for the user-facing observations below.
Design: [account identity](../../decisions/0018-unified-account-login-and-sync.md)
and [macOS authentication](../../decisions/0019-macos-system-authentication-handoff.md).

## Identity and conflict matrix

Use synthetic identities in an isolated PostgreSQL database. Every successful
linked sign-in must return both the same account ID and the same user ID.
Authentication session IDs must differ by device.

| Scenario | Required observation |
| --- | --- |
| Password first, then Google or Apple email match | No second active account; no access or credential attachment from email equality alone |
| Google first, then password or Apple email match | Verified existing-account flow; adding password works despite historical user kind |
| Apple first, then password or Google email match | Same canonical user after explicit binding |
| Apple relay differs from primary email | Primary email stays stable; independently verified subject can bind |
| Provider verifies secondary email B, then B attempts verified signup | B remains reserved to the same canonical account; no second account or inherited password |
| Secondary-email claim races signup, changes on rebind, or survives unlink | Shared atomic arbitration, truthful verification provenance and retained ownership |
| Concurrent first signup, case/outer whitespace variants | One canonical owner; transaction loser gets recoverable conflict |
| Pending password registration, then verified provider signup | Unverified password cannot reserve indefinitely or become inherited login |
| Legacy password email unverified | Provider equality cannot promote or inherit its password |
| Subject already owned by another user | Protected conflict with no account/session replacement |
| Last login method removal, concurrent removals | At least one usable method remains |
| Historical duplicate with governed data or unclassified table | No generic reparent or deletion; exact protected reconciliation gap |
| Historical duplicate with indirect ownership or audit tombstone | Inventory sees differently named foreign keys; provenance retained |
| Historical truly empty duplicate, dual proof and current preview | Explicit canonical choice, atomic transfer, obsolete sessions revoked, audit/readback preserved |
| Empty duplicate owns several verified emails | All frozen owned reservations transfer atomically; changed or third-party claims refuse without partial movement |
| Old request passes authentication, pauses, then resumes after source retirement | Database rejects the late Person/Session write; neither account receives redirected data; receipt and credential transfer occur exactly once |
| Old product write commits while reconciliation waits on the shared account lock | Reconciliation observes the new data and refuses an empty transfer |

For every mutation: test expiry, replay, wrong provider, wrong origin, revoked
source session, stale credential revision, malformed input, rollback and retry.
Sensitive public errors must not expose provider lists or account contents.

## Test the production entry points

An integration claim must name the product entry point actually exercised.
Mock only the external boundary being controlled; do not manually manufacture
the operation, round or registration that the product entry point must create.
Retain a counterexample that fails before the corresponding repair.

- Web credential changes start through the real Server Action, continue through
  the Auth.js callback and completion Route Handler, and finish with backend
  readback. A helper-only proof is not a complete login or binding flow.
- Native operation tests invoke the same controller and request construction
  used by the Settings view. A separate reducer or stub sequence cannot prove
  Apple retry, frozen callback ownership, repeated operations or unknown outcomes.
- Refresh tests drive the registered product consumer into the real store,
  beginning with an existing Session and draft. Deliver new records, tombstones
  and a delayed successful response after a scope change; an empty-store
  deletion or a failed old request cannot establish those boundaries.
- Timing tests exercise production defaults. Client acceptance uses a runnable,
  normally signed Debug build with protected storage intact; a compile-only
  unsigned artifact does not establish Keychain or login behavior.
- Record unchanged source hashes or the exact commit for each receipt. Tests
  with controlled provider assertions remain separate from live Apple consent,
  mail delivery and observations in the actual clients.

## Real product synchronization

Use one disposable canonical account through three actual clients: iOS on the
allowlisted Primary iPhone, browser Web, and the native macOS window. Retain
same-record receipts containing only synthetic IDs and revision metadata.

| Action | Required cross-client observation |
| --- | --- |
| Web creates a Person | iOS and macOS display the same Person ID after foreground/active refresh |
| iOS imports a Person through the supported review/save flow | Web and macOS display the same Person/context IDs; completed in the actual clients |
| A supported client changes a Person | Other clients observe that revision; generic native Person editing is not present and is not claimed as tested |
| Web creates a durable Session with one synthetic message | iOS and macOS open the same Session/message IDs |
| iOS continues that Session | Web and macOS retrieve the new message under the same Session |
| macOS continues that Session | iOS and Web retrieve it without a fork or duplicate write |
| One client deletes the Session | Other clients remove it; an offline client cannot resurrect the tombstone |
| A client backgrounds, disconnects and reconnects | Both People and Session directories refresh; errors remain actionable |
| Another client changes data while a draft/IME is active | Draft, selection and scroll survive refresh; committed messages are not overwritten |
| A delayed response arrives after account/endpoint switch | Old content is rejected and cannot upload into the new account |

Measure healthy foreground propagation against the 15-second design target;
record source commit, client builds, backend revision, exact action timestamps
and observed timestamps. A mocked provider may prepare synthetic sync fixtures,
but it does not satisfy the live provider rows below.

## Real provider and delivery checkpoints

- Password signup: the configured mail adapter delivers a verification message;
  consuming it activates one account. Expired/replayed links fail. A missing
  transport produces an honest error and no logged/returned code.
- Apple native: real Apple authorization reaches the backend, whose validated
  subject resolves to the intended canonical identity.
- Apple Web: real configured HTTPS form-post callback succeeds and preserves
  original account during explicit linking.
- macOS Apple/Google: system authentication returns to the original window,
  establishes a distinct device session, and shares the same canonical data.
- macOS cancellation: provider cancellation, timeout and window dismissal restore
  buttons. Retry succeeds. Late prepare/cancel responses cannot corrupt the new
  attempt; late login cannot overwrite an intervening account switch.

Human Apple credentials/2FA or an owner-only credential-change step may require
the user's direct interaction. Prepare a concrete working flow first and keep
that precise checkpoint pending; injected claims are never recorded as live
Apple proof. Do not alter production account ownership merely to obtain green
test results.

## Delivery evidence

### Apple configuration readback, September 25

The existing authenticated Apple Developer page was inspected read-only through
the native Chrome accessibility surface. Services ID `com.talentsignal.web`
(`5FVS238KRK`) has Sign in with Apple enabled and is associated with primary App
ID `6RG2F8YY59.com.talentsignal.app`. Its website configuration contains the
existing tailnet domain and only the `:10443/api/auth/callback/apple` HTTPS return
URL. No Apple configuration was edited or saved. This verifies the intended
native/Web grouping, not actual provider callback or canonical-account continuity.
An isolated candidate origin needs an explicitly registered return URL before
its real Web/macOS Apple flow can pass.

### Native Apple authorization checkpoint, September 25 10:00

The normally signed iOS candidate was launched with the isolated endpoint
`http://127.0.0.1:44329`, which has a freshly migrated, empty acceptance database
and uses the production Apple JWKS verifier. The existing synthetic account at
`:44319` remains in its separate endpoint-scoped protected storage. A real tap
on Continue with Apple displayed the system message requiring an Apple Account
sign-in in device Settings. The backend returned a challenge but received no
Apple identity token and created no authenticated account or session.

The user was asked to complete the Apple Account sign-in directly in the
allowlisted Primary iPhone simulator. Live Apple acceptance remains pending;
neither challenge availability nor the system prompt is proof of authentication.
No production routing, provider configuration or account ownership changed.
See `native-apple-system-checkpoint-r20.json` and its system-prompt screenshot.

Independent review must close confirmed P0/P1 findings. Bind test/CI evidence to
the final source revision. Deployment, registered Apple grouping, real mail
delivery, historical conflict resolution and live platform acceptance each keep
their own status; one successful layer cannot stand in for another.
