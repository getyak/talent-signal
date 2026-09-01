# RC3 accessibility trace

Artifact: TalentSignalMac 0.1.0 build 2 RC3  
Environment: macOS 26.4 on Apple silicon

## Keyboard journey

`visual/rc3-staging/keyboard-attribution-decision-receipt.mov` records the
window-only primary journey without pointer use:

1. select the exact relationship scope;
2. confirm that scope;
3. enter explicitly selected synthetic text;
4. select candidate attribution;
5. separately confirm attribution;
6. submit the reviewed Capsule;
7. choose the proposal item;
8. resolve the bundle; and
9. reach the canonical receipt and local-only handoff.

The frozen source exposes equivalent menu commands and keyboard shortcuts, and
the native unit/UI target checks that submission remains disabled between actor
selection and separate attribution confirmation.

## VoiceOver order

`visual/rc3-staging/voiceover-ordered-decision-context-v6.mov` records the
actual macOS VoiceOver Caption Panel focused on the consequential decision
control. The full spoken/accessibility label is:

> Identity Alexandra 陈嘉宁-Sørensen. Relationship Candidate; VP Engineering
> APAC expansion. Claim Scheduling constraint unresolved. Uncertainty
> inference; evidence available. Evidence candidate confirmed: I need the
> exact remote-work policy before Wednesday because another process moved
> earlier. Consequence Add operational gap; review only.

The order is identity → relationship → claim → uncertainty → evidence →
consequence, before any choice. The selected option adds its choice label. No
decision is required to discover the consequence.

## Reduced Motion

`visual/rc3-staging/frozen-release-reduced-motion-state-transitions-clean.mov` was
captured from the frozen Release archive with the visibly labeled `Reduced
Motion` fixture. It moves from Working to Needs decision to Receipt verified.
The view disables its nonessential ease-in/out transition while keeping state,
evidence, decision, and receipt content present.

## 200 percent text

`visual/rc3-staging/frozen-release-zoom-200-decision-receipt.mov` records the
frozen Release while the visibly labeled `200% text preview` is active. It
traverses identity, exact evidence, the proposed diff, consequence, unselected
decision control, canonical receipt, and separate local handoff with vertical
scrolling only.

The following frozen-Release images provide exact stills from the same path:

- `frozen-release-zoom-200-decision.png`: identity, relationship, and first
  response;
- `frozen-release-zoom-200-decision-control.png`: exact evidence and diff;
- `frozen-release-zoom-200-decision-choice.png`: consequence and choices;
- `frozen-release-zoom-200-receipt-top.png`: canonical outcome, revision, and
  external-effect count; and
- `frozen-release-zoom-200-receipt.png`: separate local handoff wording.

The capture requires vertical scrolling, which is expected at 200 percent. No
horizontal scroll control appears in the recording or stills.

## Mixed script and tag matrix

The frozen screenshots `frozen-release-identity-tags-0.png` through
`frozen-release-identity-tags-3.png` keep the mixed Latin/CJK name, relationship
headline, exact evidence, and decision hierarchy stable with zero through three
tags. The UI intentionally uses no synthetic avatar placeholder and exposes no
score, rank, fit, personality, or protected-trait inference.

## Host limitation

The macOS XCTest UI runner hung before establishing its host connection. No UI
assertion from that attempt is counted as passed. The compiled UI target,
real-Release Computer Use recordings, actual VoiceOver Caption Panel, and
frozen-Release zoom/reduced-motion captures form the direct evidence instead.
