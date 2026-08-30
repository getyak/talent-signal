# Living contact page and relationship memory

## Outcome

Turn People from a directory that only routes into one relationship context
into a calm CRM-quality contact surface. A recruiter should be able to scan a
contact table, open one stable person, distinguish global contact facts from
relationship-scoped memory, inspect provenance and freshness, and use the
bounded Agent to stage contact creation or source intake without granting it
write authority.

Completion is observable when the real authenticated Web surface renders the
new table and contact composition, confirmed contact points read back from the
governed identity store, relationship memory is grouped by decision meaning,
empty optional fields stay absent, responsive states are exercised, and the
selected product/safety/UX review packets validate without a veto.

## Boundary

In scope:

- the Web People table and existing living person page;
- current, masked, recruiter-confirmed contact points with source and freshness;
- explicitly user-authored profile copy, clearly separated from evidence;
- relationship-scoped semantic and episodic memory already owned by knowledge
  snapshots, fact state, and Agent history;
- existing Agent tools for staged contact creation, source intake, review, and
  duplicate resolution;
- a source-grounded design brief and dated evaluation evidence.

Out of scope:

- a configurable general-purpose CRM schema or arbitrary custom objects;
- importing bank, identity-document, family, protected-trait, or unrelated
  personal data because another CRM can store it;
- ambient enrichment, silent web research, candidate scoring, fit, personality,
  or acceptance probability;
- unmasked contact values in directory responses or logs;
- executing email, phone, calendar, ATS, or external CRM writes from this page;
- replacing canonical state with generated Wiki prose, embeddings, or Agent
  conversation history.

## Current evidence and unknowns

- People already owns stable person identity and multiple relationship
  contexts. The current directory is visually list-like but has no explicit
  profile column or Agent-create entry.
- `person_profiles` already stores user-authored headline and summary separately
  from evidence, but the living person header does not render it.
- confirmed identity handles already preserve masked display hints, source
  resource, validity, and lifecycle events. The relationship-scope read does
  not currently expose those safe projections.
- knowledge snapshots already distinguish commitments, constraints, deadlines,
  conflicts, relationship history, observed outcomes, and next actions, but
  the current Wiki UI flattens most of them into one brief.
- the existing Agent can stage contact creation, open governed source intake,
  route to fact review, and open duplicate-person review. No new effect
  authority is required.
- the workspace has unrelated user edits in iOS UI tests, an iOS check script,
  and a prior research plan. This work owns Web People/contact components,
  the narrow people read contract/backend query, this plan, research, and
  evaluation artifacts only.

## Chosen approach

Keep `Person` as the stable CRM record and `RelationshipContext`/Pursuit as the
role-specific entry, rather than flattening every search into the person.
Expose only safe current contact-point projections on relationship readback.
Render the user-authored profile as authored context, not evidence. Recompose
the existing knowledge snapshot into four progressive memory groups: current
understanding, valuable relationship memory, unresolved dependencies, and
history/outcomes. Preserve exact source review and Agent history as the deeper
layers.

Use the existing Agent control plane. The new UI makes its typed tools easier
to discover, but contact creation and data intake remain proposals with
identity matching, human review, canonical readback, and audit history.

## Rejected directions

- A single editable profile blob would make contact facts, interpretation, and
  memory impossible to govern independently.
- A universal field builder in this slice would pull the product toward a
  generic CRM before the relationship-momentum loop is proven.
- Showing every empty field would create form density and encourage unnecessary
  collection; optional sections stay absent until authorized data exists.
- Automatically enriching profiles from the public web would broaden purpose,
  exposure, retention, and identity risk without a user-approved research task.
- Making the Agent chat the record would make truth and recovery dependent on a
  generated transcript rather than the canonical domain.

## Milestones

1. Freeze the design/data boundary and current implementation evidence.
2. Record source-grounded CRM and Agent-memory research.
3. Implement and test the safe contact projection, People table, contact header,
   structured Memory composition, and Agent tool entry points.
4. Render the authenticated surface at desktop and mobile widths and repair
   hierarchy, overflow, interaction, and accessibility defects.
5. Run evidence-safety, recruiter-workflow, and mobile-UX reviews; validate and
   adjudicate the packets; route durable design judgment.

## Proof

- backend tests prove account scoping, masked-only contact projection, source
  authorization, current validity, and profile/evidence separation;
- Web tests prove absent optional fields are hidden, contact points retain
  provenance/freshness, memory types map to stable sections, and Agent creation
  remains staged;
- focused lint, typecheck, tests, backend checks, build, and `pnpm docs:check`
  pass;
- browser evidence covers a profile-rich contact, no optional data, long mixed
  script content, mobile width, keyboard focus, and reduced motion;
- review packets cite the same frozen build and contain no active safety veto.

## Reconsider when

Introduce arbitrary custom fields only after repeated recruiter evidence shows
that the current person/relationship ontology cannot express a frequent,
decision-relevant fact. Introduce external enrichment only through a separate
purpose-bound research proposal with identity review, source provenance,
freshness, deletion, and cost/benefit proof.

## Result — 2026-08-31

The smallest complete slice is implemented. People is now an explicit contact
table with an Agent-assisted creation entry. The creation intent opens an
isolated identity-check-first workspace rather than inheriting an existing
person's context. The contact page renders authored orientation separately from
evidence, exposes only masked current contact points backed by active governed
sources, and groups relationship Memory into valuable memory, unresolved
questions, and history/outcomes. Empty record sections remain absent.

Runtime proof used the authenticated synthetic `fixture-alpha` account. The
desktop directory, desktop contact page, dedicated creation workspace, and a
390-by-844 mobile contact page were captured in
`docs/evaluations/2026-08-31-web-living-contact-page/`; the measured mobile
document had no horizontal overflow, the collapsed Agent did not displace the
record, and Ask Agent restored it. Web Vitest passed 286 tests in 51 files,
backend Vitest passed 203 tests in 27 files, and lint, typecheck, documentation
checks, contract validation, and a production Web build passed.

The adjudicated result is `pass_with_changes` with no active veto. The next
proof is deliberately narrower than a larger CRM build: exact per-field source
navigation and live revocation, recruiter testing of optional post-identity
enrichment, and dock-clearance/keyboard/200-percent-zoom/screen-reader checks.
