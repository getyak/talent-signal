# iOS specialist review and adjudication

## Frozen review object

- Artifact: iOS synthetic fixture review and read-only localhost-sync build
- Artifact fingerprint:
  `83aad749c000d151337253c73de867cd0ed874dab754f3ce207feb0179d63dac`
- Source: this document's containing commit, based on
  `f66581cbf8a1b1154156fc25231a6ff82f11c61f`
- Scenario: intentionally open `TS-CORE-01`, inspect exact evidence, decide each
  proposal, preview one bounded action separately, and finish with a truthful
  local outcome
- Target user: an independent recruiter handling sensitive candidate
  conversations
- Environment: iPhone 17 Simulator, iOS 26.1, Xcode 26.4
- Machine-checkable panel: `panel.json`

The panel is the smallest set required by the release standard:
recruiter workflow, evidence safety, mobile UX, candidate experience, and
selection science. `design-talent-signal` guided the quiet visual hierarchy,
evidence proximity, semantic state color, and restrained vermilion usage; it
was not given a decorative cross-rubric score.

Scores remain attached to their own rubric and are not averaged.

## Recruiter workflow reviewer

Verdict: **pass with changes**. Rubric score: **3/4**. Confidence:
**direct**.

| Dimension | Score | Evidence-based reason |
| --- | ---: | --- |
| Trigger relevance | 3 | Deadline, competing process, remote-policy dependency, and why-now are explicit. |
| Capture burden | 3 | Intentional fixture and loopback paths are short; production capture burden is not tested. |
| Evidence review | 3 | Exact evidence, uncertainty, Edit, Confirm, and Dismiss are co-located. |
| State integrity | 3 | Ambiguity, identity, supersession, stale preview, and reversible local fact decisions are tested. |
| Action usefulness | 3 | One owned question is specific and timely; recruiter outcome value is unmeasured. |
| Write safety | 3 | Exact effect and independent decision are visible; external-write retry/idempotency is outside the artifact. |
| Interruption recovery | 2 | Background/activate works, but process termination and cross-day return do not. |
| Wedge discipline | 4 | Every state supports capture → review → one action or no action → truthful outcome. |

Finding: the flow is operationally legible, but no recruiter field study shows
that it is faster or more useful than the manual fallback.

## Evidence safety reviewer

Verdict: **pass with changes**. Rubric score: **3/4**. Confidence:
**direct**.

| Dimension | Score | Evidence-based reason |
| --- | ---: | --- |
| Identity/speaker binding | 3 | Same-name identity abstains and a forwarded manager statement never becomes candidate intent. |
| Provenance | 3 | Every proposed fact cites one exact fixture message; source, suite version, case, capture time, and timezone remain visible. |
| Uncertainty/conflict | 3 | Clarify, no-action, superseded, blocked, and stale states change behavior. |
| User authorization | 3 | Fact decisions precede a separate exact target/effect action decision. |
| External write integrity | 3 | The accepted artifact deliberately performs no external write and reports none; live reconciliation is untested. |
| Privacy lifecycle | 2 | Synthetic/unbound data is minimized, but real-data retention, export, delete, and access are not implemented. |
| Sensitive inference boundary | 4 | Product behavior and tests refuse fit, quality, personality, and acceptance scoring. |
| Evaluator reliability | 2 | Atomic deterministic tests exist; human gold calibration and repeated judge checks do not. |

Finding: the synthetic demo is safe within scope, but it is not authority to
accept or retain real candidate evidence.

## Mobile UX reviewer

Verdict: **pass with changes**. Rubric score: **3/4**. Confidence:
**direct**.

| Dimension | Score | Evidence-based reason |
| --- | ---: | --- |
| Task legibility | 3 | Candidate, exact change, proposed state, and one next decision are explicit. |
| Information hierarchy | 3 | One dominant decision survives dark mode and AX5 in the tested fixture. |
| Evidence/control | 3 | Evidence precedes and stays adjacent to Edit, Confirm, and Dismiss decisions. |
| Platform interaction | 3 | Native picker, buttons, progress, scroll, backgrounding, and recovery behave predictably. |
| Accessibility | 3 | AX5, dark contrast, hit regions, labels, and accessibility-tree order pass; no assistive-technology user participated. |
| State completeness | 4 | Idle, importing, cancelled, failed, unbound, reviewing, ambiguity, action, stale, and outcome states are executable. |
| Feedback/recovery | 3 | Cancellation and failures report no change and provide safe recovery. |
| Visual craft | 3 | Quiet neutral surfaces, evidence-first typography, and scarce vermilion remain content-led. |
| Performance feel | 3 | Import progress is honest and cancellable; no measured device budget exists. |

Finding: automated accessibility evidence is strong for a Simulator slice, but
spoken VoiceOver comprehension and process-termination recovery remain
unproven.

## Candidate experience guardrail

Verdict: **pass with changes**. Rubric score: **3/4**. Confidence:
**supported inference**, because no candidate-facing message is produced.

| Dimension | Score | Evidence-based reason |
| --- | ---: | --- |
| Agency and informed control | 3 | Availability never becomes meeting consent; every proposed state can be edited or dismissed. |
| Human connection | 3 | Automation prepares context for recruiter follow-through and does not impersonate a person. |
| Communication quality | 2 | The need for a question is specific, but no candidate-facing copy or channel is evaluated. |
| Time and attention respect | 3 | Only material, timely evidence can create one smallest step; friendly chat produces no action. |
| Collaboration accountability | 3 | The recruiter owns the policy question and the unresolved client dependency is named. |
| Dignified failure and rejection | 3 | Failure, cancellation, no-action, and refusal states are candid and non-celebratory. |

Finding: the boundary protects candidate agency, but any future draft and send
flow needs its own candidate review and independent send authorization.

## Selection science auditor

Verdict: **pass with changes**. Rubric score: **3/4**. Confidence:
**direct** for the product boundary, not for model quality.

| Dimension | Score | Evidence-based reason |
| --- | ---: | --- |
| Construct/criterion | 3 | The criterion is scoped operational state and safe next-step behavior, never global candidate quality. |
| Job/task analysis | 3 | Cases target concrete recruiter tasks: deadlines, identity, availability, provenance, and follow-through. |
| Standardization/reliability | 2 | The procedure is anchored and deterministic, but agreement and drift are unmeasured. |
| Validity | 2 | Behavior is face-valid and executable; no out-of-sample or field validity exists. |
| Fairness/accessibility | 3 | Candidate scoring/proxies are blocked and AX5/accessibility checks pass; sliced group outcomes are not relevantly measured. |
| Uncertainty/abstention | 3 | Missing identity, ambiguous date/timezone, no-action, and prohibited requests abstain or clarify. |
| Eval-set quality | 2 | Eight cases contain strong counterexamples but are intentionally small and synthetic. |
| Grader integrity | 2 | Deterministic assertions cite fixture content; no blinded human gold or repeated model judge exists. |
| Outcome inference | 3 | The product claims only a local handoff/no external change and makes no hiring-success claim. |

Finding: passing eight fixtures proves only the frozen behavioral contract. It
does not validate OCR, extraction quality, fairness, or hiring outcomes.

## Adjudication

Release gate: **pass for the bounded local synthetic demo only**. Overall
verdict: **pass with changes**. There are no active vetoes.

All lenses agree on four points:

1. Evidence, proposed state, human confirmation, interpretation, action, and
   outcome are distinct.
2. An arbitrary selected image cannot inherit seeded fixture facts.
3. No candidate assessment or external effect is attempted or reported.
4. Production real-data, privacy, recruiter-value, and model-quality claims are
   not supported.

Highest-leverage remaining work:

1. **Privacy lifecycle:** keep real candidate data disabled until identity,
   minimization, access, retention, export, deletion, and audit are implemented
   and adversarially tested.
2. **Recruiter value:** compare the flow with manual work in observed sessions.
3. **Accessibility and durable recovery:** run a spoken VoiceOver usability
   session and define privacy-safe behavior for process termination.

There was no unresolved specialist disagreement. Safety jurisdiction sets the
real-data boundary; mobile UX owns accessibility proof; recruiter workflow owns
value proof; selection science prevents the deterministic fixture pass from
becoming a model or candidate-quality claim.
