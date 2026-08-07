# Product Discussion Index and Design Context

## Status

Completed on 2026-08-06.

## Outcome

Convert the user-provided transcripts for recordings 36 and 37 into
repository-safe source evidence and provisional product synthesis, obtain the
user decisions that materially change the direction, research the cloud-model
privacy boundary, and compile the accepted result into the documentation
system.

## Boundary

In scope:

- preserve provenance, confidentiality, and source limitations;
- separate what the speakers said from project interpretation;
- reconcile the discussion with current product, architecture, design, and
  Agent Wiki decisions;
- identify falsifiable product and retrieval questions;
- ask the user for the missing design context.

Out of scope for this knowledge compilation:

- implementing product UI, code, schemas, or a live provider integration;
- copying the full private transcript into the repository;
- adopting candidate matching, personality inference, or privacy trade-offs as
  accepted product behavior.

## Current evidence

- The supplied attachment contains a complete recording 37 and a recording 36
  that ends mid-sentence while describing the second Wiki layer.
- The transcript is explicitly a polished reconstruction with added tone,
  emotion, pauses, and implied body language. Those additions are not reliable
  primary evidence of speaker intent.
- The strongest product challenge is whether the compiled Wiki and retrieval
  system measurably improve a recruiter's decision-time output over simpler
  raw-record or Markdown retrieval.
- Current project truth already rejects a generic CRM, treats the Wiki as a
  derived semantic layer, and gives the recruiter one evidence-backed
  dependency or safe next action.
- Some source language about discovering hidden traits or matching candidates
  conflicts with the project's assessment and dignity boundaries.
- The privacy discussion contains stakeholder opinions, not verified legal or
  user-research conclusions.
- The user confirmed loss of communication context as the first expensive
  failure and described the compilation object as imported information related
  to a contact.
- The user wants capture, recall, cross-contact matching, overlooked-fact
  recovery, motivation analysis, and some form of personality judgment. The
  last three require separate evidence and selection boundaries before design.
- The user prefers screenshot/text import, a unified contact page, and
  progressive Markdown-to-Wiki handling. The current synthesis translates this
  into one governed memory with lazily compiled projections rather than two
  unrelated storage systems.
- The user would defer redaction and wants source-linked Agent personality
  labels. The safe interpretation remains unresolved: redaction may be deferred
  only in a synthetic or local-only prototype, and contextual hypotheses must
  not become personality assessment or candidate ranking.
- The user accepts one contact entry with context-specific validity, Agent
  identity/context proposals with uncertain roles queued for review, cloud
  processing of real screenshots, and flexible contextual interpretation
  cards.
- Official-source research now covers the China-first privacy baseline,
  cross-border model processing, GDPR and EU AI Act expansion, California ADMT,
  NYC AEDT, cloud security controls, retention, deletion, and real-data release
  gates.
- The user selected China mainland for the first release, cloud multimodal
  extraction without a separate OCR service, Doubao-Seed-2.0-lite with thinking
  disabled and a fixed JSON contract, full-source retention by default, and a
  recruiter-only account model.
- Official Volcano Engine sources confirmed the current model-family pricing,
  direct image understanding, disabled-thinking option, and API response
  storage control. They also exposed a material supplier-selection distinction:
  products with broad or irreversible customer-data authorization are not
  acceptable substitutes for the standard inference API.
- The final authority boundary records import receipts as observed system
  events while keeping model-derived identity, context, facts, motivation,
  commitments, deadlines, and interpretations proposed until recruiter review.

## Approach

1. Capture a minimal source record without storing the full private transcript.
2. Create a provisional note that distinguishes observation, interpretation,
   conflict, and open questions.
3. Validate the `_index/` knowledge contract and inspect the diff.
4. Ask the user the first high-leverage design questions.
5. Research the privacy, cross-border, cloud-model, and recruitment-AI boundary
   against current primary sources.
6. Publish the reviewed research through `_index/pages/`, update the narrowest
   canonical product boundaries, compile the page, and verify the knowledge
   contract.

## Milestones

- [x] Read the knowledge map, documentation workflow, relevant canonical docs,
      and Agent Wiki ADR.
- [x] Inspect the entire supplied attachment and record its incompleteness.
- [x] Add the source record and provisional synthesis note.
- [x] Run `pnpm wiki:test` and the checks covered by `pnpm docs:check`.
- [x] Obtain first-round user answers about the primary failure and broad
      compilation object.
- [x] Obtain second-round direction on inputs, progressive compilation, unified
      contact presentation, and desired recall content.
- [x] Clarify context isolation, automatic Agent proposals, cloud-model use,
      and the contextual personality interpretation direction.
- [x] Produce a dated privacy and security research draft from official primary
      sources.
- [x] Resolve launch jurisdiction, model path, proposal/confirmation, source
      retention posture, notice ownership, and initial account boundary.
- [x] Publish and compile the reviewed research into
      `docs/research/cloud-screenshot-processing-privacy.md`.
- [x] Update the canonical Product, Architecture, Capture to action, and
      Integration boundaries without copying vendor-specific detail into the
      foundation.

## Completion evidence

This intake and knowledge-compilation stage is complete when:

- the attachment is represented by a repository-safe `_index/sources/` record;
- the useful product tensions live in one `_index/notes/` synthesis;
- no private transcript or unsupported speaker intent is committed;
- the reviewed privacy and model research compiles from `_index/pages/` into
  `docs/research/`;
- durable product decisions are reflected once in their canonical documents;
- the documentation checks pass;
- remaining production blockers are clearly separated from settled design
  choices.
