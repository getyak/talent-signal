# RC5 frozen accessibility trace

Release candidate: Talent Signal macOS `0.1.0` build `4`.

- Frozen zip SHA-256: `2d125b26f0185a5094375678d2345ea410538202db9fbed938804a9d7f2f34b9`
- Frozen universal binary SHA-256: `7744ed9290495dd1d4a871de605ac76a4bb317fdd6fae06413d8c07362dfee98`
- Frozen source snapshot SHA-256: `a00c08c1c2bb4818ace44b454dbc193bde52771230b986bca0c96cdab3e85367`
- VoiceOver screenshot SHA-256: `dc12294db370ed20db8cf64e5ae0691cc79c9ac301b6ee087ad62fc24b28d9a4`
- VoiceOver recording SHA-256: `097967979c9a683b6a2da86723de273b2ae507815d5bc235c57d62127f60c8bd`
- Complete VoiceOver journey SHA-256: `3803701365b5ffa6de40e3d6994cb8d1dabdc3424f5fa4db9ab8c83f2d77e838`
- Complete VoiceOver receipt screenshot SHA-256: `f0a46ca79c92e73cc16c6108784ea99c6f6496d3001246dfa462cf0bd0c71181`
- Complete keyboard journey SHA-256: `e66c68869ebb8bda5a92af6b470090a57281a3759390996d95ba010cc64ad6cc`
- Keyboard receipt screenshot SHA-256: `6f17218d6c8c91647eefb3a867c3b3e372905b9e6334c302cfa36553e84ec5b5`
- Build-4 200-percent decision screenshot SHA-256: `b95bf7f91a28b609d77c60c85d57cbd1d673791629510827d313d74ac981eec7`
- Data classification: synthetic fixture only.

The frozen Release app was launched with `--ui-testing --fixture-state needs-decision --voiceover-focus-decision`. VoiceOver was enabled temporarily. The recording shows keyboard focus moving between explicit decision buttons and returning to **Confirm** without selecting it. The screenshot shows the real VoiceOver caption panel and the focused Confirm button. VoiceOver and its temporary mouse-cursor preference were restored after capture.

The same frozen binary was then launched from `--fixture-state ready` for a
40.018-second uninterrupted VoiceOver journey. The recording starts with the
VoiceOver Caption Panel reading the exact proposed relationship scope, then
uses only keyboard input to select and confirm that scope, enter one synthetic
source excerpt, create the explicit Capsule item, propose and confirm candidate
attribution, submit the bounded Task, choose **Confirm**, resolve the bundle,
and reach the truthful canonical receipt. The final accessibility snapshot
contains `Canonical receipt verified`, Pursuit revision `7 -> 8`, and
`EXTERNAL EFFECTS 0`. The complete journey and the focused decision recording
are complementary: the former proves end-to-end completion with VoiceOver
active, while the latter proves the complete consequential label and choice
order at the changed build-4 decision controls.

The pointer-free keyboard recording repeats the same primary route from scope
selection to verified receipt without VoiceOver. Its final state is
`Canonical receipt verified`. The build-4 200-percent screenshot directly
shows the changed Confirm, Reject, and Keep unresolved controls, the ordered
decision-context marker, the disabled resolve control before selection, and
the zero-external-effect boundary without horizontal scrolling.

VoiceOver was enabled only for this evidence run and was returned to its
original off state through macOS Accessibility settings immediately after the
captures.

Direct macOS accessibility snapshot for the actionable controls:

```text
button Value: Not selected, ID: canonical.choice.accept.20000000-0000-4000-8000-000000000005, Description: Identity Alexandra 陈嘉宁-Sørensen. Relationship Candidate; VP Engineering APAC expansion. Claim Scheduling constraint unresolved. Uncertainty inference; evidence available. Evidence candidate confirmed: I need the exact remote-work policy before Wednesday because another process moved earlier.. Consequence Add operational gap; review only.. Choice Confirm, Help: Selects Confirm for Operational Gap · Scheduling Constraint. The decision is not submitted until Resolve reviewed decision is activated.

button Value: Not selected, ID: canonical.choice.reject.20000000-0000-4000-8000-000000000005, Description: Identity Alexandra 陈嘉宁-Sørensen. Relationship Candidate; VP Engineering APAC expansion. Claim Scheduling constraint unresolved. Uncertainty inference; evidence available. Evidence candidate confirmed: I need the exact remote-work policy before Wednesday because another process moved earlier.. Consequence Add operational gap; review only.. Choice Reject, Help: Selects Reject for Operational Gap · Scheduling Constraint. The decision is not submitted until Resolve reviewed decision is activated.

button Value: Not selected, ID: canonical.choice.keep_unresolved.20000000-0000-4000-8000-000000000005, Description: Identity Alexandra 陈嘉宁-Sørensen. Relationship Candidate; VP Engineering APAC expansion. Claim Scheduling constraint unresolved. Uncertainty inference; evidence available. Evidence candidate confirmed: I need the exact remote-work policy before Wednesday because another process moved earlier.. Consequence Add operational gap; review only.. Choice Keep unresolved, Help: Selects Keep unresolved for Operational Gap · Scheduling Constraint. The decision is not submitted until Resolve reviewed decision is activated.

button (disabled) Description: Resolve reviewed decision, ID: canonical.resolve, Help: Atomically resolves the Agent Decision Bundle and returns a canonical Pursuit receipt. It performs no external effect.

text No message, calendar event, purchase, deletion, or other external effect is authorized.
```

The ordered markers in every actionable choice are: identity, relationship, claim, uncertainty, evidence, consequence, and choice. No choice is preselected, and the resolve control remains disabled until a choice is made.
