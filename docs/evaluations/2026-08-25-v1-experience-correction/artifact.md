# V1 experience correction — frozen artifact

## Review object

- Artifact ID: `TS-V1-EXPERIENCE-2026-08-25-01`
- Type: iOS build, canonical backend loop, and account-entry boundary
- Base commit: `948218c03c32aff29d6972226f2f5c7af8bc1ce0`
- Version: working-tree snapshot frozen at 2026-08-25 00:46 CST by the
  source and evidence hashes below
- Target user: an independent recruiter returning to relationship work
- Environment: iPhone 17 Pro Simulator, iOS 26.5, macOS 26.4; loopback
  canonical PostgreSQL/backend fixture for the scoped Ask journey
- Scenario: return to a calm Today surface, open a conversation-first Agent
  session, reveal account-scoped person/context search only when needed, ask
  what changed, inspect evidence-linked output, open the cited person record,
  open purpose-bound Capture, and inspect the Apple account-entry surface.
- Success condition: one clear visual resting point on Today; no generic feed
  or inline global search; Ask remains a conversation with compact embedded
  prompts and capture controls; canonical search/answer/evidence readback works;
  no generated output gains write authority; account entry and sign-out have a
  server-verified session boundary; AX5 retains the critical controls.

## Frozen UI evidence

The machine-exported manifest is [`ui/manifest.json`](ui/manifest.json). The
seven PNGs came from one six-test passing xcresult:

| Journey | Frozen screenshot |
| --- | --- |
| Sparse Today return surface | [`DA45FE2A-3160-4607-89AD-8192E68FEA14.png`](ui/DA45FE2A-3160-4607-89AD-8192E68FEA14.png) |
| Conversation-first Ask | [`27604309-FC64-4CC4-9E00-63D5F35E906A.png`](ui/27604309-FC64-4CC4-9E00-63D5F35E906A.png) |
| Ask at AX5 | [`FD2A6CC2-1484-4EAB-8672-D5D03853AD41.png`](ui/FD2A6CC2-1484-4EAB-8672-D5D03853AD41.png) |
| Canonical Ask response | [`1BB17792-8343-44B0-A3E8-E3980E207015.png`](ui/1BB17792-8343-44B0-A3E8-E3980E207015.png) |
| Compact Capture chooser | [`BE35B4FC-5C5D-4934-9D96-39D7D872DE1F.png`](ui/BE35B4FC-5C5D-4934-9D96-39D7D872DE1F.png) |
| Capture to audio idle | [`9C04E575-BA71-4D3E-AABB-05B67B2D7D61.png`](ui/9C04E575-BA71-4D3E-AABB-05B67B2D7D61.png) |
| Sign in with Apple entry | [`A828DB5B-864E-4675-9D69-DB36E66754C1.png`](ui/A828DB5B-864E-4675-9D69-DB36E66754C1.png) |

## Inspectable implementation

- Today, Sessions, deferred transitions, and sign-out menu:
  `apps/ios/Sources/Features/RelationshipArchiveView.swift`
- Agent session state: `apps/ios/Sources/Features/RelationshipArchiveModels.swift`
- Ask conversation, scoped search, composer, prompts, and evidence links:
  `apps/ios/Sources/Features/RelationshipAskView.swift`
- Compact purpose-bound Capture: `apps/ios/Sources/Features/SignalCaptureHubView.swift`
- Apple entry and local session state:
  `apps/ios/Sources/Features/AppAuthenticationView.swift` and
  `apps/ios/Sources/Services/AppSession.swift`
- Canonical Ask read/auto-compile/retry path:
  `apps/ios/Sources/Services/PursuitWorkspaceClient.swift`
- Server-side Apple assertion, nonce, audience, replay, session, and logout:
  `apps/backend/src/modules/auth.ts`, `apps/backend/src/app.ts`, and
  `apps/backend/src/database/026_apple_auth.sql`
- Executable UI scenarios: `apps/ios/UITests/CandidateSignalUITests.swift`

The exact hashes and executable outcomes are in
[`runtime-evidence.json`](runtime-evidence.json).

## Authority boundary

Ask reads account-scoped canonical People/contexts and produces response blocks
with evidence dependency IDs. A missing read-only Wiki projection is compiled
and the task retried; this does not mutate confirmed relationship state or an
external system. Evidence-link navigation opens the cited record only after the
full-screen Ask transition completes. Capture starts locally and states that AI
may prepare a Proposal, while confirmation and external writes remain subject
to human review.

Apple identity is an account-entry adapter, not candidate evidence. The backend
verifies issuer, audience, expiry, nonce, signature, subject, and replay before
issuing the app session. Apple profile fields are accepted only on initial
authorization, consistent with Apple's documented behavior.

## Explicitly missing proof

- production Apple Developer capability/audience configuration and a real Apple
  Account authorization on physical hardware;
- manual VoiceOver traversal, Switch Control, and physical-device AX5 evidence;
- physical microphone, Action button, privacy-revocation, and interruption runs;
- production deployment, field recruiter outcomes, and candidate outcomes.

These are missing evidence, not converted into local pass claims. The review
object is suitable for a simulator experience gate, not a production App Store
release declaration.

## Panel

Selected: `recruiter-workflow-reviewer` for operational value,
`evidence-safety-reviewer` for identity/provenance/action boundaries,
`mobile-ux-reviewer` for iOS craft and accessibility, and
`candidate-experience-guardrail` for human impact. Selection science is omitted
because the artifact does not rate, rank, predict, or assess a candidate.
