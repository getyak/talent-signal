# PRD-03: Bounded Agent boundary

## Problem and user outcome

A recruiter should be able to ask for one evidence-grounded Pursuit update
without granting a model database, filesystem, browser, identity, confirmation,
or external-effect authority. The useful terminal result is one reviewable
Proposal or a visible `no_action`, with enough receipt data to explain exactly
what the Agent could read and spend.

## In-scope requirements

- `V1-AGT-001` through `V1-AGT-005`;
- Agent-run contributions to `V1-SEC-001` and `V1-SEC-002`;
- one TypeScript Claude Agent SDK adapter behind a provider-neutral runner;
- immutable workspace, user, Pursuit, objective, context, and budget scope;
- typed `read_pursuit`, `read_evidence`, `stage_pursuit_proposal`, and
  `record_no_action` tools;
- durable run, event, tool-call, output, fingerprint, usage, and terminal receipt;
- reconstruction from a fresh backend snapshot rather than SDK session memory.

## Out of scope

- generic Bash, file, Web, browser, connector, subagent, Skill, or Task tools;
- fact confirmation, identity binding or merge, source capture, external send,
  Calendar, Contacts, ATS, CRM, or notification writes;
- background autonomy, arbitrary session resume, or treating a transcript as
  canonical memory;
- real candidate data in model or evaluation runs.

## Runtime contract

The backend creates a run against one current Pursuit revision and a compact
authorized evidence manifest. The run pins definition, system prompt, tool
manifest, SDK, model, policy, contract, and context fingerprints plus maximum
turns, tool calls, duration, tokens, and estimated USD.

The Claude adapter starts with `tools: []`, `permissionMode: dontAsk`, no
settings sources, no plugins, no subagents, no session persistence, and one
in-process MCP server containing only the four Talent Signal tools. A second
`canUseTool` check denies every name outside the pinned manifest. Tool handlers
recheck workspace, Pursuit revision, identity, evidence authority, and budget
outside the model.

Structured output is schema validated after the SDK result. Invalid or
unsupported output is quarantined and cannot create a Proposal. The Agent may
stage only `evidence_supported` items using evidence from the pinned manifest;
human-authored basis is unavailable. Staging is an internal review write and
never applies canonical state.

SDK session identifiers may be retained as provider diagnostics, but restart
creates a fresh provider session from the same durable backend snapshot and
run checkpoint. No product decision depends on provider transcript recovery.

## Budgets and terminal states

The initial definition permits at most 6 turns, 12 tool calls, 60 seconds,
32,000 task tokens, and USD 1.00 estimated provider cost. A run ends as
`proposal_staged`, `no_action`, `quarantined`, `budget_exhausted`, `cancelled`,
or `failed`. Exactly one terminal receipt is durable and idempotent.

## Deterministic proof

Tests must prove allowlist immutability under prompt injection, workspace and
Pursuit isolation, unavailable evidence denial, schema quarantine, duplicate
stage replay, budget stop, cancellation, fresh-snapshot reconstruction,
complete fingerprints, empty external effects, and absence of every prohibited
tool from the model-visible manifest.

## Falsifiers

The slice fails if imported content changes policy, any non-allowlisted tool is
visible or executes, a session transcript becomes memory, user-authored basis
is attributed to the Agent, a malformed result stages review work, or any Agent
path confirms state or creates an external effect.
