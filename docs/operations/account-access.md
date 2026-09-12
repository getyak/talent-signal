# Account and workspace access

## Everyday access

Use the account's configured Google, Apple, or email/password identity. A federated
login does not create a default password. Web **Account and security** reports the
actual configured methods and active sessions from the authenticated backend.
Provider linking and password recovery are not implemented by this settings slice.

The avatar menu opens `/workspace/settings`, workspace management, and internal
test workspaces. Settings require a backend session and never use the legacy
fixture fallback. Profile names and workspace names are editable; email and
provider identity remain unchanged.

## Ownership and management

A new personal workspace explicitly belongs to its creator. Migration assigns an
owner to existing personal workspaces only when exactly one active real user is
the sole member. Ambiguous and fixture workspaces retain their existing roles;
they are not silently claimed. Ownership is separate from the existing
`admin`/`member` session contract so existing clients remain compatible.

Owners manage the space name, existing member roles/status, and transfer ownership
to another active real member. Admins manage the name and ordinary members; they
cannot grant admin privileges, change another admin, change themselves, or modify
the owner. Ownership is workspace-scoped, never platform-wide. This version does
not add invitations or a global multi-workspace identity migration.

Stopping a member or changing their role revokes their sessions. Reinstatement
requires a new login. Each user can revoke their other sessions; current-session
exit uses normal sign-out. Mutations recheck current authority, reject stale
revisions, and retain idempotency and an account-scoped management record.
Access-event details retain target IDs, member role/status transitions, ownership
transfers and actual session revocations in the same transaction. Profile and
workspace events retain revision changes without copying personal names into the
trail. Events predating migration `069_account_access_event_details` have unknown
(`NULL`) details; their history is not reconstructed. Replays preserve the original
event, and restoring membership never revives a revoked session.
These privileges do not authorize candidate-data collection or external effects.

## Default development fixture

Only an explicitly simulated, non-production seeded backend provides:

| Field | Development fixture value |
| --- | --- |
| Username | `cubxxw` |
| Email | `cubxxw@talentsignal.local` |
| Password | `cubxxw` |
| Workspace / role | `fixture-alpha` / admin |

Use the email in the Web email field. These are public synthetic fixture values,
not deployment credentials. Seeding resets fixture state and must not run against
the shared TestFlight or production database. The seed command refuses production
or disabled simulated authentication. Legacy configured default-account Web
providers are disabled in production, even if their flags are set.

Other `simulated_human` fixture identities have no password. Use the explicit
simulated API in local evaluations, or an isolated internal test workspace.

## Internal test workspaces

`/workspace/settings/testing` uses the existing server-controlled Lab capability.
A real signed-in user creates an empty, isolated test account for 1, 4, or 24 hours.
No shared test password is required. Entry credentials remain in encrypted,
HttpOnly cookies and the backend stores their hashes. The primary session stays
separate; a persistent banner returns the user to their own workspace.

Expired or mismatched test-session cookies fail closed. They never silently turn
an in-progress test action into a real-workspace write. Workspace requests carry
the rendered account scope, and stale tabs are refused if that scope changes.
The Web API ingress requires a rendered workspace identifier for task-history reads
and workspace mutations, including older tabs that already hold an analysis receipt.
Native image links and event streams retain their route authorization.
Login, public demo and extension protocols keep their own boundaries. Extension
task creation, exact task readback and keyed recovery use the existing session
fingerprint, verified by the route before accessing content. Response preferences
and artifact downloads also retain their stronger session binding. Standalone
contact pages share one authenticated layout and workspace identifier; clients
with a missing identifier refuse local API requests before network access.
Entering another test workspace requires returning first while a test cookie is
present; the existing credential is not overwritten by a sequential entry.
When the primary login is missing, leaving a test workspace clears only the local
test cookie and opens login recovery; a remote leave failure keeps retry state.
Screenshot analysis and telemetry also reject missing scope identifiers within
their routes before reading private payloads.
This includes telemetry creation, batches and completion, even when they precede
the primary product request: private trace content must use the same
`workspaceSessionFetch` boundary as the action it records. A rejected product
request cannot undo telemetry already retained under the wrong account.
Test data may contain synthetic or explicitly authorized testing material only;
isolation is not consent for external processing or retention.

Ending a test workspace revokes access before data cleanup. The UI distinguishes
cleanup pending/failed from verified deletion. New database tables must be
explicitly classified in the Lab cleanup manifest and account-scoped tables need
the Lab write guard. Unknown tables block creation/cleanup instead of silently
leaving data behind. Restore normal access before creating another workspace.

## Verification

The account integration evaluation requires the disposable `account_proof`
PostgreSQL database and `ACCOUNT_EVALUATION_DATABASE_URL`. Run migrations first,
then `pnpm --filter @talent-signal/backend exec tsx src/evaluation/runAccountManagementEvaluation.ts`.
It checks ownership, cross-account denial, replay/stale decisions, member
revocation, transfer, and the full isolated test-workspace lifecycle.

Credentials for deployed services remain in [Infisical](secrets.md). The Notion
home contains a short access reference; this document owns operational details.
