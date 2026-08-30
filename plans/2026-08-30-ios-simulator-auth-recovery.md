# iOS Simulator authentication recovery

## Outcome

Make the current iPhone Simulator build enter a usable, account-scoped Talent
Signal workspace without invoking Sign in with Apple, which cannot complete in
this local Simulator environment. Prove the recovery by exercising the real
backend-backed surface and its failure/relaunch behavior.

## Boundary

In scope:

- reproduce the attached `AuthorizationError 1000` on iPhone 17 Pro;
- use only the existing Debug-only, loopback-only simulated identity boundary;
- verify backend health, authenticated workspace loading, Ask feedback, and
  relaunch recovery on the executable Simulator build;
- add the narrowest regression coverage or launcher correction needed if the
  supported Debug route is not sufficient.

Out of scope:

- weakening Sign in with Apple or production authentication;
- treating a simulated identity as a production Apple identity;
- automatic messages, contact writes, or calendar writes;
- changing unrelated concurrent Calendar, Ask, web, or screenshot work.

## Current evidence and unknowns

- The screenshot shows `ASAuthorizationError 1000` after the Apple button is
  used on iPhone 17 Pro / iOS 26.5.
- The app was launched with `--show-login --auth-backend-url`, which deliberately
  selects the real Apple-authentication surface.
- The repository already has a Debug-only `--workspace-backend-url` route that
  accepts loopback only and obtains the seeded simulated recruiter session from
  `/v1/auth/simulated-login`.
- `http://127.0.0.1:4317/health/ready` reports a ready remote boundary, but its
  simulated-login endpoint returns `SIMULATED_AUTH_DISABLED` as intended.
- An isolated local Docker backend on port 4320 admits only the existing local
  simulated identity and returns matching account-scoped workspace reads.

## Chosen approach

First exercise the existing governed Simulator route. Preserve the production
Apple-authentication UI and use a visibly synthetic, Debug-only identity for
agentic testing. Add code only if executable evidence shows the supported route
is insufficient or too easy to invoke incorrectly.

Rejected: bypassing authentication in Release, faking an Apple credential,
silently falling back from failed Apple login, or enabling consequential
external writes during the test.

## Milestones

1. **Completed — Recover the executable Simulator workspace.** A dedicated
   iPhone 17 loaded the canonical fixture workspace from the isolated local
   backend on port 4320. Ports 4317 and 4318 are SSH-forwarded services with
   simulated authentication disabled and must not be used for this route.
2. **Completed — Exercise agent feedback and recovery.** Focused UI automation
   passed canonical Ask response, failure/draft restoration and same-intent
   retry, plus offline retry without preview-fact substitution. Direct
   termination and relaunch returned to the same canonical Today surface.
3. **Completed — Close the regression gap.** No production-authentication code
   change is warranted: the existing loopback-only Debug route and its focused
   regression tests work. The operational correction is to avoid SSH-forwarded
   ports 4317/4318 and launch the isolated Simulator against local port 4320.
4. **Completed — Review and hand off.** The executable iPhone 17 surface was
   inspected after first load and after relaunch; the App remains running on
   the canonical Today surface.

## Proof

- the iPhone 17 Pro no longer presents the Apple authorization error during
  Simulator testing;
- the seeded account-scoped workspace is loaded from the healthy backend;
- one Ask submission shows progress and a response or an accurate recoverable
  error while preserving the draft;
- relaunch does not silently lose state or claim an external effect;
- focused automated tests and direct Simulator screenshots pass.

## Verification record

- iPhone 17 / iOS 26.5 loaded the account-scoped fixture workspace on port
  4320; the Apple authorization error was absent.
- Backend health, simulated login, pursuits, people, and proposals returned
  HTTP 200 with matching contract and workspace scope.
- `testCanonicalAskRendersTheBackendAnswer` passed.
- `testCanonicalAskFailureRestoresQuestionAndRetriesSameIntent` passed.
- `testCanonicalWorkspaceOfflineShowsRetryWithoutPreviewFacts` passed.
- Direct terminate/relaunch returned to canonical Today with no preview-data
  fallback or claimed external effect.
- Confidence is executable-build evidence on Simulator. Real-device Apple ID
  authentication remains a separate TestFlight/entitlement check.
