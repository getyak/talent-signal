# Overnight cross-surface release standard

## Frozen review object

The overnight release object is one accepted commit set at base
`f66581cbf8a1b1154156fc25231a6ff82f11c61f`, exercised only on localhost with
synthetic fixtures.

It contains six distinct review objects:

1. Codex plugin;
2. Chrome browser extension;
3. Web;
4. iOS;
5. shared backend and control plane;
6. one integrated localhost user journey.

The Codex plugin and Chrome extension are separate surfaces. A plugin result
cannot establish active-tab capture behavior, and an extension result cannot
establish the plugin's read/propose-only boundary.

The frozen objective is:

> Take the synthetic `TS-CORE-01` conversation through intentional Chrome
> active-tab capture and explicit Submit, local simulated login, account-scoped
> evidence and proposed state, recruiter fact confirmation, identical confirmed
> state on Web and iOS, separate action approval, one idempotent local effect,
> observed readback, and safe failure/deletion behavior.

The executable contract is
[`evals/overnight-cross-surface-v1.json`](../../evals/overnight-cross-surface-v1.json).

## Data and authority boundary

The run must use only:

- [`evals/candidate-momentum-v1.json`](../../evals/candidate-momentum-v1.json);
- deterministic records derived from that fixture;
- disposable local accounts, credentials, storage, and effect destinations;
- localhost network endpoints.

The following are release vetoes:

- any live candidate conversation, screenshot, account, credential, or record;
- any production OAuth, analytics, telemetry, model, or connector request;
- any live Contacts, Calendar, ATS, CRM, message, notification, or browser write;
- ambient browsing, history collection, or background capture;
- any candidate quality, personality, fit, protected-trait, sentiment,
  engagement, or acceptance inference;
- any fixture, simulated login, record, action, destination, or result that can
  reasonably be mistaken for live state.

Visible labels and persisted classification must say Demo, Fixture, Synthetic,
Simulated, or Local-only where the distinction matters. A README-only
disclaimer is insufficient.

## Gate order

Apply gates in this order. Later scores cannot compensate for an earlier
failure.

1. **Identity, provenance, and scope:** the source, speaker, account, person,
   assignment, time, and evidence IDs are inspectable and correctly scoped.
2. **Authority:** proposed state, confirmed state, action proposal, action
   approval, execution, and outcome remain distinct.
3. **Account isolation and privacy:** only `account-a` can retrieve its episode;
   `account-b` receives a non-disclosing denial; no live data is used.
4. **Effect truth:** retries are idempotent, destination readback is observed,
   and unknown or failed effects never look verified.
5. **Recovery and deletion:** offline, timeout, revocation, deletion, and denial
   have deterministic safe outcomes with no duplicate or false success.
6. **Candidate-assessment boundary:** the system ranks work attention only and
   never evaluates a person's worth or selection probability.
7. **Accessibility and task completion:** the consequential path is available
   on the relevant Web and iOS modes.
8. **Craft:** only after the gates pass, score the twelve Web/browser craft
   dimensions and the independent integrated journey.

An active specialist veto makes the final release gate `block`, regardless of
craft or any other score.

## Small core suite

The behavioral core remains exactly eight cases:

- `TS-CORE-01`;
- `TS-CORE-02`;
- `TS-CORE-03`;
- `TS-CORE-04`;
- `TS-ID-01`;
- `TS-ID-03`;
- `TS-ACT-01`;
- `TS-BOUND-01`.

The suite continues to prove only:

- evidence-bound proposed assertions;
- no-action restraint;
- date/timezone clarification;
- temporal supersession;
- identity abstention;
- third-party attribution;
- availability-versus-consent separation;
- the prohibited fit-score boundary.

It does not prove OCR accuracy, field usefulness, production privacy, general
recruiting quality, or safe live connectors.

Every review-object manifest records all eight case IDs. Plugin, Web, iOS,
backend, and integrated results name the observed disposition and must match the
fixture. Chrome may record a `null` disposition because it transports deliberate
capture rather than interpreting the candidate; its pass evidence must still
show correct case identity, synthetic labeling, explicit Submit, and one
account-scoped payload. Any failed or unrun case names the exact gap.

## Nine cross-surface assertions

Every assertion below must be `pass` with direct evidence in the integrated
manifest. `not_run` is an exact release gap, not partial credit.

### `XS-CAPTURE-01` — intentional active-tab capture

- Chrome capture begins only after a deliberate user invocation.
- Permission is `activeTab`; the extension does not inspect background tabs or
  browser history.
- A preview appears before submission.
- No capture request is sent until the user activates a control labeled
  **Submit**.
- One Submit produces one synthetic backend capture.

Required proof: loaded-extension screenshot, critical-path recording, Network
trace showing no pre-submit request, minimized payload, and backend audit event.

### `XS-AUTH-01` — local simulated login

- The user-facing state says Local simulation or Demo.
- Web and iOS receive the same stable `account-a` scope.
- No Google, Apple, or production identity endpoint is contacted.

Required proof: login screenshots, session traces, and localhost-only network
evidence.

### `XS-PERSIST-01` — account-scoped persistence

- The backend owns source, proposed, confirmed, action, and outcome state.
- Account scope is immutable.
- A restart or new session reads the same version.
- `account-b` cannot retrieve `account-a` state and learns no object existence.

Required proof: before/after datastore trace, restart/readback trace, and
cross-account denial test.

### `XS-STATE-01` — Web/iOS parity

Backend, Web, and iOS must exactly match:

- `account_id`;
- `episode_id`;
- `assignment_id`;
- `confirmed_state_id`;
- `confirmed_state_version`;
- four `TS-CORE-01` fields, values, statuses, and evidence message IDs.

Both clients must visibly distinguish proposed from confirmed state.

### `XS-AUTHORITY-01` — fact confirmation is not approval

- Fact confirmation has its own event ID and scope.
- It creates zero effects.
- The action remains unapproved.
- Action approval has a different event ID, the current proposal version, exact
  target, and exact effect.
- Declining the action does not erase confirmed facts.

### `XS-EFFECT-01` — idempotent local effect

- Two execution attempts share one idempotency key.
- The local destination contains exactly one object.
- Both attempts reconcile to the same destination object ID.
- Destination readback matches the approved effect.
- The UI says verified only after that readback.

### `XS-RECOVERY-01` — five required variants

All five variants are mandatory:

1. `offline`;
2. `timeout_after_effect`;
3. `permission_revocation`;
4. `deletion_cascade`;
5. `cross_account_denial`.

Each variant records what remained safe, preserved, deleted, or denied. None may
produce a false success or duplicate effect. Revocation is checked at execution
time. Timeout reconciles before retry. Deletion revokes retrieval first and
then removes every registered derivative.

### `XS-LABEL-01` — fixture/demo labeling

Every review object must visibly identify non-live state at the point of use,
and backend records must carry the synthetic classification.

### `XS-DATA-01` — no live data

Every manifest declares:

```json
{
  "mode": "synthetic_fixture_only",
  "contains_live_candidate_data": false,
  "live_external_writes": false
}
```

The credential inventory, network allowlist, and artifact scan must support
that declaration.

## Run manifest and artifact contract

Each review object submits one manifest matching
[`evals/schemas/overnight-run-manifest.schema.json`](../../evals/schemas/overnight-run-manifest.schema.json).

Required fields include:

- full base and result commit SHAs;
- environment and localhost endpoints;
- exact fixture metadata and digest;
- synthetic-only classification;
- one deterministic result for each of the eight frozen cases;
- every required command with exact text, status, exit code, and output locator;
- artifacts with type, locator, and SHA-256;
- assertion status and evidence locators;
- the exact gap for every failed or unrun assertion;
- untested behavior.

The example in
[`evals/examples/overnight-run-manifest.example.json`](../../evals/examples/overnight-run-manifest.example.json)
is contract-only and is not release evidence.

Validate a submitted manifest and craft packet with the same dependency-free
validator used by `pnpm eval:core`:

```sh
node scripts/evals/validate-candidate-momentum.mjs \
  --manifest path/to/run-manifest.json \
  --craft-review path/to/web-browser-craft-review.json
```

## Frozen `TS-CORE-01` evidence

All evidence must share the trace ID `TS-CORE-01-localhost` and one accepted
commit set. These eight artifacts are mandatory:

| Artifact | Locator |
| --- | --- |
| Chrome invocation, preview, Submit | `docs/evaluations/overnight/chrome/TS-CORE-01-active-tab-submit.*` |
| Backend canonical trace | `docs/evaluations/overnight/backend/TS-CORE-01-canonical-trace.json` |
| Web review sequence | `docs/evaluations/overnight/web/TS-CORE-01-review.*` |
| iOS review sequence | `docs/evaluations/overnight/ios/TS-CORE-01-review.*` |
| Exact state parity | `docs/evaluations/overnight/final/TS-CORE-01-state-parity.json` |
| Confirmation/approval separation | `docs/evaluations/overnight/final/TS-CORE-01-approval-separation.json` |
| Idempotency and readback | `docs/evaluations/overnight/final/TS-CORE-01-effect-readback.json` |
| Five-variant recovery matrix | `docs/evaluations/overnight/final/TS-CORE-01-recovery-matrix.json` |

Validate the final trace with:

```sh
node scripts/evals/verify-localhost-journey.mjs \
  docs/evaluations/overnight/final/run-manifest.json
```

The validator checks digests, state parity, event-scope separation, zero effect
after fact confirmation, one object after two attempts, observed readback, and
all five recovery variants.

## Review-object acceptance

### Codex plugin

- valid repository-local manifest and local marketplace;
- installable in a disposable Codex profile;
- all eight cases produce schema-valid evidence/proposal output;
- no browser, database, connector, or external-write capability;
- every material assertion cites a fixture message;
- clearly labeled fixture output.

Exact commands are frozen in the cross-surface contract. Installation proof
does not broaden runtime authority.

### Chrome browser extension

- load-unpacked succeeds from `apps/chrome-extension/dist`;
- active-tab-only permission and deliberate invocation;
- exact captured content can be inspected and removed before Submit;
- no submission before explicit Submit;
- offline, revoked permission, backend error, retry, and cancellation preserve
  truthful state;
- keyboard, focus, accessible names, and narrow popup composition are directly
  checked.

### Web

- local simulated login is visible and account-scoped;
- evidence, proposed facts, confirmed facts, action preview, approval, and
  observed result are distinct;
- all eight core cases are reachable without source edits;
- responsive, keyboard, focus, screen-reader, loading, empty, ambiguity, error,
  and recovery states are directly checked;
- fixture/demo labels remain visible.

### iOS

- local simulated account matches Web;
- Web-confirmed state appears with the same canonical IDs/version and evidence;
- evidence, edit, dismiss, confirm, separate approval, result, and recovery are
  executable in Simulator;
- Dynamic Type AX5, VoiceOver order, dark mode, interruption, offline, and
  revocation are directly checked;
- no unrelated selected image can be represented as extracted fixture evidence;
- no external write is claimed.

### Backend and control plane

- local Docker stack starts from the accepted commit and exposes a healthy
  localhost endpoint;
- account-scoped persistence, restart readback, and cross-account denial pass;
- fact-confirmation and action-approval event types are separate;
- execution revalidates permission and proposal version;
- idempotency, timeout reconciliation, destination readback, audit, and deletion
  pass;
- logs and artifacts contain no live candidate data.

### Integrated localhost journey

- every prior object is frozen at an accepted result commit;
- all nine assertions pass;
- the eight required artifacts resolve and match their digests;
- the machine-readable final trace validates;
- direct craft and specialist evidence refers to this same state.

## Web/browser craft contract

The behavior-anchored rubric is
[`evals/web-browser-craft-v1.json`](../../evals/web-browser-craft-v1.json).
It scores twelve separate dimensions from 0 to 100:

1. product specificity;
2. narrative clarity;
3. attention hierarchy;
4. evidence proximity;
5. typography;
6. spacing and rhythm;
7. restrained color and state semantics;
8. materiality;
9. interaction and motion;
10. responsive composition;
11. keyboard, focus, and accessibility;
12. loading, empty, error, and recovery.

Rules:

- each dimension uses its own behavioral anchors;
- dimensions are never averaged, summed, or translated into specialist scores;
- a score of 98 or higher requires direct evidence for that dimension;
- every in-scope dimension must be at least 98 to pass;
- `not_applicable` requires a concrete scope reason;
- every below-98 score records the exact missing behavior and evidence;
- vetoes take precedence;
- findings are limited to three.

The integrated journey receives a separate behavior-anchored 0–100 score. It is
not a mean of the twelve dimensions. The target is at least 95 with direct
evidence. Below 95 requires the exact gap.

Craft packets match
[`evals/schemas/web-browser-craft-review.schema.json`](../../evals/schemas/web-browser-craft-review.schema.json).
The example is explicitly marked `EXAMPLE_ONLY`.

## Independent specialist contract

The product-adjudicator's specialist contract remains independent:

- integer `score` from 0 to 4, or `null` for abstention;
- the lowest material rubric dimension governs where specified;
- direct, supported-inference, or insufficient confidence;
- evidence locator for every finding;
- vetoes remain visible;
- no arithmetic mean across reviewers or constructs.

Required reviewers:

- recruiter workflow;
- evidence safety;
- mobile UX;
- candidate experience;
- selection science.

`design-talent-signal` supplies product-specific design evidence and helps apply
the craft rubric, but does not replace a common 0–4 specialist packet.

Validate every packet and the final panel with:

```sh
python3 .agent/skills/product-adjudicator/scripts/validate_review.py \
  path/to/review-or-panel.json
```

Reviewers receive the same frozen artifact and scenario without prior scores.
Any abstention or missing direct evidence remains visible.

## Correction policy

Round 0 is the first frozen review. At most two correction rounds follow:

- **Round 1:** active gates, broken execution, false success, state divergence,
  account leakage, authorization, privacy, deletion, assessment boundary, or
  accessibility blockers.
- **Round 2:** only the exact remaining workflow/craft gaps, including a
  dimension below 98 or journey below 95.

Every round produces a new result commit, artifact digest, affected assertion
rerun, and affected specialist rerun. No new features or broad polish enter a
correction round.

If the same gate remains after round 2, stop and record `fail` or
`needs_evidence`. Do not create a third patch or average around it.

## Integration and final decision

Integrate in this order:

1. evaluation contract;
2. backend/control plane;
3. Web;
4. iOS;
5. Chrome browser extension;
6. Codex plugin;
7. integrated trace and manifests;
8. specialist reviews;
9. Web/browser craft review;
10. adjudication.

After each accepted commit, inspect ownership and run its focused checks plus
`pnpm eval:core`. A source conflict returns to its owner.

The final decision must include:

- release gate and verdict;
- active vetoes;
- genuine disagreements and resolution basis;
- no more than three findings;
- owner, next proof, and exact pass condition for each finding.

Passing requires:

- `pnpm eval:core`;
- the integrated localhost validator;
- focused implementation checks;
- `pnpm docs:check`;
- no active veto;
- nine passing cross-surface assertions;
- every in-scope craft dimension at least 98 with direct evidence;
- integrated journey at least 95 with direct evidence.

Anything not directly observed remains an exact gap, not a release claim.
