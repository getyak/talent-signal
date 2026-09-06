# Agent system

## Purpose

Talent Signal uses agents to extend human judgment, not replace ownership of relationship truth or consequential action.

The system is:

> an evidence compiler, temporal relationship memory, and governed action control plane, with open-ended agents attached only where flexibility creates measurable value.

## Architecture

![Talent Signal agent control plane](talent-signal-agent-control-plane.png)

The control plane separates four concerns:

- method: reusable Skills and policies;
- context: authorized evidence and current state;
- runtime: the process performing the work;
- effect: a governed capability with independent verification.

This separation allows models, agent providers, and channels to change without
changing product truth or authorization.

## Two runtime classes

### Governed workflow

Use a governed workflow when the stages, review points, and outcome checks are
known.

The capture-to-action loop belongs here because identity, time, evidence,
permission, and recovery are consequential. A workflow may call several
models, but deterministic state decides what happens next.

### Open-ended agent task

Use an open-ended agent when the sources or number of steps cannot be known in
advance and partial artifacts remain useful.

Good uses include:

- company and market research;
- meeting preparation;
- contradiction investigation;
- client-update or interview-question drafts;
- repository and product work.

An open-ended agent may produce an artifact or proposal. A task may also grant
specific reversible internal filing operations, enforced by domain tools. It
cannot confirm a fact, merge identity, or grant itself consequential actions.

Public-web research has a separate definition, explicit company/market purpose, domain and usage budgets, and no conversation evidence or attachments.
Search discovers untrusted leads; every draft claim cites only same-Run fetched sources and gains no truth or action authority.
The legacy screenshot public-person definition is read-only: one intentional
image authorizes a local Run using visible text clues and bounded profile tools
to emit an unconfirmed cited draft or `no_action`. It has no internal filing
grant. The separately gated contact-filing task below adds that explicit grant.

### Runtime placement

Runtime follows capability ownership. The backend owns contact-filing vision
extraction and the durable tool loop. Only public identity anchors and typed
research calls cross to the Agent Host, which owns open-web credentials and
network policy, never database access or authority to change a contact. The
legacy read-only definition forwards process-only image input to that host
without granting filing authority.

The backend owns authenticated product scope, canonical evidence, review, confirmed state, effects, and audit. A local artifact crosses that boundary only through an explicit publication or proposal decision. The Agent core owns shared schemas, policy, and orchestration, but neither secrets nor canonical state.

## Governed loop

![Talent Signal agent runtime flow](talent-signal-agent-runtime-flow.png)

Every run follows the same conceptual discipline:

1. authorize one immutable objective, Pursuit or subject scope, and budget;
2. compile the smallest relevant context;
3. choose or revise a short plan;
4. request one bounded read, artifact, clarification, proposal, or stop;
5. validate the request outside the model;
6. record the observation and checkpoint;
7. continue, wait for a decision, or stop.

The runtime stops when the outcome is complete, a human decision is required,
authority changes, the budget ends, repeated failure exceeds policy, or the
task is cancelled.

## Agent control plane

The control plane owns these concepts independently of provider sessions:

| Concept | Meaning |
| --- | --- |
| Definition | Versioned job, eligible capabilities, context policy, output expectations, and stop conditions. |
| Task | User-authorized objective, subject scope, purpose, retention, budget, and time horizon. |
| Run | One attempt against an immutable task version; it may wait, resume, branch, finish, fail, expire, or be cancelled. |
| Checkpoint | Restorable progress, current plan, unresolved questions, observations, artifacts, and remaining budget. |
| Artifact | Useful output without truth authority: a brief, packet, question set, proposed patch, or playbook. |
| Proposal | Provenance-bearing request for a fact, action, or learning decision; no execution authority. |

## Capability boundary

Capabilities progress through increasing consequence:

| Class | Meaning | Default posture |
| --- | --- | --- |
| Scoped read | Retrieve authorized evidence or state | Automatic within task scope |
| Internal reversible | Create attention or an artifact | Reviewable and undoable |
| Device or external write | Change Contacts, Calendar, ATS, CRM, or communication | Exact-effect approval and verification |
| Prohibited | Judge people, infer protected traits, or expose generic production access | Never available |

The model proposes intent. The control plane determines whether a capability
exists, is in scope, is currently allowed, and can be executed safely.

## Three decisions

The system preserves three independent gates:

1. Fact confirmation: is this understanding supported and correctly scoped?
2. Action approval: should this exact effect happen now?
3. Outcome verification: did the intended destination actually change?

## Context engineering

Support natural conversation around the user's current intent; load relevant
task context and match the requested form and depth. Formal prompts ship with
code and load locally; each task and experiment freezes its selected version.
Opik mirrors versions for experiments, with selected drafts imported as source
changes. Tool descriptions own usage, the host owns authorization and validation,
and adapters add terminal protocol. Give useful partial answers and clarify
material gaps. See [prompt operations](operations/opik-prompts.md).

Use this order:

1. immutable platform and safety boundaries;
2. current objective, scope, budget, and completion criteria;
3. eligible capability interfaces;
4. current plan and unresolved questions;
5. relevant confirmed state;
6. clearly labeled interpretations;
7. exact evidence excerpts;
8. prior observations and artifacts.

Every included item should have a reason, version, authorization scope, and
restorable reference. Large observations belong in artifacts, not the active
prompt.

Each run pins a knowledge snapshot and records a context manifest: the task
version, Pursuit and subject scope, included references, inclusion reasons,
authorization scope, and content identity needed to explain or replay what the
Agent could know. The manifest points to governed content rather than copying another unbounded
transcript.

Screenshots, web pages, files, connector results, and generated wiki text remain
untrusted content. They cannot modify policy, permissions, or approval
requirements.

## Memory and Agent Wiki

Do not flatten memory into one page or one retrieval index.

The system distinguishes:

- source memory: what was captured;
- episodic memory: what happened and in what order;
- semantic memory: what is currently understood;
- procedural memory: what action may work in a recurring situation;
- operational memory: how an Agent should perform a task.

New model output enters as a proposal or hypothesis. Confirmed facts and
verified outcomes may update active relationship memory. Repeated corrections
or outcomes may propose a playbook, but learning remains reviewable.

The Agent Wiki is a versioned semantic compilation over governed state. It is a
first-class shared memory product and the primary way people and Agents recover
longitudinal context, not merely a human-facing page.

Wiki pages may be durable, linked, searched, cited, and optimized for Agent
reading while remaining rebuildable after correction, conflict, expiry,
permission change, or deletion. They do not replace the evidence, fact
versions, outcomes, or approved procedures from which they were compiled.

Pages contain addressable knowledge blocks rather than one generated essay.
Material blocks preserve status, time, authorization scope, provenance, and
references. They may combine confirmed understanding, relevant history,
explicit interpretations and conflicts, approved procedures, and
freshness-bounded research without sharing one permission or retention rule.

```text
workspace or subject map
→ compact page summary
→ relevant knowledge blocks
→ supporting fact or event versions
→ exact source evidence when verification requires it
```

The context assembler may combine structured state, Wiki blocks, and exact
evidence. It must not dump the whole Wiki into a prompt or treat vector
similarity alone as sufficient grounding.

Each run reads an immutable knowledge snapshot, whether exposed through a
service or an Agent-readable file bundle. A provider session, compacted chat,
or sandbox is working state, not long-term product memory.

Agents write artifacts and proposed knowledge patches against the snapshot.
They do not silently overwrite a page or promote their own summary to fact.
Validation checks identity, provenance, conflict, time, scope, and deletion.
Facts require confirmation, external results require observation, and
procedural learning requires review. Accepted changes update governed state
before compiling a new Wiki version; temporary scratchpads and hypotheses
expire unless preserved as reviewable artifacts.

Identity retrieval applies both source authorization and identity-handle
freshness at use time. An expired handle may supply a masked, account-scoped
candidate for structured human review, but it cannot act as confirmed identity
context for an Agent run. Reconfirmation requires a fresh governed source and a
human binding decision; an Agent may open and explain that review but cannot
extend the deadline or promote the clue itself.

For a handle with current and expired historical owners, the Agent preserves
the service's temporal order and reasons; it may explain and open review but
cannot preselect, collapse records, bind to history, or retry after failure.

## External agents and channels

Codex, Claude, Cursor, Manus, OpenClaw, and future runtimes should connect through one provider-neutral Talent Signal boundary.

Initial external abilities are scoped reads, intentional capture, artifacts,
fact/action proposals, internal attention, and signed review handoffs.

External agents should not directly confirm facts, merge identities, send
messages, change calendars or contacts, update an ATS, query the production
database, or obtain a generic browser or shell over candidate data.

Channels such as WeChat are capture and attention surfaces, not tenant
boundaries or systems of record.

## V1 bounded runtime

`@talent-signal/agent` is the provider-neutral runner. Each Pursuit, company/market, public-person, or workspace-conversation definition receives only its small Tool manifest; a second gate rejects every other Tool, and terminal output remains schema-validated rather than becoming a Tool call.

The backend freezes scope, context, objective, and budget; persists fingerprints,
validated output, usage, and one terminal receipt without raw tool payloads;
and allows only a `needs_review` Proposal or durable `no_action`. External
effects remain empty and recovery uses durable state, not provider memory.

The company/market public-research definition assembles `search_web`, `fetch_web`, and `create_research_artifact`.
The local host selects one provider, isolates credentials, guards fetches, checkpoints observations, and writes drafts with no publication authority.

The account-scoped workspace-conversation definition may answer directly or call only `contact_workspace`: `search`, `read`, `propose_create`, and `propose_update`. Search clues must come from the message; one uniquely resolved header may be read and handed to governed relationship Ask, while ambiguity stops for clarification. Same-Run authorization binds reads and update targets. Proposal fields and source excerpts must be grounded in the message or unchanged exact-target labels; the Tool returns a fingerprint and `needs_review`, never an apply operation or canonical mutation.

### Authorized screenshot contact filing

An intentional import grants internal filing, IM storage, analysis, and optional
sourced professional observations. The model chooses tools; the backend owns
validation, writes, checkpoints, and readback. Ambiguity requires clarification.
Filing never confirms actors, dates, real-world identity, or interpreted claims.

An ordered image set is one immutable import intent. Each message retains image
provenance; conflicting visible identities stop filing, and overlapping messages
are not repeated commitments. Private originals stay outside model/task state
and expire with the task. Recovery reuses stored images and extraction checkpoints.
Source invalidation denies access and queues retryable permanent cleanup;
reversible archive hides sources without extending retention. See the
[storage playbook](operations/backend-production.md#chat-media-object-storage).

Profile observations preserve provenance and conflicts without overwriting
confirmed facts. Cancellation fences work; expiry and invalidation retract derivatives.
Deletion needs a separate current-target grant with reversal. Imports never
grant identity merges, device writes, or messaging.

Every catalog entry declares its capability class, consequence, approval,
reversibility, idempotency, read-only behavior, and open-world behavior. These
host-enforced descriptors keep provider adapters thin and make authority
boundaries inspectable without asking the model to infer them from prose.

The governed Pursuit Task adds durable attempts, snapshots, checkpoints, artifacts, and events with authoritative readback. Interactive surfaces consume an account-scoped cursor projection and recover from canonical snapshots, never from provider tokens, private reasoning, or a live session. Progressive semantic blocks remain projections of the authoritative Artifact, Proposal, decision, and terminal Receipt. PostgreSQL notification, Redis, or another broker may accelerate fan-out but must remain disposable: its loss degrades to bounded readback without losing, duplicating, or widening the task. Decisions retain domain owners; resume and effects remain targets.

## Evaluation

Evaluate layers independently:

- evidence quality and support;
- identity and temporal-state correctness;
- proposal usefulness and `no_action` judgment;
- review effort and user control;
- effect correctness, reconciliation, and recovery;
- memory grounding, staleness, and deletion;
- open-ended trajectory, artifact quality, and budget;
- relationship and workflow outcomes.

Evaluate both trajectory and outcome. An agent saying it is finished is not evidence that the environment is correct.

Internal Lab evaluation binds comparison to one frozen synthetic snapshot and requires human promotion before a redacted issue becomes a versioned Eval Case; see [ADR 0011](decisions/0011-product-native-internal-lab.md).

Release boundaries include:
- every consequential write has specific approval and provenance;
- ambiguous identity, speaker, date, or scope cannot trigger an automatic
  write;
- unsupported or prohibited inference cannot become active state;
- duplicate and unknown-result writes remain safe;
- source deletion reaches every governed derivative.

## V1 proof boundary
Deterministic and credentialed trials share the real database protocol; neither authorizes production data or broader tools.
The Wiki rationale is in [ADR 0004](decisions/0004-agent-wiki-knowledge-layer.md).

## Research
The cross-system research and source links live in
[Agent systems research](research/agent-systems.md).

## Reconsider when

Revisit this design when evidence shows that a governed workflow cannot express
the core product, users can safely delegate a broader consequence class, or a
runtime-specific capability creates durable value that a provider-neutral
boundary cannot preserve.
