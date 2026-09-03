# Talent Signal Lab

## Outcome

Deliver an internal, product-native Lab that lets an authorized tester enter a
named synthetic world, inspect why a relationship result appears, replay the
same frozen evidence and version envelope, compare a candidate run with a
baseline, and turn a redacted issue receipt into a reviewable Eval Case.

Completion evidence is a real Web journey in which the Lab capsule identifies
the active isolated session, one of five versioned scenarios opens as a product
experience, Signal Lens traces an insight from observation through hypothesis
and evidence status, baseline comparison reports user-visible differences, and
a Reality Receipt can be saved and explicitly promoted without mutating normal
relationship state.

## Boundary

- Lab is available only for an authenticated account on a backend whose
  internal-build capability is explicitly enabled. A second server-side check
  protects every mutation; all evidence remains synthetic regardless of the
  owning account.
- All scenarios are repository-owned synthetic fixtures. They never accept or
  clone production candidate content, bearer tokens, or arbitrary workspace
  identifiers.
- Lab sessions, runs, comparisons, receipts, and promoted Eval Cases live in a
  dedicated control-plane namespace. They do not write canonical Person,
  Pursuit, relationship, evidence, proposal, action, or outcome tables.
- A model or scenario run may produce observations, hypotheses, abstention, or
  review proposals. It cannot confirm identity or facts and has zero external
  effect authority.
- V0 implements five high-value scenarios, deterministic replay, and a pinned
  baseline/candidate envelope. Arbitrary time travel, packet inspection, free
  flag composition, and production-data import remain out of scope.

## Design read

Primary surface: evidence review and internal quality workspace.

Audience: cross-functional internal testers first; a later user-safe subset of
Signal Lens may reuse the explanation model without exposing Trace or version
internals.

Visual character: a quiet instrument inside the existing warm-neutral Web
workspace. The permanent capsule is restrained; the selected world and the
single current explanation receive attention. Vermilion marks the causal seam
between evidence and interpretation, never confidence or human value.

Canonical object: governed relationship state remains canonical. `LabSession`,
`LabRun`, `RealityReceipt`, and `EvalCase` are isolated quality-control objects.
The Lab experience is a disposable projection over a frozen synthetic evidence
snapshot.

## Chosen approach

1. Add explicit Lab contracts and a dedicated PostgreSQL module/migration with
   account scope, version envelopes, fixture hashes, idempotency, receipt
   redaction metadata, immutable run snapshots, and promotion audit.
2. Add internal-build backend routes for a synthetic scenario catalog,
   session lifecycle, deterministic replay/comparison, receipt recording, and
   explicit Eval promotion.
3. Add a small authenticated Web proxy layer and a client Lab provider in the
   workspace layout. The provider owns the capsule, four-task panel, long-press
   / keyboard Signal Lens entry, receipt flow, and session persistence.
4. Build a dedicated `/workspace/lab` experience for the five scenarios and
   baseline comparison while linking promoted receipts into the existing Eval
   surface instead of duplicating its trace viewer.
5. Verify contracts, access denial, canonical-state isolation, idempotent
   replay, comparison, redaction, promotion, accessibility, responsive layout,
   reduced motion, tests, builds, docs, and the real browser surface.

## Milestones

1. **Complete — establish contracts and isolated backend state.** Define the
   versioned objects, scenario fixtures, capability policy, persistence, and
   focused unit/integration tests.
2. **Complete — implement the native Lab experience.** Add capsule, current
   world, scenario replay, Signal Lens, baseline comparison, and receipt UI.
3. **Complete — connect receipt promotion to Eval evidence.** Preserve the
   receipt, decision, and promotion history while exposing the resulting Eval
   Case from the existing quality workspace.
4. **Complete — verify the real surface and safety boundary.** Exercise desktop,
   keyboard, long-press, dark mode, denial, idempotency, stale state, retry,
   canonical non-mutation, and responsive/reduced-motion implementation.
5. **Complete — review and route durable learning.** Apply `REVIEW.md`, update
   only the authoritative architecture/product documentation that gains stable
   truth, and record exact verification evidence.

## Verification evidence

- A temporary isolated PostgreSQL instance ran the full API lifecycle for the
  ambiguous-identity scenario: session, deterministic replay, idempotent retry,
  identical-snapshot comparison, redacted receipt, and explicit human Eval
  promotion. Counts across the ten normal canonical tables were unchanged;
  Lab records showed one session, three runs, one comparison, one receipt, and
  one Eval Case. The temporary database and volume were removed afterward.
- The real Web surface was exercised in the in-app browser through scenario
  selection, candidate replay, Signal Lens, keyboard entry, comparison,
  Reality Receipt creation, promotion, Eval workbench readback, navigation
  recovery, and dark mode. Desktop visual output had no horizontal overflow.
  Responsive breakpoints and reduced-motion behavior are implemented and
  compile-checked; the available browser viewport control did not produce a
  trustworthy narrow-width readback, so narrow-screen appearance is not
  claimed as direct visual evidence.
- `./apps/backend/scripts/ci.sh`: 50 Agent tests and 256 Backend tests passed.
- `pnpm test`: 291 Web tests passed, with one pre-existing skipped test.
- Contract build, Backend/Web typechecks, Web lint, focused Lab tests,
  `pnpm docs:check`, the authenticated production Web build, and
  `git diff --check` passed.
- `./scripts/deploy/testflight-local.sh` rebuilt and deployed migration 039 and
  the backend image. API health, Apple authentication challenge, synthetic
  voice, Relationship Ask provider, and tailnet HTTPS probes passed.

## Re-plan triggers

- If deployment capability cannot be established server-side, Lab ships
  disabled; the client must never infer access from a visual badge alone.
- If a baseline and candidate cannot run from the identical immutable snapshot,
  comparison remains unavailable rather than approximating two live states.
- If receipt redaction cannot be proven before persistence, screenshot/content
  attachment remains absent and the receipt records metadata only.
- If promotion would mutate an existing Eval Case contract in place, create a
  new versioned case and preserve the receipt-to-case lineage.
