---
id: recruiter-discovery-and-wedge-validation
title: Recruiter discovery and relationship-continuity wedge validation
summary: Defines how to distinguish concept feedback from field evidence and test whether candidate/client continuity improves a recruiter's next decision.
status: published
language: en
target: docs/research/recruiter-discovery-and-wedge-validation.md
---

# Recruiter discovery and relationship-continuity wedge validation

- Status: product research and validation protocol; not canonical product truth
- Checked: 2026-08-06
- Scope: independent recruiters and boutique search operators who maintain
  changing candidate and client-side relationships
- Related evidence:
  [concept-feedback source record](../../_index/sources/2026-08-06-relationship-memory-concept-feedback.md)
  and
  [provisional product synthesis](../../_index/notes/2026-08-06-product-output-value-and-privacy-tensions.md)

## Governing position

A conversation with a non-recruiter can reveal category confusion, plausible
use moments, objections, and failure scenarios. It cannot prove recruiter
demand, willingness to pay, retention, or operational improvement.

The current research question is therefore not:

> Do people like an AI relationship-memory product?

It is:

> When a recruiter carries changing candidate and client context, does
> evidence-backed continuity reduce reconstruction or prevent a consequential
> missed dependency enough to justify capture, review, and trust cost?

Relationship memory is a possible substrate. Candidate momentum remains the
current wedge until target-user behavior supplies stronger evidence for a
different category.

## What the concept feedback contributes

### It exposes category drift

The concept was understood successively as:

1. person profiling plus logs and reminders;
2. a relationship-memory assistant;
3. a human-network database or cross-platform CRM;
4. an action-time reply assistant.

The movement is diagnostic. Storage and knowledge architecture explain how the
system works, but a concrete decision-time output explains why someone returns.
Product research should begin with a recent expensive moment, not with surfaces,
Agents, graphs, or Wiki architecture.

### It rejects the static person model

People change, disclose selectively, contradict themselves, and behave
differently across relationships. The product must not promise to model “what
this person is.”

The safer and more useful object is temporal relationship state:

- what was explicitly observed;
- who said it and in which relationship or assignment;
- what the recruiter confirmed;
- what remains a bounded interpretation;
- what was later contradicted, retracted, expired, or superseded;
- which unresolved dependency matters now.

### It suggests a demand-intensity model

Contact count alone does not determine need. A more useful hypothesis is:

> demand intensity rises with active relationship load, state-change
> frequency, information fragmentation, reconstruction difficulty, and the
> consequence of a missed commitment; it falls as capture, review, privacy, and
> trust cost rise.

A small set of fast-changing, high-consequence relationships may create more
need than a large stable contact list. Field interviews must identify the
threshold from real episodes rather than ask recruiters to estimate it in the
abstract.

### It challenges destination-first design

The participant expected to scroll existing chat history rather than open a
separate relationship app. This is not evidence that recruiters behave the
same way, but it creates a discriminating surface question:

- is value strongest immediately after capture;
- just before the next conversation or decision;
- in a small Today queue;
- or inside a deliberate person and assignment review?

The living page may be essential for inspection and governance without being
the daily entry point.

### It independently finds the action-authority boundary

A wrong person, similar avatar, overlapping conversation, or stale context can
turn convenient automation into relationship harm. Better matching reduces
error probability but does not grant authority. Target, content, timing, and
effect remain visible and independently approved before consequential action.

The product should help a recruiter recover context and draft a next step. It
must not quietly simulate care, send a message, or widen relationship evidence
because automation feels convenient.

## The bilateral recruiter job

A recruiter does not manage an isolated candidate profile. The recruiter
carries two changing relationship states and the dependencies between them.

| Candidate side | Client side | Cross-side dependency |
| --- | --- | --- |
| motivation, constraints, competing processes, commitments, decision windows | role outcomes, decision criteria, stakeholder alignment, feedback, promised answers | which unresolved question blocks movement, who controls the answer, and when it expires |
| what the candidate explicitly said | what the client or hiring manager explicitly said | what may be relayed, what remains uncertain, and who owns the next move |
| corrections, hesitation, changed availability | changed scope, delayed feedback, internal disagreement | whether either side is still acting on stale information |

The valuable unit is not a richer dossier. It is one current dependency:

- what is unresolved;
- which side or person controls it;
- what evidence supports that understanding;
- when it matters;
- the smallest appropriate next step or `no_action`.

## Field interview protocol

### Set the frame

Invite the recruiter to reconstruct work rather than endorse a product:

- explain that the session is workflow research, not a sales call;
- request one recent candidate episode and one recent client episode;
- remove names, companies, contact details, and confidential message content;
- ask permission separately before recording or retaining any artifact;
- begin without a full product explanation so the proposed system does not
  rewrite the recruiter's memory of the problem.

### Reconstruct a candidate episode

Ask for the most recent case in which candidate context changed or became hard
to carry:

- What happened first, and what happened next?
- What did the candidate state explicitly?
- What was the recruiter's interpretation rather than an observed fact?
- Which constraint, commitment, concern, or deadline mattered?
- Where was each item stored?
- What did the recruiter do before the next contact to recover context?
- What was forgotten, repeated, delayed, or acted on while stale?
- What was the operational or relationship consequence?

Replace “Does this happen often?” with “When did this last happen?” General
opinions do not reveal the actual workflow.

### Reconstruct a client episode

Use the same event-level method:

- What did the client initially request?
- Which requirement, stakeholder view, or decision criterion later changed?
- Which important expectation was absent from the formal role brief?
- Who actually held the missing answer?
- What feedback or commitment was delayed?
- How did the recruiter keep multiple stakeholders and candidates aligned?
- When did old client context continue to influence current work?

### Trace the connection between both sides

For each episode ask:

- Which candidate question required a client answer?
- Which client concern required candidate evidence or clarification?
- Who owned the next step?
- What was the real decision window?
- What did each side believe that the other side did not know?
- Where could the recruiter safely clarify, and where would inference be
  dangerous?

This tests whether bilateral dependency resolution is a stronger product unit
than generic contact management.

### Compare with the real fallback

Inventory the recruiter's current method:

- chat search, pinned conversations, memory, notes, spreadsheets, ATS, CRM,
  calendar, reminders, or an assistant;
- what is recorded formally and what remains in the recruiter's head;
- why important details are sometimes not recorded;
- how long capture and later reconstruction take;
- when records stop being updated;
- which step disappears under interruption or workload;
- what error or reconciliation work the current method creates.

The relevant competitor is often the current workaround, not another AI
product.

### Present only the smallest product claim

After the recruiter finishes the reconstruction, replay the episode:

> The unresolved issue appears to be X. The candidate supplied Y, the client
> controls Z, and the decision window is T. The current workaround required
> rebuilding this across these surfaces. Is that accurate?

Only after correction, test a narrow flow:

1. intentionally import one meaningful source;
2. show what changed and the exact support;
3. let the recruiter correct and confirm the current state;
4. identify one dependency and its owner;
5. propose one editable next step or `no_action`;
6. require a separate decision before any external effect.

Ask where this would have changed the real episode, where it adds work, and
which plausible error would cause abandonment.

## Evidence hierarchy

Treat signals in descending strength:

1. the recruiter voluntarily reuses the flow on another live case;
2. a source-linked brief changes or clarifies a real next action;
3. the flow recovers a material commitment, constraint, or deadline that the
   current method missed;
4. measured reconstruction time or correction burden improves on the fallback;
5. the recruiter supplies another anonymized recent episode;
6. the recruiter describes a concrete past failure and cost;
7. the recruiter says the concept sounds useful.

The last item is comprehension feedback, not validation.

## Concierge test

Before expanding the product category, run a bounded test with target
recruiters:

1. use a small number of deliberately anonymized or synthetic recent episodes;
2. compile the same input into explicit evidence, reviewed state, one current
   dependency, and one proposed action;
3. compare the result with the recruiter's normal reconstruction method;
4. return at the next real decision moment;
5. observe correction, action, outcome, and voluntary reuse.

Track:

- willingness to capture without prompting;
- time from source to useful reviewed state;
- identity, speaker, and context corrections;
- recovered commitments, constraints, deadlines, or contradictions;
- whether the output changed the next action;
- whether `no_action` was accepted when appropriate;
- time to reconstruct context at the next interaction;
- trust concerns, deletion expectations, and unacceptable errors;
- whether the recruiter returns with a second case.

This is an early learning test, not statistical proof of a market. Repeat it
across recruiters with different active-search loads before generalizing.

## Decision rules

### Continue the candidate-momentum wedge when

- target recruiters independently describe recent, consequential context loss;
- candidate and client dependencies recur across assignments;
- the narrow capture-review-recall loop beats the current workaround;
- evidence and correction increase rather than reduce trust;
- recruiters voluntarily reuse the result at a later decision moment.

### Rework the value moment when

- capture is accepted but the compiled result does not change a decision;
- recruiters value pre-contact recall but do not value a destination page;
- the dominant benefit is clerical record creation rather than dependency
  resolution;
- review cost exceeds the avoided reconstruction.

### Do not infer a category pivot when

- a non-target participant imagines a consumer reply assistant;
- people approve screenshot capture without later reuse;
- broad relationship graphs sound attractive without a repeated job;
- generated personality or fit explanations appear persuasive;
- willingness to pay, retention, or outcome evidence is absent.

## Unresolved hypotheses

- The strongest return moment may be immediately before the next consequential
  contact, not immediately after capture.
- Experienced recruiters may value continuity and control, while novices may
  seek coaching and become more vulnerable to over-trusting model output.
- One visible person entry may reduce retrieval burden, but relationship and
  assignment context must remain separately valid.
- Cross-contact retrieval may be useful later, but evidence retrieval must not
  become candidate ranking.
- Privacy and deletion control may become a product advantage only after the
  real data lifecycle proves the claim.

Revisit canonical product language only after target-user evidence resolves
these hypotheses.

## Related knowledge

- [[cloud-screenshot-processing-privacy]]
- [Product](../../docs/product.md)
- [Principles](../../docs/principles.md)
- [Capture to action](../../docs/capture-to-action.md)
- [Candidate momentum research](../../docs/research/candidate-momentum-loop.md)
