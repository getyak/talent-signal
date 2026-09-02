# iOS retrieval experience evaluation

Artifacts under test:

- baseline: `ios-retrieval-baseline-2026-09-01-a`;
- post-change candidate: `ios-retrieval-post-change-2026-09-02-r4`.

This packet freezes the executable baseline for deep optimization of the
Today / Sessions / People mobile retrieval loop. All screenshots contain the
repository's synthetic preview fixture; no private candidate material is in
this packet.

## Post-change outcome

The post-change candidate passes the deterministic release gate. The
content-wide horizontal pager is removed, so only the top Today / Sessions /
People controls change destinations. Session and People rows use native List
gestures: tap opens the primary destination, trailing swipe reveals the
governed shortcut, and long press exposes the same action set without requiring
a swipe. Hidden destinations are not left in the accessibility tree.

The resting cards no longer show row chevrons, duplicate People or Sessions
headings, explanatory page copy, or the former middle vertical divider. The
cards retain identity, relationship context, provenance, confirmed-state
counts, and time while using a calmer surface, spacing, and type hierarchy.

Any tested new intent closes an exposed row action. This includes reselecting
the active destination, revealing another row, scrolling, changing destination,
opening and closing detail or scoped Ask, and backgrounding and reactivating the
app. Per-destination visible-row anchors preserve the recruiter's place during
the reset. The 50-Session and 50-People fixtures keep the same visible anchor
within one row across same-tab reset, cross-destination return, detail return,
and foreground recovery.

People Ask is fail-closed when one person has more than one relationship
context. Only that person's contexts are offered; Send is disabled with a
visible instruction until the recruiter selects one; and no Session pending
state or backend request is created before that decision. Session deletion
disables full-swipe commit, states its device-local effect, requires explicit
confirmation, preserves People, Pursuits, workspace evidence, and drafts, and
rolls back the in-memory deletion if local persistence fails.

## Frozen post-change candidate

- Repository commit: `90dd83d68749f057203cc91b39429763885df124`
- Retrieval product-source diff SHA-256:
  `fbc0d4c29981f69973869d9852eb41bb4398c1dbe0eae9772f2b4a3b10c1e493`
- Target source-and-test diff at build SHA-256:
  `472268e9c884f04f30aa45d81c22b50bcf8aca4957be3b3db59a93352681c499`
- Simulator App dylib SHA-256:
  `bc731bba1e60a6a2818b228eb477b185cd706685f0c04d234e4c319fd686d058`
- UI-test binary SHA-256:
  `7f521c01c40cd8d5254e505341d4d4cd4f05c2f8bb172acb9da142b2cabd452d`
- XCTest run configuration SHA-256:
  `ab6edbca7a068725ea76c28631d1621d1b12cf0eab754db5761f20a1aa59bec8`
- Core Simulator: iPhone 17 Pro, iOS 26.5, portrait
- Visual Simulator: iPhone SE (3rd generation), iOS 26.5, portrait
- Xcode: 26.6 (17F113)
- Artifact manifest:
  [`evidence/final-artifact-manifest.json`](evidence/final-artifact-manifest.json)

The App product-source hash is separated from the broader target-test hash
because another authorized workstream added unrelated UI tests to the shared
file after this binary and XCTest runner were frozen. The executable proof is
bound to the frozen App, UI-test binary, xctestrun, selected test identifiers,
and result-bundle tree hashes in the manifest.

## Post-change executable evidence

- Core gate: 13 of 13 selected tests passed, with zero failures or skips. It
  covers transactional deletion, preferred-person scope policy, row gesture
  ownership, top-navigation ownership, reduced motion, reveal recovery,
  deletion confirmation, People swipe and long press, multi-context fail-closed
  behavior, 50-row continuity for both destinations, Session long press, and
  latency budgets. See
  [`evidence/final-core-summary.json`](evidence/final-core-summary.json).
- Compact visual gate: 2 of 2 selected tests passed on iPhone SE for default
  light and Simplified Chinese dark AX5 with Reduce Motion. See
  [`evidence/final-visual-summary.json`](evidence/final-visual-summary.json).
- Warmed destination readiness: 30 trials, p50 356.06 ms, p95 496.50 ms,
  maximum 660.58 ms; gate p95 <= 900 ms.
- Warmed Session-open readiness: 30 trials, p50 848.03 ms, p95 950.29 ms,
  maximum 1,361.06 ms; gate p95 <= 1,200 ms.
- The latency method includes XCTest synchronized tap completion through a
  synchronous semantic query, excludes three warm-up cycles / opens and
  one-second waiter polling, and is not a touch-to-photon measurement. Raw
  samples are in
  [`evidence/retrieval-interaction-latency.raw.json`](evidence/retrieval-interaction-latency.raw.json).

Final rendered directions:

- [`post-change/sessions-small-light.png`](post-change/sessions-small-light.png)
- [`post-change/people-small-light.png`](post-change/people-small-light.png)
- [`post-change/sessions-small-zh-dark-ax5.png`](post-change/sessions-small-zh-dark-ax5.png)
- [`post-change/people-small-zh-dark-ax5.png`](post-change/people-small-zh-dark-ax5.png)
- [`evidence/session-trailing-swipe.png`](evidence/session-trailing-swipe.png)
- [`evidence/preferred-person-explicit-scope.png`](evidence/preferred-person-explicit-scope.png)

## Frozen environment

- Commit: `90dd83d68749f057203cc91b39429763885df124`
- Target-file diff SHA-256:
  `8d32a04cd6b21b9211869759555f10775586f05a6448e6f0758789a29404cdb9`
- Simulator binary SHA-256:
  `66215f3e4e340b7a87350edb8826236b5d10d212d5d5471ac7e72f334ffbebcd`
- Xcode: 26.6
- Simulator: iPhone 17 Pro, iOS 26.5, portrait
- Fixture: `TS_IOS_UI_TEST_PREVIEW_WORKSPACE=true`

## Baseline evidence

- [`baseline/sessions-light.png`](baseline/sessions-light.png)
- [`baseline/people-light.png`](baseline/people-light.png)
- [`baseline/sessions-zh-dark-ax5.png`](baseline/sessions-zh-dark-ax5.png)
- [`baseline/people-zh-dark-ax5.png`](baseline/people-zh-dark-ax5.png)
- Five focused UI tests passed for direct navigation, bidirectional paging,
  reduced motion, row opening, and Chinese dark AX5 reachability.

The passing tests do not establish row-gesture ownership. Direct evidence in
the earlier [row-gesture baseline](../2026-09-01-ios-row-gesture-research/README.md)
shows that a normal left swipe begun on a Session row can navigate to People.

## Metrics and gates

| Dimension | Metric | Gate |
| --- | --- | --- |
| Gesture ownership | Destination changes during repeated row drags | `0` |
| Reveal correctness | Intended row action appears | `100%` |
| Primary action | Tapped row opens the matching object | `100%` |
| Mutual exclusion | Simultaneously revealed rows | At most `1` |
| Dismissal | Tested new-intent paths restore rest state | `100%` |
| Target size | Interactive width and height | At least `44 pt` |
| Destination readiness | Warmed tap-to-selected-content | p95 `<= 900 ms` |
| Row readiness | Warmed row-tap-to-detail | p95 `<= 1,200 ms` |
| Continuity | Selected destination and visible row after return | Preserved |
| Safety | Active evidence/action vetoes | `0` |

Latency results must report trial count, p50, p95, maximum, device, OS, build
hash, and whether XCTest synchronization is included. They compare builds;
they are not physical touch-to-photon measurements.

## Review panel

Selected:

- `recruiter-workflow-reviewer`: core retrieval usefulness and interruption
  cost;
- `evidence-safety-reviewer`: Session removal scope and preserved People /
  Pursuit / evidence authority;
- `mobile-ux-reviewer`: gesture ownership, accessibility, motion, content, and
  latency feel;
- independent code reviewer: SwiftUI state, correctness, regressions, and test
  gaps.

Omitted:

- candidate-experience and selection-science reviewers, because this slice
  neither communicates with candidates nor assesses or ranks them;
- trend and sourcing reviewers, because no market or sourcing decision is in
  scope.

Specialist reviewers receive this frozen packet independently. Their results
will be validated and retained before implementation is adjudicated.

The post-change panel is now retained in
[`post-change-panel.json`](post-change-panel.json). Workflow, safety, mobile UX,
and code reviewers report no active veto, blocker, or high-severity finding.
The adjudicated gate is `pass_with_changes`: deterministic release evidence
passes, while the explicitly listed physical-device, assistive-technology,
oldest-runtime, complete gesture-matrix, and recruiter-field tests remain.

## Residual evidence boundary

The deterministic gate does not replace a physical-device gesture and frame
pacing pass, a human VoiceOver / Switch Control / Full Keyboard Access pass,
an iOS 16 runtime pass, or a blinded recruiter field study. No claim of
touch-to-photon latency, five-second findability, recruiter time saved, or
relationship outcome improvement is made from the Simulator evidence.
