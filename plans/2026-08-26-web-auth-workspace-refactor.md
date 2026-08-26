# Web authentication and workspace ownership refactor

## Outcome

Talent Signal Web must recover from stale Auth.js sessions, offer a real
server-verified username/password registration and sign-in path, include the
local administrator `cubxxw`, and begin moving the relationship workspace away
from component-owned transport and canonical state.

This matters because the current login page can be poisoned by an unreadable
JWT, while `relationship-workspace-app.tsx` owns transport, canonical
readbacks, drafts, recovery, and presentation in one client module. A polished
surface cannot compensate for unclear authority ownership.

## Scope

In scope:

- a versioned Auth.js session cookie and stable local-development secret;
- backend-owned password credentials, registration, sign-in, throttling, and
  account-scoped sessions;
- a seeded local administrator whose username and password are both `cubxxw`;
- Web sign-in and registration UI with explicit failure and recovery states;
- passing the authenticated backend session into at least one complete Web
  workspace path instead of silently assuming the fixture user;
- one extracted workspace transport/owner boundary with focused tests;
- browser proof of sign-in, registration, redirect, workspace readback, and
  stale-cookie recovery.

Out of scope for this slice:

- external OAuth redesign;
- production email verification or password-reset delivery;
- broad visual restyling of all relationship workflows;
- claiming the 10,000-line workspace is fully decomposed after one extraction.

## Current evidence

- `apps/web` has no `.env.local`; the login availability check therefore
  renders “This workspace is not open yet.”
- `app/login/page.tsx` calls `auth()` before offering recovery, and Auth.js logs
  `JWTSessionError` when an older cookie cannot be decrypted.
- the current credential provider accepts only one environment-configured
  email account and has no registration model.
- the shared backend already owns accounts, users, and sessions, but exposes
  only simulated local login and Apple identity login.
- `relationship-workspace-app.tsx` performs dozens of direct fetches while also
  owning drafts and presentation state.

## Chosen approach

1. Add password identity to the shared backend rather than create a Web-only
   account file. Password hashes, failure windows, account creation, and bearer
   sessions remain server-owned.
2. Use a new versioned Auth.js cookie name so unreadable legacy JWT cookies are
   ignored instead of decoded on the login render. Keep the development secret
   deterministic and require an explicit production secret.
3. Store the backend access token only in the encrypted, HTTP-only Auth.js JWT
   and expose account identifiers/role to server code. Do not put the bearer
   token in client-visible session data.
4. Make login and registration two states of one calm access surface. The
   built-in administrator is a local seeded account, not a quick-login bypass.
5. Extract a typed Web backend client/command owner and migrate one complete
   workspace path before expanding the decomposition.

Rejected:

- clearing every cookie from a client effect: it still logs once, couples
  recovery to JavaScript, and does not prevent recurrence;
- another environment-only default account: it does not satisfy registration
  and keeps identity outside the shared authority boundary;
- a JSON credential file in `apps/web`: it creates a competing account source
  and unsafe concurrent writes.

## Milestones and proof

1. **Session recovery and contracts**
   - migration and contract tests cover password identity, role, duplicate
     account rejection, password verification, and lockout;
   - an old Auth.js cookie does not produce a login-page JWT decode error.
2. **Working account access**
   - `cubxxw / cubxxw` signs in and reaches `/workspace`;
   - a newly registered account can sign out and sign in again;
   - invalid credentials and duplicate registration remain on the form with a
     specific, non-enumerating error.
3. **Workspace owner slice**
   - an authenticated Web route uses the signed-in backend session and cannot
     fall back to another account;
   - transport and recovery state for the selected workflow are outside the
     page-sized presentation component and tested independently.
4. **Verification**
   - focused tests, lint, typecheck, backend checks, and Web build pass;
   - the real browser shows login, authenticated workspace, sign-out, and a
     second login without console errors.

## Design read

Primary surface: desktop knowledge workspace access and Today retrieval.
Audience: an independent recruiter returning to governed relationship work.
Character: quiet, restrained, and explicit at the authentication boundary;
high information density begins only after identity is established. The access
surface answers “which governed workspace am I entering?” Today answers “what
deserves attention now?” Canonical objects remain Account, User, Pursuit,
Proposal, evidence-backed state, Action, and Receipt. Authentication grants
account scope only; it grants no evidence truth or external-effect authority.

## Resume notes

Keep one owner for authentication state (shared backend), one encrypted browser
session projection (Auth.js), and one owner for each workspace command group.
Do not move fetch calls into hooks that merely rename the same mixed ownership;
extract typed commands/readbacks and preserve unknown outcomes explicitly.

## Completion evidence

Completed on 2026-08-26:

- Auth.js now uses the versioned `talent-signal.session-v2` cookie and a stable
  local-development secret. The browser retained the unreadable legacy cookie
  during verification without producing another `JWTSessionError`.
- The shared backend owns scrypt password credentials, generic failed-login
  responses, a six-attempt temporary lock, registration, account creation,
  roles, and bearer sessions. The seeded `cubxxw` user resolved as
  `password_human / admin` in the existing `fixture-alpha` account.
- The Web JWT contains the backend bearer token only inside the encrypted,
  HTTP-only session cookie. Client-visible session data contains the account
  projection and role, not the bearer token. Backend expiry now removes the
  authenticated Web projection and raises an explicit boundary error instead
  of falling through to the fixture account; local sign-out still succeeds
  when backend revocation is unavailable.
- Browser proof covered administrator sign-in, sign-out, registration of a new
  private account, the new account's honest zero-attention state, signing back
  in as the administrator, and opening the refactored screenshot-import dialog.
  No browser warning or error logs remained.
- `relationship-workspace-app.tsx` moved from roughly 10,259 to 9,779 lines.
  The screenshot workflow moved 23 local state cells and three direct fetches
  into one reducer-based controller and one typed transport module. The owner
  now distinguishes a rejected commit from an unknown outcome and reuses the
  same request ID for safe retry.
- The previous access direction (an unavailable-workspace notice plus an
  environment-only account) was compared with the chosen quiet two-state
  account surface. The chosen direction preserved the existing editorial
  composition, added sign-in/registration without dashboard chrome, and kept
  the authority boundary explicit in the copy.

Verification:

- Web: 197 passed, 1 skipped; lint clean; typecheck clean; production build
  generated all routes successfully.
- Backend: 151 passed; typecheck clean.
- Documentation and architecture checks passed.
- Runtime API sign-in, registration, empty-state readback, and authenticated
  Today readback passed against the local Docker backend. Readiness reports the
  concurrently added latest migration, `030_person_profiles`.

Remaining decomposition is intentionally visible: the page-sized relationship
component still contains 34 direct fetches. The next owner slices should be
resource intake and identity correction, using the screenshot controller's
typed command/readback and unknown-outcome pattern rather than adding more
component-local transport.
