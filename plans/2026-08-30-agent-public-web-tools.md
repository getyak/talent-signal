# Agent public-web tools

Status: superseded by `2026-08-30-local-agent-tool-host-refactor.md`
Owner: Codex
Started: 2026-08-30

The capability contract and provider research remain useful. The backend-first
execution and persistence placement below was incorrect and is retained only
as historical task context. ADR 0009 records the corrected local-host boundary.

## Outcome

Talent Signal has a useful, provider-neutral public-web research lane: an
explicitly authorized Agent can discover sources with `search_web`, inspect a
selected result with `fetch_web`, and preserve a cited draft research artifact
without gaining fact, identity, proposal-approval, or external-effect
authority.

## Boundary

In scope:

- a separate public-research Agent definition rather than silently widening
  the existing evidence-to-Pursuit proposal runner;
- search and fetch as separate, bounded, read-only capabilities;
- exact run-level purpose, domain, search-count, and fetch-count authorization;
- a provider-neutral search contract with Brave and Tavily adapters;
- first-party HTTPS fetching with the existing DNS, redirect, robots, byte,
  content-type, and extraction guards;
- a draft artifact whose statements cite only pages fetched in the same run;
- `no_action` as a validated terminal output rather than a manufactured Tool
  call;
- one provider-neutral capability catalog with explicit consequence, approval,
  reversibility, idempotency, read-only, and open-world descriptors;
- server-side provider selection and Infisical-injected credentials;
- focused contract, provider, runtime, backend, recovery, and documentation
  checks.

Out of scope:

- candidate or person web research, enrichment, scoring, acceptance prediction,
  or protected-trait inference;
- sending reviewed conversation evidence or task attachments to a search
  provider;
- treating search snippets or fetched pages as confirmed relationship facts;
- generic browser access, arbitrary URL fetching, cross-run source reuse, or
  external writes;
- an MCP marketplace, dynamic tenant-installed tools, subscription purchasing,
  or automatic provider failover.

## Current evidence and unknowns

- The bounded Agent runtime now admits exactly three Pursuit-momentum tools;
  `no_action` is a host-validated terminal output, not a capability invocation.
- The existing public-research worker already owns safe HTTPS fetching and
  recovery, but requires a recruiter-approved seed URL and cannot discover one.
- Current frontier APIs expose search and fetch separately, with domain,
  invocation, content, citation, and retention controls.
- Infisical already owns provider credentials; application code consumes only
  injected environment variables.
- Search quality and vendor cost need production measurement. The first slice
  therefore pins one provider per environment and records provider identity,
  budgets, and fingerprints without silently falling back.

## Chosen approach

Use a second immutable Agent definition. It receives only the user's explicit
public company/market research objective and opaque Pursuit scope, never
conversation evidence or attachments. `search_web` returns normalized source
handles; `fetch_web` accepts only a handle returned earlier in that run; and
`create_research_artifact` accepts only fetched handles. The artifact is a
draft, not evidence or confirmed state.

Keep one internal provider registry and adapter contract. Configure the active
provider and credentials at process start. Do not install remote MCP servers in
the candidate-data trust boundary; reconsider a policy-enforcing MCP gateway
only after several unrelated tool families justify dynamic discovery.

## Milestones

1. **Complete — Contract and capability kernel.** Add the separate
   definition, schemas, run scope, budgets, terminal artifact candidate, and
   same-run source validation. Remove `record_no_action` from every Tool
   manifest and add inspectable capability authority descriptors.
2. **Complete — Provider and fetch adapters.** Add Brave and Tavily search
   adapters plus guarded first-party fetch reuse.
3. **Complete — Durable backend slice.** Add authorization request, artifact
   storage/readback, endpoint, audit, idempotency, and recovery behavior.
4. **Complete — Provider integration.** Make Claude, OpenRouter, BigModel, and
   deterministic providers honor definition-specific tool and terminal
   protocols.
5. **Complete — Proof and knowledge routing.** Run focused tests, typechecks,
   docs checks, real configured smoke where credentials permit, and the local
   TestFlight backend deployment required by backend ownership guidance.

## Completion evidence

- a scripted Agent searches, fetches only a returned result, creates one cited
  draft artifact, and reloads it through the HTTP contract;
- arbitrary fetch, unfetched citation, over-budget use, invalid/private URL,
  and missing provider configuration fail closed;
- the ordinary Pursuit-momentum definition has exactly three tools and a
  separately validated `no_action` terminal branch;
- provider credentials never enter model context, tool output, journals, or
  committed configuration;
- `pnpm docs:check`, focused tests, affected typechecks/builds, and backend
  deployment verification pass.

Completed proof on 2026-08-30:

- Agent CI: 10 files and 64 tests passed, including direct `no_action`,
  candidate conflict, evidence-reference scope, public search/fetch lineage,
  and provider protocol cases.
- Backend CI: 28 files and 198 tests passed; contracts, Agent definitions,
  provider registry, recovery, and source lifecycle remained green.
- Documentation and architecture checks, contracts build, Agent build, backend
  typecheck, and backend build passed.
- The local TestFlight backend rebuilt, migration `034` applied, API and
  Postgres became healthy, voice and Relationship Ask probes passed, and the
  tailnet endpoint was verified. No Brave or Tavily credential was configured
  in that environment, so the tested missing-provider path remains the
  fail-closed production behavior rather than a fabricated live search smoke.

## Reconsider when

- measured search recall requires blending more than one provider;
- tenants need their own provider accounts or OAuth connections;
- three or more unrelated third-party tool families need runtime discovery;
- public research must become reviewed evidence, which would require the
  existing source intake, authorization, freshness, and deletion lifecycle
  rather than artifact promotion.
