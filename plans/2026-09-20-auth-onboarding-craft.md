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
- Staging Google credentials are present. Apple Services ID and callback were
  configured on September 21; dedicated signing-key creation is pending the
  browser tool's credential confirmation. Neither names nor metadata validation
  prove a successful provider token exchange.
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

The authenticated Apple Developer portal now contains Services ID
`com.talentsignal.web`, associated with the existing primary App ID
`com.talentsignal.app`. The exact private HTTPS domain and the Apple callback
under `:10443/api/auth/callback/apple` were accepted and saved. Staging backend
audiences now include both IDs. The dedicated signing key is still pending;
real Apple sign-in remains unverified until runtime configuration and an actual
provider round trip succeed. Browser control recovered. The dedicated key is
configured only for Sign in with Apple and the Talent Signal primary/grouped
IDs, and is waiting at Register for the browser tool's required confirmation
before generating and storing the new long-lived credential.

Google's localhost and private HTTPS callbacks were saved in its Cloud client.
An actual start reached Google's sign-in page without `redirect_uri_mismatch`;
the owner's completed provider callback has not been claimed. No broad social
search or model-generated biography was added.

On September 21 the user explicitly requested completing Apple, committing and
merging PR 216. Pi task `20260921-001738-7367f5f4` owns short-lived Apple ES256
credentials and their tests/docs. Its initial checkout timeout was repaired by
completing only that new, untouched task worktree; it resumed from the same
frozen base. The parent owns portal configuration, integration, runtime proof,
independent review, current-head CI and merge readback.

- Apple client secrets now use a P-256 private key to sign a 15-minute ES256 JWT
  per lazy NextAuth configuration invocation. A provider factory alone was
  insufficient: Auth.js eagerly resolves it, freezing the token. The complete
  config and providers are now rebuilt per invocation.
- Static secrets have the exact 15777000-second maximum, correct audience and
  subject, and expiry checks; incomplete signing configuration fails closed.
- Independent review closed the initialization defect and all other P0/P1/P2.
  Tests cover real Auth Core env-default resolution, a 20-minute jump, valid
  static credentials expiring naturally and recovering in the same module.
- Final integrated Web suite: 943 passed, 1 skipped. Focused auth suite: 64
  passed. Type check, changed-file lint, docs/wiki/architecture and diff checks
  passed. Pi's final scope gate flagged the new auth regression test; the parent
  had explicitly authorized that addition and reviewed the seven-file scope.
- CI identified private-key-shaped markers in malformed-key test placeholders,
  not real keys. Malformed input is now derived by corrupting an ephemeral
  generated fixture; the scanner and its rules remain unchanged.
- Clean backend release `81c2f0cb` completed all deployment probes: original
  observation write/read/delete, Apple key retrieval, synthetic voice and chat,
  and HTTPS authentication contract. Both native and Web Apple audiences are
  active. The saved image/revision and atomic backend/current pointer match;
  the existing recovery LaunchAgent is loaded again and exited successfully.

## Runtime and security follow-through

- Initial immutable Web/backend release `7e4dc41e` deployed locally; backend
  readiness reports migration 073. Opik synthetic write/read/delete probes and
  voice/chat provider probes passed. Tailnet handlers were preserved.
- Live Google start exposed `redirect_uri_mismatch`: its client had only the
  localhost callback. The staging client matches the Talent Signal Web client
  in the Google Cloud project; adding the existing Tailnet callback is in scope.
- Production account entry now moves to configured AUTH_URL before authentication
  so localhost-started requests retain cookies at the eventual OAuth callback.
- CodeQL nonce alerts #51/#52 were independently classified and individually
  dismissed as false positives: randomBytes(32), one-time, five-minute OIDC
  challenges, not passwords. SHA-256 is the established Web/iOS/backend protocol;
  actual passwords use salted scrypt. No query was disabled. See OIDC Core 15.5.2.
- SSRF alert #50 was independently reviewed as an unmodeled DNS-pinning boundary.
  The client now connects explicitly to the verified literal IP while preserving
  original Host/SNI and certificate checks. Live https://example.com preview
  succeeded after this change; new CodeQL results must still be read back.

- Final redirect review exposed a pre-existing control-character bypass in the
  shared redirect sanitizer. It now rejects ASCII controls/whitespace, verifies
  a parsed same-origin URL, and returns normalized path/query/fragment. Tests cover
  CR/LF/TAB and canonical origin case/default-port normalization.
