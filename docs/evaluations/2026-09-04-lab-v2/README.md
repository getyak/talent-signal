# Lab V2 first-delivery evidence

## Outcome and scope

Native iOS Lab now offers useful device tools and a real model experiment loop.
This is a working-tree and Simulator delivery, not a TestFlight upload or a
production backend rollout. The original deterministic Lab remains available.
The accepted scope is [ADR 0012](../../decisions/0012-useful-device-lab-and-real-experiments.md).

## Direct proof

- iPhone 17 Pro Simulator, iOS 26.5, Xcode 26.6; portrait, Chinese and English.
- Five native unit tests passed: response-loss recovery, scoped storage,
  unverified output rejection, expiry recovery, cache boundary, and independent
  onboarding state (some tests cover more than one assertion).
- Five native UI journeys passed: signed-out/offline entry, cache and isolated
  onboarding, dark interactive preview, Chinese accessibility layout, and
  reading/reviewing the saved real provider result. The corrected AX5 fixture
  additionally asserts that row height exceeds 100 pt, so a misspelled Dynamic
  Type launch value cannot silently turn this into a normal-size test.
- Debug test build and unsigned Release Simulator build succeeded. Localization
  policy passed with 1,379 keys and no additional transitional/raw call sites.
- Backend type checking and 30 focused tests passed. The disposable PostgreSQL
  evaluation passed 11 concurrency, isolation, recovery, and expiry checks:
  [database proof](database-proof.json). These tests use a provider test double.

The separate [live model proof](live-model-proof.json) contains **two actual
Zhipu `glm-5.3` calls**, using only the repository's conflicting-evidence case.
The requests took 4,571 ms and 6,683 ms. Reported usage was 607/193 and 607/256
input/output tokens. Both responses carried provider request IDs and valid
citation references. Replaying the same experiment ID preserved those request
IDs. The phone read both answers, saved `needs_review`, and the API readback
confirmed it. The review actor was UI automation on a fixture user; it is not
a human quality verdict.

Only one real model was configured, so this proves same-model repeatability,
not superiority between different models. The second answer's “only reliable
information” wording overstates the older evidence. That is a useful visible
failure candidate, not grounds to approve a model or change its prompt here.

The proof used a separately migrated, seeded, loopback-only PostgreSQL
container and API. The existing internal backend was not migrated or restarted.
Its configured provider credentials were passed in memory to the isolated API
after Infisical access failed; no credential values were printed or saved.
These repository artifacts contain synthetic data only and intentionally
preserve evaluation evidence beyond the runtime record's seven-day lifetime.

## Native surfaces

| Task | Evidence |
| --- | --- |
| New Lab entry | [Chinese home](lab-v2-home-zh.png) |
| Configure a real comparison | [Model and case selection](lab-v2-real-experiment-config.png) |
| Inspect actual output and timing | [Real answer](lab-v2-real-model-answer.png) |
| Save a review | [Review state](lab-v2-real-model-review.png) |
| Clear scoped cache and replay onboarding | [Device tools](lab-v2-maintenance-zh.png), [review preview](lab-v2-onboarding-review-zh.png) |
| Unavailable backend | [Signed-out experiment screen](lab-v2-offline-experiments.png) |
| Dark appearance preview | [Controls](lab-v2-appearance-dark.png), [interactive onboarding](lab-v2-live-preview-dark.png) |
| Effective AX5 | [Home](lab-v2-home-zh-ax5.png), [maintenance](lab-v2-maintenance-zh-ax5.png) |

## Mobile review packet

- Reviewer: `mobile-ux-reviewer`.
- Lens: mobile task completion, visual hierarchy, accessibility, and recovery.
- Evidence level: 1 for the executed Simulator tasks; code and focused tests for
  provider and recovery failure boundaries.
- Verdict: `pass_with_changes` for broader device release; the internal first
  slice is usable. No field user study or assistive-technology user evidence is
  claimed.
- Scores (0–4): task legibility 3, hierarchy 3, evidence/control 3, platform
  interaction 3, accessibility 2, state completeness 3, feedback/recovery 3,
  visual craft 3, performance feel 3.
- Corrected finding: URL cache disk statistics did not immediately change
  after the removal call. The UI now reports cleanup requested while bytes
  remain, and only reports cleared after observing zero. Verification: cache
  unit test and native maintenance readback.
- Corrected finding: the original AX5 launch value was ineffective, and large
  decorative icons crowded text once the correct size was applied. The test
  now checks effective layout; decorative row icons disappear at accessibility
  sizes while labels remain fully scrollable.
- Remaining release check: VoiceOver focus order, smallest supported physical
  phone, and real-device sign-out/revocation should be exercised before a broad
  TestFlight release. No CPU, frame-rate, or energy measurement is claimed.

## Reproduction and operational limits

The native tests are `ProductLabTests` and `ProductLabUITests`. The live-result
UI test expects an already populated disposable proof API at loopback 4329;
it never starts paid provider calls. The database test is
`apps/backend/src/evaluation/runLabExperimentEvaluation.ts` and requires the
explicit `LAB_EXPERIMENT_EVALUATION_DATABASE_URL` of a migrated, seeded,
disposable loopback database.

Runtime backend switching, changes to the normal product model, real candidate
input, a dedicated execution worker, online experiments, automatic regression
promotion, and Instruments-level profiling remain outside this first delivery.
The executor persists its ID before running but does not resume interrupted
provider calls; unknown results require explicit user review. Model pricing is
unavailable. Cache tools preserve durable sources, drafts, sessions, and
pending operations; sign-out remains a separately confirmed action.
