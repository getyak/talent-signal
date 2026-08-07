# Product output value, knowledge complexity, and privacy tensions

- Date: 2026-08-06
- Author: Codex synthesis for user review
- Context: Design-intake synthesis before any deeper product or interface
  compilation
- Related sources:
  [Recordings 36 and 37](../sources/2026-08-06-product-discussion-recordings-36-37.md),
  [Relationship-memory concept feedback](../sources/2026-08-06-relationship-memory-concept-feedback.md)
- Related pages:
  [Principles](../../docs/principles.md),
  [Product](../../docs/product.md),
  [Architecture](../../docs/architecture.md),
  [Capture to action](../../docs/capture-to-action.md),
  [Design system](../../docs/design-system.md),
  [Delivery](../../docs/delivery.md),
  [ADR 0004](../../docs/decisions/0004-agent-wiki-knowledge-layer.md),
  [Recruiter discovery and wedge validation](../pages/recruiter-discovery-and-wedge-validation.md)

## Status

Provisional synthesis. This note records questions and design hypotheses, not
accepted product truth. Privacy, provider, proposal-authority, and source
retention decisions resolved later on 2026-08-06 are reflected below; recruiter
workflow value and the first repeatable return moment still require field
evidence.

## User-confirmed direction

The user clarified that Talent Signal should be opened when a recruiter:

1. remembers or encounters information related to a contact and wants to bind
   and preserve it;
2. wants to recover information already associated with that contact;
3. asks an Agent to find related or potentially matching people.

The first release's most expensive failure is confirmed as loss of
communication context. The user currently describes the deep-compilation object
as all imported information related to a contact.

The desired output remains underspecified as “good feedback during use.” The
user also wants the system to recover overlooked explicit facts and reason
about motivation and personality. The first two can be explored with evidence
and visible uncertainty. Automated personality inference from private
conversation conflicts with the current product boundary and remains unresolved
rather than accepted.

The user further clarified:

- screenshot and pasted text are the primary first-release inputs;
- a small corpus may remain in Markdown, while a larger corpus may use a Wiki
  for management and Agent retrieval;
- one person should have one complete contact page with position labels;
- the recall view should include the last meaningful conversation, current
  motivation, mutual commitments, and deadlines;
- redaction may be deferred from the first release;
- personality labels should combine Agent reasoning, recruiter observations,
  and traceable supporting information;
- recruiters want one contact entry while expecting the system to preserve the
  context in which each item is valid;
- the Agent should propose identity and context automatically, file useful
  material when it can determine the relationship, and queue uncertain roles
  for recruiter confirmation;
- the first release will send real screenshots to a cloud recognition model;
- a flexible contextual interpretation card satisfies the personality need;
- the desired privacy posture is compliance with applicable law without
  operating at the legal edge, and deeper privacy research is required.
- the first release targets China mainland and does not need a standalone OCR
  service;
- the initial extraction model is Doubao-Seed-2.0-lite with deep thinking
  disabled and a fixed JSON contract;
- Mini may later handle clear, standardized screenshots after evaluation,
  while blurred or complex screenshots fall back to Lite; Pro is excluded from
  ordinary extraction;
- the full original screenshot should be retained by default for re-review;
- the first product serves the recruiter and does not require a candidate
  account or a reciprocal platform relationship.

These are design inputs, not yet accepted architecture. In particular, corpus
size is not the only source of complexity, position labels do not by themselves
prevent context leakage, redaction is narrower than privacy, and source-linked
personality labels remain unsupported candidate assessment.

The dedicated regulatory and architecture draft is
[Cloud screenshot privacy and security research](../pages/cloud-screenshot-processing-privacy.md).

The safe decision on the remaining authority boundary is now:

- the import receipt is a confirmed system event;
- model-derived identity, context, facts, motivation, commitments, deadlines,
  and interpretations remain `proposed`, even when automatically filed under a
  contact's pending area; this placement does not widen retrieval scope;
- a user's explicit field-level decision can create confirmed temporal state;
- fact confirmation never grants permission for an external action;
- the recruiter or recruiting organization owns the primary candidate notice
  and legal-basis decision, while Talent Signal supplies the processor-side
  rights, audit, retention, and deletion mechanisms.

Full-source retention is accepted as the initial product default, not as
permanent retention. Production import still depends on a visible,
purpose-bound expiry policy and a verified deletion cascade.

## Observations

### The source describes two different products at once

The developer describes a capture-and-memory system:

1. import a recruiter-controlled screenshot, recording, resume, or research
   artifact;
2. route and interpret the material;
3. associate it with a person;
4. compile a candidate-centered knowledge representation;
5. expose the representation across mobile, web, and Agent surfaces.

The adviser evaluates a decision-support system:

1. a recruiter encounters a concrete business question;
2. the system retrieves the relevant history;
3. it reconstructs the current context;
4. it returns a useful, situation-specific answer;
5. the answer changes the recruiter's next decision.

These are related but not equivalent. The first describes how information
enters and persists. The second describes why the user returns and pays.

### The central critique is a counterfactual

The most useful challenge is not “the Wiki is unnecessary.” It is:

> What recruiter decision becomes materially better because the Wiki exists,
> compared with direct access to the same governed records?

That is already compatible with ADR 0004, which says to reconsider the
compiled layer if governed records provide equally effective understanding or
if measured retrieval quality shows more staleness and ambiguity than value.
The discussion therefore supplies an evaluation obligation, not evidence to
reverse the decision.

### The privacy discussion contains an unresolved product conflict

The developer recognizes privacy as an architecture-shaping concern that was
deferred for speed. The adviser frames formal compliance as the baseline and
suggests that high utility may make users accept broader data access.

The second claim is a stakeholder belief, not a safe design assumption.
Candidate conversations contain information about people who are not
necessarily the product user. Recruiter convenience cannot independently grant
candidate consent, widen purpose, or remove retention and deletion duties.
Privacy must therefore shape capture, retrieval, model access, derived
knowledge, previews, and deletion—not appear only as compliance copy.

### The source's outcome language exceeds the current product boundary

The discussion sometimes describes value as candidate matching, discovery of
hidden traits, and conclusions the recruiter may have missed. Those phrases can
invite unsupported assessment or person-scoring.

Talent Signal's current safer and more specific contract is to recover explicit
evidence, show what changed, identify a current assignment dependency, expose
ambiguity, and propose one recruiter-controlled action or `no_action`. This can
still produce high business value without inferring personality, general fit,
worth, or acceptance probability.

### A second conversation tests comprehension rather than market demand

A private conversation with a participant outside recruiting produced several
successive category translations:

1. person profiling plus logs, reminders, and progress management;
2. a relationship-memory assistant;
3. a human-network database or cross-platform CRM;
4. an action-time assistant for understanding and drafting a reply.

This is useful evidence that the current explanation can foreground system
shape before a concrete user outcome. It is not recruiter validation: the
participant did not use the product, manage active searches, or describe a
measured recruiting failure.

### The self-generated value moment appeared at action time

The participant invented a concrete personal use case only when considering a
conversation that required a response but did not justify rebuilding context
manually. The useful translation is not automatic messaging. It is that memory
becomes valuable when it changes an imminent decision or reduces reconstruction
at the point of action.

### A separate app is not an assumed return surface

The participant expected to scroll existing chat history rather than open a
relationship app. Recruiters may behave differently, but the response creates
a testable distinction between:

- immediate value after intentional capture;
- just-in-time recall before the next contact;
- a small attention queue;
- deliberate review in a person and assignment page.

The living page may own inspection and governance without becoming the primary
daily trigger.

### Wrong-target automation is an authority problem

The participant supplied a plausible failure involving similar identities,
overlapping context, and a consequential message target. Better matching can
reduce probability but cannot transfer responsibility. Target, content, timing,
and effect need visible independent approval even if the model is highly
confident.

## Interpretation

### 1. Treat knowledge architecture as an earned advantage

The Wiki should not justify itself through conceptual elegance. It earns its
cost only if it improves at least one difficult property that simpler retrieval
cannot preserve reliably:

- correct identity and assignment scope;
- temporal state reconstruction;
- contradiction and supersession handling;
- provenance for material claims;
- authorized retrieval at use time;
- deletion and derivative invalidation;
- cross-session continuity;
- explanation of why a proposed action is current.

A larger context window or raw Markdown may be a valid baseline. The benchmark
must include stale, conflicting, unauthorized, ambiguous, and deleted evidence,
not only clean semantic-recall questions.

### 2. The contact-centered memory is the substrate; restored context is the
first value

The user's clarification reveals three related jobs:

| Mode | Recruiter thought | Product responsibility |
| --- | --- | --- |
| Capture | “I learned or remembered something about this person.” | Bind the new source or note to the correct person and relationship context. |
| Recall | “What do I already know before I speak or decide?” | Reconstruct current, source-linked context without flattening conflict or time. |
| Relate | “Who is connected or may satisfy this explicit need?” | Retrieve evidence-backed candidates or connections without converting relevance into candidate worth. |

The first release should prioritize capture and recall because the user named
lost communication context as the most expensive failure. Agent matching is a
later and higher-risk projection over the same governed state.

“All information about a contact” is not yet a safe compilation contract. One
person may be a candidate in one assignment, a client in another, and a referrer
elsewhere. The product needs one identity with scoped relationship spaces, not
one unrestricted dossier that silently mixes every context.

The primary value-bearing output is therefore likely a reconstructed
relationship context: what was explicitly observed, what the recruiter
confirmed, what remains their subjective note, what is the system's
interpretation, and what is now relevant. A decision brief, living page, or
Agent answer can be a view of that object rather than a competing record.

### 3. “Output quality” is necessary but not the only product value

The adviser calls final answer quality the only standard. That is too narrow
for a relationship product. A persuasive but wrong, stale, over-scoped, or
privacy-violating answer can be more harmful than no answer.

The product must optimize a compound outcome:

> useful decision improvement × evidence correctness × appropriate authority ×
> recoverability

If any factor collapses, fluency alone is not value.

### 4. The design should expose causality, not infrastructure

The user should experience how one source changes one current understanding
and why that change alters or retracts the next action. Router names, Agent
counts, storage layers, and Wiki compilation are implementation details unless
the user is inspecting trust, recovery, or open-source architecture.

This supports the current vermilion redline grammar, but the grammar must prove
an operational result rather than remain a polished explanation. The strongest
interaction is not merely “remove evidence and see the summary change.” It is
“change the evidence and see the recruiter decision become safer, different,
or intentionally unresolved.”

### 5. Privacy can become part of the value proposition

Privacy need not be framed only as friction. Intentional capture, on-device
preprocessing, visible scope, precise retention, reversible compilation, and
source-linked deletion can make the system more trustworthy than pasting an
unbounded conversation corpus into a general model or note tool.

This claim still needs user evidence. It should not be marketed as an advantage
until the real data path and deletion behavior prove it.

### 6. Relationship memory is a substrate, not yet the market category

The broad relationship-memory concept can support recruiter continuity without
becoming the initial product promise. A generic human-network product has
diffuse triggers, variable stakes, and no demonstrated willingness to maintain
another destination. Candidate momentum supplies a narrower repeated job:
preserve a meaningful change and resolve the next dependency before its window
closes.

The product description should therefore distinguish:

- **substrate:** governed temporal relationship memory;
- **current wedge:** candidate and client dependency continuity for independent
  recruiters;
- **possible later projections:** cross-contact retrieval, client and referrer
  views, or draft actions;
- **different product categories:** general personal CRM, social reply
  automation, personality modeling, or autonomous relationship management.

### 7. Need depends on relationship dynamics, not contact count alone

The participant suggested that a person with few contacts can rely on memory.
The deeper hypothesis is:

> need rises with active relationship load, state-change frequency,
> fragmentation, reconstruction difficulty, and the consequence of a missed
> commitment; it falls with capture, review, privacy, and trust cost.

A small but fast-moving assignment can create more need than a large stable
network. Recruiter research should recover the threshold from recent episodes
rather than ask for an abstract contact count.

### 8. The recruiter carries a bilateral dependency graph

The next field interview should not examine candidate memory alone. Recruiters
carry changing state on both sides:

- candidate motivation, constraints, commitments, and decision windows;
- client outcomes, stakeholder alignment, feedback, and promised answers;
- dependencies where one side controls information required by the other.

The likely value-bearing object is the current cross-side dependency: what is
unresolved, who controls the answer, when it matters, which evidence supports
it, and the smallest appropriate next step. The dedicated field protocol is
[Recruiter discovery and wedge validation](../pages/recruiter-discovery-and-wedge-validation.md).

## Refined progressive compilation model

### Compile when relationship complexity requires it

The useful distinction is not simply:

> small data = Markdown; large data = Wiki

A small corpus can already require governance when it includes two people with
the same name, several assignments, a contradiction, private third-party
content, or a deletion request. A large corpus can remain simple if it is one
well-scoped source used for one question.

Use one progressive system:

1. preserve the imported screenshot or text as a source record;
2. extract addressable evidence spans without rewriting the source;
3. bind the source to a reviewed person and relationship context;
4. maintain versioned current state and interpretations;
5. generate contact pages, indexes, summaries, and Wiki navigation only when
   retrieval or continuity benefits from them.

Compilation triggers should include:

- number and length of sources;
- number of relationship and assignment contexts;
- contradictory, expired, or superseded state;
- cross-source and cross-person questions;
- retrieval frequency and latency;
- authorization, retention, and deletion requirements.

The Wiki is therefore a rebuildable projection over the same governed memory,
not a second storage architecture introduced after a size threshold.

### Raw evidence does not support ordinary CRUD

“Add, query, and delete” apply, but editing must be separated:

- add a new source or recruiter note;
- query authorized source and derived state;
- correct an extracted assertion or add a superseding event;
- delete a source and invalidate every registered derivative.

The system should not silently rewrite an imported screenshot transcript or old
message to make the current page look clean. The source remains inspectable;
current understanding changes through versioned correction, conflict, expiry,
or supersession.

### One person page needs scoped relationship memory

The user can experience one complete person page without storing one flat,
unrestricted dossier.

The conceptual object should contain:

| Layer | Content | Sharing rule |
| --- | --- | --- |
| Person identity | reviewed name and stable identifiers | shared only where identity is authorized |
| Relationship contexts | candidate, client, referrer, assignment, organization | separately scoped |
| Source evidence | screenshots, pasted text, transcript spans | retains original purpose and access |
| Confirmed state | explicit preferences, commitments, deadlines, constraints | temporal and context-specific |
| Recruiter notes | the recruiter's attributed observations | never presented as candidate fact |
| Agent hypotheses | source-linked possible interpretations and alternatives | provisional, contestable, expiring |
| Compiled views | contact page, recall brief, search result, Wiki page | rebuilt from authorized layers |

Position labels can help navigation, but they cannot establish whether evidence
may be reused. The page should begin in one selected context and let the
recruiter deliberately widen the view.

### Replace personality labels with contextual interpretation cards

The user wants Agent reasoning plus recruiter observation plus traceable
evidence. A safe first design can represent that as an interpretation card:

- **Observed:** the exact statement or behavior;
- **Recruiter note:** the user's attributed interpretation;
- **Agent hypothesis:** one bounded explanation plus credible alternatives;
- **Scope:** the relationship or assignment where it may matter;
- **Status:** proposed, confirmed by recruiter as their working view,
  contested, expired, or dismissed;
- **Prohibited use:** no personality score, candidate-quality conclusion,
  automatic ranking, or cross-context reuse.

For example, “asked twice for decision scope before discussing compensation”
is an observation. “May prefer role clarity before committing” is a contextual
hypothesis. “Risk-averse personality” is a stable trait label the evidence does
not establish.

If the intended feature is genuinely a personality assessment used in hiring,
it is a different product program. It would require a defined construct and job
criterion, standardized administration, reliability and validity evidence,
fairness analysis, candidate-facing governance, and professional review. A
traceable chat excerpt alone does not satisfy those requirements.

### Redaction may be deferred only inside a bounded prototype

Redaction and privacy are not interchangeable. Automated redaction may be
deferred if the first release:

- uses synthetic or deliberately sanitized fixtures; or
- keeps user-authorized sources local, outside third-party model, analytics,
  logs, and shared evaluation systems.

If real screenshots enter a server or third-party model, the first release must
already define identity review, purpose, access, storage, vendor handling,
retention, export, and derivative deletion. These are properties of the data
path, not later policy polish.

## Source claims to keep, translate, or reject

| Source idea | Treatment | Reason |
| --- | --- | --- |
| Business output should govern engineering investment | Keep | It is the strongest prioritization correction in the discussion. |
| Compare Wiki retrieval with direct Markdown or raw-record access | Keep as an evaluation requirement | It makes the architecture falsifiable. |
| CRM storage and polished profiles are not the core value | Keep | It aligns with the current product and design boundaries. |
| Final answer quality is the only product standard | Translate | Usefulness must be combined with grounding, scope, authority, privacy, and recovery. |
| Discover hidden candidate traits | Split into separate constructs | Recover overlooked facts; permit clearly attributed recruiter notes; treat motivation as a source-linked hypothesis; prohibit model-generated personality or fit conclusions from private chat. |
| Users will relax privacy concern when utility is high | Preserve only as an unverified stakeholder belief | Utility does not establish consent, purpose, or rights for candidate data. |
| Compliance standards complete the privacy work | Reject | Legal compliance, product trust, data minimization, authorization, and deletion are related but distinct obligations. |
| Strong foundations are justified by prior failure | Preserve as rationale, not proof | Past pain can explain the architecture but cannot substitute for current outcome evidence. |

## A falsifiable retrieval and output test

Before investing further in the compiled knowledge layer, evaluate the same
recruiter tasks through three progressively richer approaches:

1. direct access to repository-safe raw records or Markdown;
2. simple structured facts plus deterministic filters;
3. the compiled Agent Wiki with temporal, provenance, and scope metadata.

Use cases should include:

- reconstruct the current dependency from several conversations;
- identify an explicit deadline or commitment that a recruiter overlooked;
- resolve contradictory or superseded information;
- refuse to combine evidence from the wrong assignment;
- produce `no_action` when evidence is weak;
- update the answer after correction;
- stop retrieving a deleted source and every derivative;
- explain which evidence changed the proposed next action.

Measure:

- decision-task correctness;
- material-claim grounding;
- critical omissions;
- unsupported or over-scoped claims;
- stale-state errors;
- time to a usable recruiter decision;
- recruiter correction burden;
- token, latency, and operational cost;
- deletion and permission correctness;
- maintenance complexity.

The Wiki wins only if its advantage on consequential cases justifies its added
cost. A fluent answer on a clean prompt is not enough.

## Design compilation gates

The user has clarified the first-order job and failure:

- the product opens around a remembered, newly captured, or retrieved
  contact-related context;
- the first release should prevent loss of communication context;
- imported contact-related information is the intended compilation input;
- cross-contact matching is desired as an Agent capability;
- screenshot and pasted text are the primary inputs;
- the recall surface should lead with the last meaningful exchange, current
  motivation, commitments, and deadlines;
- the user prefers one visible person page and progressive Markdown-to-Wiki
  management;
- the visible person page should preserve separately valid relationship and
  assignment contexts;
- the Agent should propose identity and context, with uncertain roles routed to
  a review queue;
- real screenshots will enter a cloud recognition model;
- flexible contextual interpretation cards satisfy the personality need.

Do not compile this note into a broader product direction until field evidence
clarifies:

1. what observable event proves continuity improved a recruiter decision;
2. whether the strongest return moment is after capture, before contact, in an
   attention queue, or during deliberate review;
3. whether “matching” means authorized evidence retrieval or candidate
   evaluation;
4. whether bilateral candidate/client dependency resolution recurs strongly
   enough to justify the wedge.

## Open questions

### Recall output and proof

1. Does the proposed default order work: last meaningful exchange; explicit
   motivation; mutual commitments; deadline; unresolved question; exact
   evidence and history on demand?
2. What observable event proves “good feedback”: the recruiter found a forgotten
   fact, avoided asking the same question, corrected a false memory, acted
   before a deadline, resolved a client dependency, or received a useful
   response?
3. Will a recruiter voluntarily return with a second live case after using the
   first compiled brief?

### Matching and personality boundary

4. Give one representative matching question the Agent should answer. Is it
   retrieving people with explicit evidence—for example a skill, location,
   availability, or experience—or ranking who is a better person or hire?
5. May a contextual interpretation card appear in matching results, or must it
   remain inside the selected person's relationship context?

### Wedge and surface

6. Is the first repeatable value moment the import result, pre-contact recall,
   Today, or an end-to-end flow connecting capture to a later decision?
7. Which recent candidate/client case best demonstrates a dependency that the
   current workaround failed to carry?
8. Does an experienced recruiter want continuity and evidence while a novice
   recruiter wants coaching, and should the first release explicitly avoid
   serving both?

## Possible durable update

No new canonical product update is justified by the second conversation.
Existing privacy and authority decisions have already updated their owning
canonical documents.

After user review:

- repeated target-recruiter evidence about the primary moment and output may
  update
  `docs/product.md`;
- a measured Wiki-versus-baseline threshold may refine ADR 0004 or become an
  evaluation plan;
- the chosen surface and interaction theorem should become an execution plan
  before implementation.
