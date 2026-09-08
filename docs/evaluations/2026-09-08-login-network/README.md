# Gesture-led login refinement

## Reference conclusions

Inspected September 8, 2026. These are comparative design judgments, not claims
that a particular visual caused retention or conversion.

| Reference | Observed mechanism | Adaptation |
| --- | --- | --- |
| [Partiful](https://partiful.com/about) | People and shared moments carry the promise; utility supports participation. | The portraits own the reveal, without extra feature explanations. |
| [Are.na](https://www.are.na/about) | Content, collections and connections form a small structural grammar. | Keep the illustration legible and its surrounding controls sparse. |
| [Cosmos](https://www.cosmos.so/) | Curated visual content establishes atmosphere around a simple next action. | Use the existing fictional portrait assets as the visual material, without copying its brand. |

Two rendered compositions used the same assets: A placed people on a symmetric
orbit; B opened an asymmetric network upwards. B preserved the user's chosen
mechanic and left fewer competing focal points. The local comparison lives in
`output/login-network/directions.html`; A remains a rejected challenger, not
another shipped mode.

## Outcome and boundary

The introduction preserves the earlier explicit constraint: no people or
connections before intent. Pulling controls a common progress value; portraits
arrive before edges. A short trial pull returns, and commitment happens only
on release or an explicit tap. Login does not wait for a separate timer.
During the pull, the mark fades clear of the arriving portraits; a soft lower
mask replaces a hard crop at the emergence boundary.

The ordinary home omits secondary promise copy, the safety footer, successful
sign-out notices and the persistent Lab entry. Internal tools remain in the
brand's native context menu when enabled. Incomplete sign-out and unreadable
recovery records keep an explicit recovery action, including after relaunch.
Successful recovery retains its underlying receipt while removing home attention.

The graph is decorative and uses bundled fictional portraits. It does not read
contacts or represent actual relationship evidence. Provider authentication,
account matching and exact sign-out effects retain their existing authority.

## Verification

- Signed unit tests: 14 passed, covering gesture intent, failed/unknown endings,
  Keychain retention, same-operation retry and old-session isolation.
- Native UI: 5 journeys passed on iPhone 17 Pro (entry/replay/email failure,
  offline recovery, reduced-motion dark entry, sign-out failure/relaunch/retry,
  and the relocated Lab entry).
- The updated accessibility layout passed its focused AX5/offline test.
- The complete entry/replay/email-failure journey passed on a fresh iPhone SE
  3rd generation simulator. A final native touch replay passed on the final app
  binary, including the final mark/mask refinement, and supplied the motion recording.
- Final signed build, localization, documentation, diff whitespace and synthetic
  backend fixture TypeScript checks passed.

Native testing caught and fixed a real short-pull defect: the invitation's tap
could also fire after a drag. Its drag now has priority over its button action.
An initial unsigned run failed Keychain entitlement checks; it is excluded from
passing evidence. Manual CUA control timed out, so the motion recording uses
native XCTest touch events rather than claiming a manual-device session.

| State | Native evidence |
| --- | --- |
| Original introduction | [Before](before-intro.png) |
| Clean introduction | [Introduction](intro.png) |
| Short pull returns without login | [Returned state](small-pull-return.png) |
| Portraits emerge before connections | [Intermediate frame](portraits-before-edges.png) |
| Completed network and login | [Login](login.png) |
| Email failure and cancellation | [Email recovery](email-recovery.png) |
| Dark / reduced motion | [Dark login](dark-reduced-motion.png) |
| AX5 / offline recovery | [Accessible recovery](accessibility-recovery.png) |
| Small-screen login | [iPhone SE](small-login.png) |
| Retained failed sign-out | [Recovery](sign-out-recovery.png) |
| Same-operation retry verified | [Verified result](sign-out-verified.png) |

Raw native bundles are local artifacts under `/tmp/talent-signal-login-network-*.xcresult`;
the final motion recording is `output/login-network/pull-network-final.mp4`.
Extracted intermediate frames remain in `output/login-network/`.
They contain only synthetic test content.

Simulator checks do not establish physical-device haptic quality or sustained
device frame rate. No TestFlight upload or real provider sign-in is claimed.
