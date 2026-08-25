# V1 experience correction — final frozen artifact

## Review object

- Artifact ID: `TS-V1-EXPERIENCE-2026-08-25-03`
- Type: iOS build, account-scoped canonical Ask loop, protected Session resume,
  Capture boundary, and Apple account-entry boundary
- Base commit: `948218c03c32aff29d6972226f2f5c7af8bc1ce0`
- Version: working-tree snapshot frozen at 2026-08-25 01:34 CST by the source
  and evidence hashes in [`runtime-evidence.json`](runtime-evidence.json)
- Target user: an independent recruiter returning to relationship work
- Environment: iPhone 17 Pro Simulator, iOS 26.5, macOS 26.4; loopback
  PostgreSQL/backend fixture for the canonical Ask journey
- Scenario: return to a sparse Today surface, identify the affected person and
  change, open a conversation-first Ask, reveal real account-scoped search only
  when needed, receive a scope-validated response, inspect an exact cited
  evidence fragment, resume protected account-scoped work, open purpose-bound
  Capture, and inspect the Apple account-entry surface.
- Success condition: one visual resting point on Today; no feed or inline global
  search; Ask remains a conversation with compact prompts and capture controls;
  no cited answer is recorded before exact scope/provenance readback succeeds;
  restored answers cannot present stale citations as current; account entry and
  sign-out preserve the workspace boundary; AX5 retains critical controls.

## Frozen UI evidence

The consolidated machine-export manifest is [`ui/manifest.json`](ui/manifest.json).
The eight PNGs come from the final six selected journeys. Five passed in the
combined run; the canonical journey was killed by the Simulator test runner
before assertions, then passed alone against the same build and fixture. The
failed infrastructure attempt is retained in `runtime-evidence.json` rather
than converted into a product pass.

| Journey | Frozen screenshot |
| --- | --- |
| Sparse Today with named subject | [`73C406D0-14F2-4D9D-BF3B-24326BA7DBEB.png`](ui/73C406D0-14F2-4D9D-BF3B-24326BA7DBEB.png) |
| Conversation-first Ask | [`359BB749-6423-42F2-B751-16ACFA8801AD.png`](ui/359BB749-6423-42F2-B751-16ACFA8801AD.png) |
| Clean Ask at AX5 | [`D5553BEF-51C8-4038-873E-AAFA98A8315F.png`](ui/D5553BEF-51C8-4038-873E-AAFA98A8315F.png) |
| Canonical Ask response | [`F5BDEDCF-3C41-4FFE-A520-6A6A18E59575.png`](ui/F5BDEDCF-3C41-4FFE-A520-6A6A18E59575.png) |
| Exact cited evidence | [`BCEDE58C-D85A-450A-A997-E2ED9AAE4812.png`](ui/BCEDE58C-D85A-450A-A997-E2ED9AAE4812.png) |
| Compact Capture chooser | [`557B1F79-AA9F-4220-8659-EEE8BB06A2E2.png`](ui/557B1F79-AA9F-4220-8659-EEE8BB06A2E2.png) |
| Capture to audio idle | [`F1545247-9D5A-4108-ADEC-01A2E70A3107.png`](ui/F1545247-9D5A-4108-ADEC-01A2E70A3107.png) |
| Sign in with Apple entry | [`5766B315-79E4-4F84-95DE-E8303B5B8084.png`](ui/5766B315-79E4-4F84-95DE-E8303B5B8084.png) |

## Inspectable implementation

- sparse Today, named focus, Sessions, People, menu, and sign-out cleanup:
  `apps/ios/Sources/Features/RelationshipArchiveView.swift`
- account-scoped protected Session/draft persistence, retention, stale restore,
  and preview state: `apps/ios/Sources/Features/RelationshipArchiveModels.swift`
- conversation, AX5 composition, scoped search, draft restore, source cards, and
  exact evidence sheet: `apps/ios/Sources/Features/RelationshipAskView.swift`
- final response/readback validation before Session recording:
  `apps/ios/Sources/Services/PursuitWorkspaceClient.swift`
- purpose-bound Capture: `apps/ios/Sources/Features/SignalCaptureHubView.swift`
- Apple entry and protected app session:
  `apps/ios/Sources/Features/AppAuthenticationView.swift` and
  `apps/ios/Sources/Services/AppSession.swift`
- account-scoped Chat dependency and readback resolution:
  `apps/backend/src/modules/chat.ts`, `apps/backend/src/app.ts`, and
  `packages/contracts/src/resourceSchemas.ts`
- Apple assertion/session/logout boundary: `apps/backend/src/modules/auth.ts`
- executable native journeys and scope/persistence tests:
  `apps/ios/UITests/CandidateSignalUITests.swift` and
  `apps/ios/Tests/RelationshipArchiveTests.swift`

## Evidence and authority boundary

The Chat response may cite only exact `evidence_fragment` dependencies. Before
iOS records a successful turn, authenticated readback must match account, task,
manifest, snapshot, person, relationship context, authorization scope, and
active/published status. Every cited ID must resolve uniquely to an available
fragment. Deleted, unauthorized, superseded, cross-person, cross-context, or
unknown citations fail closed. The evidence sheet exposes exact excerpt,
observed time and timezone, review and attribution state, capture version,
parser, and reviewer. It grants no mutation or external-effect authority.

Authenticated Session history is stored only in an account-hashed,
file-protected, backup-excluded local container. Drafts expire after seven days,
Sessions after thirty, and sign-out deletes both. Restored answers are marked as
needing refresh and hide citations until a new scoped Ask succeeds. Capture
confirms neither identity nor fact and triggers no external write.

## Explicitly missing proof

- production Apple Developer capability/audience configuration and a physical
  Apple Account authorization;
- manual VoiceOver, Switch Control, smallest-device, and physical AX5 runs;
- physical microphone, Action button, permission denial/revocation,
  background/interruption, and termination runs;
- production deployment, time-pressured recruiter field outcomes, and
  candidate outcomes;
- a candidate-relevant hiring-manager delay scenario with a confirmed internal
  owner, response commitment, and candidate communication decision.

These remain missing evidence. This artifact is a local simulator and canonical
loopback release gate, not a production App Store or field-outcome declaration.

## Panel

Selected: `recruiter-workflow-reviewer` for operational value,
`evidence-safety-reviewer` for provenance/privacy/action boundaries,
`mobile-ux-reviewer` for iOS craft/accessibility, and
`candidate-experience-guardrail` for human impact. Selection science is omitted
because the artifact does not rate, rank, predict, or assess a candidate.
