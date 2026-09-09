# Source-led iOS welcome pull

The welcome screen now begins with an explicitly labeled example link. Dragging
it or the bottom invitation lifts the card, brings up bundled fictional people,
and draws source threads before the wider relationship network. A shared
progress value owns the whole composition. Beyond the release threshold the
pull gains resistance; a progress ring and localized release hint explain the
commitment. Threshold and landing impacts are distinct, with hysteresis to
avoid repeated feedback around the threshold.

A short or sideways pull returns without revealing login. Tap, VoiceOver action,
Sign in, and replay remain available. Reduced Motion keeps source and portrait
positions fixed and reveals by opacity; accessibility text uses a simplified
example-link card. No clipboard, contact collection, URL fetch, account data,
confirmed relationship, or sign-in side effect is added.

## Native evidence and review

Compared the [prior mark-only introduction](../2026-09-08-login-network/intro.png)
with the source-led composition. The new source makes the drag target explicit
and gives the first connections a visible origin. Native screenshot review
caught the settled card obscuring two portraits; the final docking geometry
keeps the card below the network. This is an interaction refinement using the
established portrait direction, not a claim of measured conversion improvement.

- Final iPhone 17 Pro build: all 3 gesture unit tests and all 4 native UI
  journeys passed with zero failures. [Introduction](intro.png),
  [connected source](connected.png), and [dark Reduced Motion](dark-reduced-motion.png)
  were inspected. The final English introduction was also inspected on iPad Pro.
- iPhone SE: 3 gesture unit tests and 4 native UI journeys passed. They cover
  short and sideways drags, source drag/tap, complete pull, replay, email failure,
  offline retry, dark Reduced Motion, and AX5 entry. The final subsequent change
  aligns the fixed Reduced Motion thread origin with the fixed source position.
- [Small-screen connected state](small-connected.png).
- [Small-screen AX5 source](small-accessibility.png).
- Localization, documentation integrity, and diff whitespace checks passed.

Local native bundles: `/tmp/talent-signal-onboarding-small.xcresult` and
`/tmp/talent-signal-onboarding-final.xcresult`. Screenshots contain synthetic
content only. Native tests and screenshot inspection do not establish physical
haptic quality or physical-device frame rate. Release and actual installation
remain separate outcomes tracked in the execution plan.
