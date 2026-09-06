# GET-6: first meeting and authentication

## Source and selected direction

[GET-6](https://linear.app/getyak/issue/GET-6) was inspected in the authenticated
Linear desktop app. The supplied references are three still captures of Wabi's
mobile onboarding, not an available motion video. They establish a sequence:
a minimal invitation, emerging brand identity, then portrait bubbles and login.
[Entry reference](reference-entry.png) and [login reference](reference-login.png)
are preserved here. The middle capture showed the centered Wabi mark.

The adaptation retains Talent Signal's approved Held Interval mark, warm neutral
surfaces, ink typography, and vermilion accent. It does not copy Wabi's pink
palette, typography, or logo. The people are fictional illustration assets; no
contact, candidate, or signed-in account photograph is used in the animation.

The user clarified the decisive choreography on September 6:

1. First meeting contains **no portraits and no connecting lines**.
2. A deliberate upward swipe reveals the people, preserving surprise.
3. The emergence should be expressive, with more people and stronger movement.

This sequence is the acceptance criterion. The [early target](design-target.png)
and [first rendered implementation](ios-login-first.png) document the rejected
five-person treatment that revealed the people too early. The selected revision
starts with the mark alone, then introduces eleven people in a staggered upward
burst. Elastic overshoot and soft circular collisions settle into a composition;
threads appear after the faces, and login controls enter last. Replaying the
introduction must hide the people again.

## Implementation boundary

- Native: SwiftUI controls, unchanged brand geometry, and a bounded SpriteKit
  illustration. The whole introduction supports upward swiping; the invitation
  is also a button. Google, Apple, and email remain ordinary accessible controls.
- Eleven images are bundled locally. New imagegen assets 5–11 use fictional
  portraits with warm stone backgrounds; 1–4 reuse approved synthetic relationship
  concept portraits. Assets 5–11 are downsampled to 384 px for small circular use.
- Reduced Motion uses a static portrait arrangement after entry and a short
  control fade. No physics burst is required to reach authentication.
- Motion sleeps after its bounded arrival/interaction window and pauses while
  inactive. This is an implementation bound, not a measured device FPS claim.
- Web adapts the same reveal to an explicit button, wheel, or upward touch swipe;
  its authentication form stays available beside the introduction on desktop.

## Authentication and configuration

Google project `talent-signal-507809` has separate iOS and Web clients. The native
client is bound to `com.talentsignal.app` and Apple team `6RG2F8YY59`. Public native
client ID and reverse-client callback scheme are bundled in Info.plist. The app
uses the system authentication browser, authorization code + PKCE, state, and a
server-issued nonce. It contains no Google client secret.

The Web client's verified redirect is
`http://localhost:3000/api/auth/callback/google`. Credentials live in Infisical
`dev:/web` and `staging:/web`; accepted audiences live in the matching `/backend`
paths. The temporary downloaded secret JSON was removed after storage. Google
remains **External / Testing**, with the owner's authorized account added as a
test user. Production publication, domain verification, and production Web
redirects have not been claimed.

Backend Google authentication validates Google's signature, issuer, audience,
age, verified email, authorized party, and nonce before a one-time challenge can
create an account-scoped session. Replays, inactive accounts, and email collisions
with an existing unrelated identity fail closed. Matching email alone never
merges workspaces. Email is the visible login identifier; provider subject remains
the stable identity key. Email/password registration uses an internal generated
username, keeping that implementation detail out of the form.

Auth.js owns state and PKCE. Its encrypted, provider-tagged nonce cookie is bound
to the backend-issued challenge using the pinned beta.32 cookie format. Keep the
nonce-binding tests and real callback check when upgrading Auth.js. Both clients
require a matching backend session readback before adopting Google session
authority; the native email path applies the same readback check. Authentication
error logging omits tokens and claims.

The local TestFlight backend was rebuilt and redeployed with the required
`scripts/deploy/testflight-local.sh`. Docker Hub returned EOF resolving the base
image, so the successful build used the existing local runtime image with fresh
compiled backend/contracts/agent/evaluation output and migration sources. The
prior image is retained as `talent-signal-backend-local:pre-get6-20260906`.
Google challenge creation, migration, backend health, and existing service probes
passed after redeployment.

## Verification

- Real Chrome Google consent and callback succeeded. The app opened the owner's
  new personal workspace; authenticated Today readback returned an empty current
  workspace rather than a session error. The Web callback itself also verified
  account and user IDs through `currentSession()` before saving the session.
- 19 backend tests cover identity claims, signature, disabled configuration,
  challenge reuse, token replay, email collision, inactive account, and session
  creation with member privileges.
- 9 Web tests cover existing auth configuration and encrypted nonce binding,
  unexpected authorization hosts, expired challenges, and missing attempts.
- 6 focused native unit tests cover existing session behavior, exact Google
  callback validation, and email session readback failure/scope mismatch.
- Two native UI tests passed after the final revision. They cover a real upward swipe, delayed authentication controls,
  an actual backend password rejection, cancellation, replay, and dark entry.
  The dedicated simulator is iPhone 17 Pro / iOS 26.5. Reduced-motion rendering is
  exercised through the existing Lab override and a DEBUG-only launch argument;
  this is not a claim that the Simulator system preference was changed.
- The native system browser opened Google's sign-in page for Talent Signal.
  Cancellation restored the provider controls without an error. A complete
  native Google account round trip was not attempted without a signed-in
  Simulator browser; the complete real-account round trip above is Web evidence.
- Web was inspected at 1280 × 900 and 390 × 844, in light and dark appearances.
  The mobile panel header overlap was fixed. At 390 px the document width is
  also 390 px, with no horizontal overflow. TypeScript, focused ESLint, and the
  page console checks passed. The form shown in the artifacts contains only
  synthetic demonstration values, not submitted credentials.

## Rendered evidence

The [nine-second native recording](ios-swipe-emergence.mp4) shows the actual
swipe-triggered burst and settling. It is a Simulator screen recording, not an
image-generated animation. The production illustration pauses after settling;
no device frame-rate or battery measurement is claimed.

| Surface | Evidence |
| --- | --- |
| Initial brand-only invitation | [Native first meeting](ios-01-first-meeting.png) |
| Eleven people and delayed controls | [Native emergence](ios-02-emergence.png) |
| Backend rejection and recovery | [Email failure](ios-03-email-recovery.png) |
| Reset hides people and threads | [Replay reset](ios-04-replay-reset.png) |
| Dark appearance | [Dark entry](ios-05-dark-first-meeting.png), [dark reveal](ios-06-dark-revealed.png) |
| Reduced-motion rendering | [Static, accessible login](ios-07-dark-reduced-motion.png) |
| Google system browser | [Native authorization entry](ios-google-browser.png) |
| Web desktop | [Initial](web-first-desktop.png), [revealed](web-revealed-desktop.png) |
| Web responsive | [Light](web-revealed-mobile.png), [dark](web-revealed-mobile-dark.png) |

Review found and corrected a SpriteKit lifecycle issue: the initially hidden
scene could keep a view-level pause and never run its arrival actions. The
dedicated SKView now owns lifecycle pausing separately from the scene's bounded
idle pause. The revealed screenshots and recording verify that fix. The two
portrait renderers also honor both system and Lab reduced-motion preferences.

This delivery changes the local source and running backend; it does not upload
a new TestFlight binary or publish Google's consent screen to production.

Sources: [Google native OAuth](https://developers.google.com/identity/protocols/oauth2/native-app),
[Google identity verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token),
[Google sign-in branding](https://developers.google.com/identity/branding-guidelines).
The standard Google G asset is downloaded from that branding documentation.

## Release-branch integration

The authorized release branch is based on current main `9873f22`, preserving
newer Agent Ask lifecycle routing, Calendar permission copy, migration
`047_proposed_extracted_text`, and every upstream localization and secret
mapping. Backend readiness now requires migration `050_google_auth`. The
localization checker decodes escaped newlines in Swift keys once; the actual
headline translation remains unchanged.

On this isolated branch, backend build and 26 focused backend tests passed;
Web passed nine focused tests, TypeScript and ESLint. The two native Google/email
unit tests and both swipe/recovery/reduced-motion UI tests passed on the dedicated
iPhone 17 Pro Simulator. Documentation, localization, and 18 secret-boundary
checks passed. These checks complement, rather than replace, the required PR
CI and Security gates.

The release branch also passed the full Web suite (327 passed, one pre-existing
skip) and a production Web build using the repository's build-only CI secret.
An old test expecting the replaced expiry sentence was updated while retaining
the returnable expired-session boundary assertions.

The local API and Agent Host now run the isolated release image. Docker Hub
still returned EOF, so its runtime is the prior verified multi-image release,
whose lockfile SHA-256 exactly matches this branch, with freshly compiled
backend/contracts/agent/evaluation/Agent Host output. Seven deployed hashes,
including the retained proposed-extracted-text migration, match; see the
[deployment proof](release-deployment-proof.json). The standard deployment
script's database, readiness, Apple, voice, Chat, and Tailscale probes passed,
and a new Google challenge succeeded.
