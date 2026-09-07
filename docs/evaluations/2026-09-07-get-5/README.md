# GET-5 implementation and evaluation

Status: complete for the seven-requirement implementation boundary. All confirmed review findings are closed, no safety veto remains, and the final local TestFlight backend is deployed and verified.

## Scope

All seven GET-5 requirements are implemented: continuous owner-scoped Sessions and context; grounded contact drafts and deliberate canonical saving; chronological screenshot results; native interactive back; empty-input hold-to-talk; structured GFM Markdown; and quiet per-message controls with whole-Session share/fork. [Twenty checks](checks.md) define the verified boundaries.

## Executable evidence

- Signed Simulator unit suite: 513/513, `/tmp/get5-ios-unit-r8.xcresult`.
- Native interaction coverage is cumulative across targeted reruns, with eleven distinct core journeys passing. `/tmp/get5-ios-ui-final-r6.xcresult` covers voice/tap/typed text, missing relationship/decline, expired open proposal and screenshot interruption/restart. `/tmp/get5-ios-ui-final-r8.xcresult` passes completed screenshot inline results and follow-up. `/tmp/get5-ios-ui-panel2-r1.xcresult` passes continuity/regeneration/feedback/fork/native back and Chinese dark AX5/reduced-motion rendering. Its cancellation selector failed after the delete-scope assertions; the final authenticated canonical case in `/tmp/get5-ios-ui-canonical-panel2-r5.xcresult` passes actual Session synchronization, save, restart, deletion scope and cancellation in 43.4s.
- Final authenticated response-loss recovery passes in `/tmp/get5-ios-ui-pending-footer-r8.xcresult` in 96.407s. The whole card, including its footer, accurately describes an uncertain submitted save; restart and retry preserve the original operation and receipt. [Runtime proof](response-loss-runtime-proof.json) records two POST attempts with identical request hashes and one dropped response after commit. [Screenshot 25](screenshots/25-pending-footer-v3.png) shows the complete corrected footer.
- Small viewport: iPhone SE (3rd generation), iOS 26.5, Chinese dark AX5/reduced-motion case passes in `/tmp/get5-ios-ui-se3-r1.xcresult`. The vertically stacked table and horizontally scrollable code are inspectable in screenshots 20–21.
- Backend: 128/128 across seven files; after the final database-clock/prompt correction, 87/87 affected cases pass, including 42 real PostgreSQL cases. These are overlapping runs, not 215 distinct tests. [Backend proof](backend-proof.v2.json) preserves exact hashes and red/green logs.
- The final Release Simulator build passes arm64 and x86_64; three DEBUG screenshot fixture markers are absent from the executable. [Final native proof](native-proof.v3.json) records exact run outcomes, binary hashes and the source freeze. Localization checks pass for 2,547 catalog keys, 172 inline strings and 209 raw entries; documentation checks pass. The complete staged diff identifies one extra EOF newline in migration 054, deliberately preserved because that exact checksum is already deployed. The whitespace check passes with only `blank-at-eof` excluded; no migration bytes were changed for formatting.
- Actual configured provider trials: [text and contact](conversation-provider-proof.json), [final canonical screenshot context](screenshot-provider-proof.v3.json), preserving the [v2 clock failure](screenshot-provider-proof.v2.json). Inputs are synthetic; individual successes are not a reliability benchmark.

## Independent review trail

Backend [v1](session-code-review.v1.md) and [v2](session-code-review.v2.md) exposed scope, revocation, concurrency, retention, size and identifier cases. Their fixes received real PostgreSQL regression coverage. Two platform rejections prevented a third independent backend code-review run; that run is not claimed as a pass.

The iOS code review progressed through [v1](ios-code-review.v1.md), [v2](ios-code-review.v2.md), [v3](ios-code-review.v3.md) and [v4](ios-code-review.v4.md). The final reviewed delta had no actionable findings; source inspection alone is not native runtime proof.

The independent recruiter, mobile and evidence-safety [panel v1](panel.v1.json) blocked delivery on deletion scope and canonical reply lifecycle. Root also accepted the unknown-result copy, fork identification and mixed-citation interpretation fixes. [Panel v2](panel.v2.json) confirmed both safety resolutions and identified one residual footer inconsistency. The corrected footer received an actual visible native trace and a narrow independent follow-up against the [110-file v3 manifest](product-source-manifest.v3.json).

| Final independent lens | Verdict | Remaining implementation findings / vetoes |
| --- | --- | --- |
| [Recruiter workflow](recruiter-review.v3.json) | pass_with_changes, 2/4 | 0 / 0; score retains the field-value evidence gap |
| [Mobile UX](mobile-review.v3.json) | pass, 3/4 | 0 / 0 |
| [Evidence safety](safety-review.v3.json) | pass, 3/4 | 0 / 0 |

[Panel v3](panel.v3.json) passes the implementation gate without averaging scores. The recruiter rubric retains a low trigger-relevance dimension because a realistic deadline, competing tasks and a field comparison were not observed. This limits product-value claims; it is not an unresolved implementation defect or safety veto. The final build and deployment were verified by root after the review freeze and are not attributed to the reviewers.

## Deployed state

The required `scripts/deploy/testflight-local.sh` completed with its default rebuild enabled. The API and agent sidecar run `talent-signal-backend-local:get5-session-20260907`; 32 relevant running-container source hashes match the final reviewed source. All 57 migrations are present through `056_agent_session_chat_lifecycle`, with matching GET-5 migration checksums.

[Deployment proof](testflight-deployment-proof.json) records loopback readiness and private HTTPS live/readiness responses of 200, unauthenticated Session access of 401, Apple JWKS/challenge checks, and successful synthetic voice/chat provider probes. The API remains published only on Mac loopback; PostgreSQL has no host port; simulated authentication is disabled. Existing Tailscale Serve handlers are unchanged. This is a local backend deployment, not an iOS TestFlight upload.

The isolated synthetic API, fixture, response-loss proxy and their PostgreSQL container were stopped after verification. Test database contents and logs were preserved; unrelated services were not stopped.

## Evidence limits

No physical-device VoiceOver, two-physical-phone sync, new App Store Connect upload, or recruiter field study was performed. Native and PostgreSQL tests exercise deterministic continuity and recovery boundaries. Existing screenshots 01–14 and failed-run logs are historical evidence; corrected v2 captures start at 15.

## Test-environment corrections

The old DEBUG workspace-only fixture omitted a bearer token and bypassed Session synchronization. The two final canonical journeys use the existing loopback simulated-authentication/keychain bridge, exercising the signed-in app path. An isolated fixture request hit a 12-second PostgreSQL query timeout during severe shared VM pressure; no persistent lock or full disk was found. Some initial launches unexpectedly selected DEBUG preview. The recovery test terminates the existing app and permits one identical launch retry only if that explicit preview marker appears before business interaction. Final footer r8 passed without needing the retry. These setup/launch failures remain recorded; no production cause is invented.
