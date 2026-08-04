<div align="center">

# Talent Signal

**Evidence-first relationship intelligence for independent recruiters.**

Capture a meaningful conversation. Review exactly what changed. Decide the
next action. Carry verified context forward.

[Product loop](#the-product-loop) ·
[Trust contract](#trust-is-product-behavior) ·
[Quick start](#quick-start) ·
[Architecture](#system-architecture) ·
[Contributing](#contributing)

[![CI](https://github.com/getyak/talent-signal/actions/workflows/ci.yml/badge.svg)](https://github.com/getyak/talent-signal/actions/workflows/ci.yml)
[![Security](https://github.com/getyak/talent-signal/actions/workflows/security.yml/badge.svg)](https://github.com/getyak/talent-signal/actions/workflows/security.yml)

</div>

---

## Never lose a strong candidate between conversations

Independent recruiters build momentum through details that rarely fit neatly
inside an ATS: a changed priority, an unspoken dependency, a promised follow-up,
or the exact reason timing matters.

Talent Signal turns recruiter-controlled conversation evidence into:

- reviewable facts, ambiguity, and change;
- one current relationship dependency;
- one smallest useful next step—or an intentional `no_action`;
- durable context that remains traceable to its source.

It is not an ATS replacement, a generic CRM, a candidate-ranking engine, or an
autonomous recruiter. It exists to reduce context reconstruction without
replacing relationship judgment.

> [!IMPORTANT]
> Talent Signal is an early product foundation and governed reference
> implementation. It is not yet a production candidate-data system. The
> repository demonstrates the product language, review states, safety
> boundaries, and a cross-platform evidence-to-action loop using synthetic
> fixtures.

## The product loop

```text
intentional capture
→ inspectable evidence
→ proposed understanding
→ recruiter confirmation
→ one approved action or no_action
→ observed outcome
→ relationship continuity
```

[![Talent Signal product architecture](docs/talent-signal-product-architecture.png)](docs/talent-signal-product-architecture.png)

The solid route is the V1 contract. Dashed surfaces are later extensions.
The editable source lives in
[`talent-signal-product-architecture.excalidraw`](docs/talent-signal-product-architecture.excalidraw).

### Capture in flow

Start from an intentional screenshot, share sheet, paste, or upload—where the
recruiter already works. Every surface enters one governed capture inbox.

### Separate evidence from interpretation

The system keeps exact evidence, proposed state, confirmed state, action intent,
and observed outcome distinct. Weak evidence becomes clarification or
`no_action`, never silent certainty.

### Put the human at consequence

Fact confirmation and action approval are independent decisions. Every
write-capable action previews the target, before-and-after value, timing, and
impact before execution.

### Carry forward only what earned trust

Confirmed facts and verified outcomes become relationship memory. Living pages,
timelines, and briefs are rebuildable views over that state—not new sources of
truth.

## Trust is product behavior

| Boundary | Product guarantee |
| --- | --- |
| Evidence | Every consequential claim can resolve to its source, speaker, time, purpose, and scope. |
| Understanding | Proposed, ambiguous, edited, confirmed, dismissed, expired, and superseded states remain distinct. |
| Action | A model may propose an action; only a current, exact human approval can authorize its effect. |
| Outcome | A connector call is not success. The destination must be observed or the result remains explicitly unknown. |
| Memory | Pages, summaries, embeddings, and Agent memory are derived and rebuildable. They cannot confirm themselves or grant permission. |
| Human dignity | The system ranks work attention, never a person's worth, personality, protected traits, culture fit, or acceptance probability. |
| Recovery | Retry, reconciliation, reversal, retention, and derivative deletion are part of the normal contract. |

Read the canonical [product principles](docs/principles.md),
[capture-to-action contract](docs/capture-to-action.md), and
[integration boundaries](docs/integrations.md).

## What exists today

| Surface | Current foundation |
| --- | --- |
| Web | A polished product narrative, deterministic evidence-review demo, authenticated sample workspace, and living candidate page. |
| iOS | A native SwiftUI capture and review flow with screenshot import, reviewable facts, action preview, and fixture-driven tests. |
| Domain | A platform-neutral contract boundary; shared code waits until the iOS and API shapes are stable. |
| Agent system | Provider-neutral boundaries for scoped reads, artifacts, proposals, checkpoints, and governed capabilities. |
| Project Wiki | A checked raw-to-published knowledge workflow with portable links, backlinks, drift detection, and pre-push enforcement. |

See [Delivery](docs/delivery.md) for the evidence-gated sequence from the current
foundation to a production relationship system.

## Quick start

### Web

Requirements:

- Node.js 22;
- pnpm 11.18.0.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

- `/` — product narrative and interactive candidate library;
- `/demo` — deterministic evidence extraction and review states;
- `/login` — optional configured authentication;
- `/workspace` — authenticated sample living page and candidate library.

The local demo processes its deterministic flow in the browser and does not
persist conversation text. Optional server-side AI review is disabled unless
explicitly configured; see the [Web guide](apps/web/README.md).

### iOS

Requirements:

- Xcode 26 or newer;
- XcodeGen 2.45 or newer.

```bash
pnpm ios:generate
open apps/ios/TalentSignal.xcodeproj
```

Select the `TalentSignal` scheme and an iOS 16+ simulator. See the
[iOS guide](apps/ios/README.md) for signing and TestFlight boundaries.

### Verify the repository

```bash
pnpm check
pnpm ios:check
```

`pnpm check` validates documentation, the compiled Wiki, lint, types, tests,
and the production Web build. `pnpm ios:check` regenerates the project, builds
without signing, boots an available simulator, and runs the iOS tests.

## System architecture

Talent Signal uses one governed relationship state across mobile capture,
desktop review, future channels, and external Agents.

[![Talent Signal system architecture](docs/talent-signal-system-architecture.png)](docs/talent-signal-system-architecture.png)

Read the diagram from top to bottom:

1. **Client surfaces** capture intent and display governed state; they do not
   own candidate truth.
2. **Trust and API boundary** binds identity, assignment scope, request
   lifecycle, and private payload handling.
3. **Deterministic runtime** compiles evidence, resolves context, drafts a
   proposal, waits for approval, and guards execution.
4. **Data and memory plane** separates source evidence, temporal relationship
   state, audit, outcomes, and rebuildable Wiki projections.
5. **External adapters** remain replaceable and least-privileged; only the
   connector executor may cross the write boundary.

The editable source lives in
[`talent-signal-system-architecture.excalidraw`](docs/talent-signal-system-architecture.excalidraw).
The full rationale is in [Architecture](docs/architecture.md) and
[Agent system](docs/agent-system.md).

## Repository map

| Path | Owns |
| --- | --- |
| [`apps/web/`](apps/web/) | Next.js narrative, sample workspace, and evidence-review demo |
| [`apps/ios/`](apps/ios/) | Native SwiftUI capture, review, and timely briefing |
| [`packages/domain/`](packages/domain/) | Platform-neutral vocabulary and the future shared-contract boundary |
| [`docs/`](docs/README.md) | Canonical product, architecture, design, delivery, and operating knowledge |
| [`_index/`](_index/README.md) | Raw sources, notes, drafts, and editable Wiki pages |
| [`.agents/skills/`](.agents/skills/) | Reusable product, safety, design, review, and project methods |
| [`evals/`](evals/) | Synthetic cross-surface behavior and safety cases |
| [`.github/`](.github/) | CI, security, release, and contribution policy |

Start documentation work from the task-routed
[project knowledge map](docs/README.md), not from a full-directory read.

## Knowledge that compounds

Talent Signal treats project knowledge as infrastructure:

- `AGENTS.md` stays small and always-on;
- canonical docs own stable product and architecture judgment;
- `.agents/skills/` owns reusable methods;
- plans preserve resumable state for substantial work;
- code, schemas, tests, and checks own deterministic truth;
- repeated corrections become the narrowest durable prevention, then stale
  guidance is removed.

Raw articles begin in `_index/` and compile into checked, portable Markdown:

```bash
pnpm wiki:build
pnpm wiki:test
pnpm wiki:check
pnpm hooks:install
```

See the [Wiki authoring workflow](docs/wiki-workflow.md).

## Contributing

Contributions are most valuable when they improve one complete
evidence-to-outcome slice:

- evidence correctness and ambiguity handling;
- recruiter correction and control;
- safe action preview, approval, observation, and recovery;
- relationship continuity across Web and iOS;
- privacy, deletion, accessibility, and deterministic verification.

Before opening a pull request:

```bash
pnpm install --frozen-lockfile
pnpm wiki:build
pnpm wiki:test
pnpm check
```

For iOS changes, also run `pnpm ios:check`.

Read [Contributing](CONTRIBUTING.md), [Security](SECURITY.md), and the
[review standard](REVIEW.md). Use synthetic data only—never commit private
candidate conversations, credentials, certificates, or production records.

---

<div align="center">

**Signals, not scores. Evidence, not theater. Momentum, with the recruiter in control.**

[Star Talent Signal](https://github.com/getyak/talent-signal) ·
[Open an issue](https://github.com/getyak/talent-signal/issues/new/choose) ·
[Review the roadmap](docs/delivery.md)

</div>
