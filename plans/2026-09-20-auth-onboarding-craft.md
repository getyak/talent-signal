# Account entry and a useful first minute

## Outcome

Replace the oversized split registration page with a focused, calm account entry.
Google, Apple and email must reach the same authenticated backend boundary. After
sign-in, ask only for a preferred name, an optional public reference and a current
working focus. Setup can be skipped and edited later.

## Scope and ownership

- Parent branch: `codex/auth-onboarding-craft`, baseline `e631705c`.
- Pi task: `20260920-222645-fba46e20`, isolated backend, contracts and OAuth plumbing.
- Parent: login composition, password interaction, onboarding pages/actions,
  settings entry, visual/browser acceptance, integration and final review.
- Existing primary checkout iOS policy changes are unrelated and remain intact.
- No native iOS UI change, automatic identity linking, contact import or broad
  social surveillance. A supplied public URL is read only after an explicit click;
  its bounded excerpt remains an unconfirmed preview until the user saves.

## Decisions

Single password entry with show/hide and length feedback replaces retyping. See
[GOV.UK password input](https://design-system.service.gov.uk/components/password-input/).
Keep password-manager autofill and paste; never persist passwords in action state.

Apple's `form_post` callback requires dedicated Secure SameSite=None transient
cookies and state/nonce verification. Preserve the long-lived session policy.
Sources: [Auth.js Apple](https://authjs.dev/getting-started/providers/apple),
[Apple other platforms](https://developer.apple.com/documentation/signinwithapple/incorporating-sign-in-with-apple-into-other-platforms),
[Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect).

Prefer one name over given/family name, one public link over many social fields,
and current work intent over low-value demographic questions. No discovery by
name alone and no unreviewed inferred biography is persisted.

## Evidence and unknowns

- At baseline, Google exchanged identity tokens for backend sessions; Web Apple was missing. Both now share backend claims and independent session readback.
- Staging Google credentials are present. Apple Web Services ID/client secret are
  absent in dev and staging. Native Apple audiences exist; these are not proof of
  a configured Web Service ID. User clarification is pending.
- Runtime backend was ready at migration `072_mcp_extensions` on initial inspection.
- Registered temporary evidence: `/private/tmp/ai-test-auth-onboarding.9U56KO`.

## Milestones

1. Complete: rendered split and centered directions; selected a focused single column.
2. Complete: backend persistence, explicit one-page preview and OAuth bridges.
3. Complete: independent review; all confirmed P0/P1/P2 findings fixed, including
   DNS-pinned sockets, robots policy on redirects, replay revision checks, provider
   error recovery, request deadlines and Apple cross-site cookies.
4. Active: build and local deployment; create reviewable PR and prove
   applicable deployment. Provider end-to-end acceptance requires actual configured
   provider credentials and the account owner's consent interaction.

## Completion evidence

Email registration and login, setup save/skip/edit/clear and reload readback;
same-ID retry and stale-account denial; safe URL preview and inaccessible-link
recovery; OAuth start/callback/session checks; keyboard, mobile, dark and reduced
motion screenshots; current commit checks. Never equate configured names, a mock
OAuth exchange or a passing build with real Google/Apple sign-in.

## Acceptance recorded

- Real synthetic PostgreSQL database at migration 073: email registration, save,
  edit, optional-field clearing, persisted skip, repeat-login bypass, wrong-password
  recovery and original callback preservation all passed in clean Chrome.
- Explicit public-page preview fetched https://example.com without saving it.
  Browser journeys recorded zero page errors. Light desktop, light mobile, dark
  mobile and onboarding screenshots were inspected.
- Web tests: 903 passed, 1 skipped. Backend tests: 579 passed, 179 skipped
  (database-gated suites); the isolated real-database browser journeys ran separately.
  A concurrent full run hit the existing readiness test 5-second timeout; the
  complete backend suite passed at two workers without changing the test timeout.
- Independent backend/Web TypeScript checks and Web lint passed. Documentation,
  wiki and architecture checks passed (77 migrations).
- Durable local screenshots and browser records: 
  `/Users/cubxxw/.local/state/talent-signal-auth-onboarding/evidence/`.
- Pi finished implementation and checks, but its scope gate rejected a required
  migration manifest boundary-script update. Parent reviewed and accepted only
  that necessary scope addition; delivery was not inferred from Pi status.
- A development browser with active extensions and HMR showed a React DOM deletion
  error. The clean Chrome run did not reproduce it; verify the immutable release
  separately before treating the user's existing browser as accepted.

## Remaining provider acceptance

Apple Web Services ID and generated client-secret are absent from both dev and
staging. The Apple developer portal has no logged-in session. Its button stays
unavailable; the implementation is tested, but real Apple sign-in is unverified.
Google credentials exist; a real provider start and callback still require
runtime acceptance. No broad social search or model-generated biography was added.
