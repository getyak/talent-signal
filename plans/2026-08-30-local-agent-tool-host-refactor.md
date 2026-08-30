# Local Agent tool-host refactor

Status: complete
Owner: Codex
Started: 2026-08-30

## Outcome

Public-web search is a capability of a locally deployed Agent host. The Agent
core owns schemas, policy, and orchestration; a local executable owns provider
credentials, network access, run checkpoints, and draft artifacts; the Talent
Signal backend owns only scoped product reads and explicit human-authorized
publication into product state. iOS and Web are optional control surfaces, not
runtime dependencies.

## Boundary

In scope:

- keep provider-neutral Tool schemas, search/fetch separation, same-run source
  handles, structured `no_action`, and citation validation in Agent core;
- add an executable local Agent host with Brave/Tavily adapters, guarded HTTPS
  fetch, a local durable journal, local draft artifacts, and a narrow CLI;
- make public research independent of workspace, Pursuit, Capture, backend,
  PostgreSQL, Docker, and TestFlight;
- enforce host-level query privacy, subject anchors, and explicit open-web/domain authorization;
- remove search-provider execution, credentials, run endpoints, and product
  persistence from the backend and deployment configurations;
- preserve backend ownership of reviewed evidence, proposals, effects, and any
  future explicit artifact publication;
- supersede backend-first public-search documentation and record the corrected
  dependency direction.

Out of scope:

- remote dispatch from iOS to a sleeping or offline local Agent;
- publishing local research artifacts into a Pursuit;
- tenant-installed dynamic MCP servers or automated vendor purchasing;
- person/candidate search, enrichment, scoring, or inference;
- changing unrelated Web product work already present in the worktree.

## Current evidence and unknowns

- `@talent-signal/agent` is a library, not a deployable local process.
- the current public-search provider registry, secrets, API, and artifact table
  are coupled to the backend and TestFlight Compose surface;
- same-run search and fetch observations are held only in memory despite a
  durable backend Run claim;
- migration `034_agent_public_web_research` has already been applied to the
  local TestFlight database, so cleanup requires an additive migration after
  proving that the new table contains no user data;
- no live Brave or Tavily credential is configured, so deterministic adapter
  tests are the available provider proof.

## Chosen architecture

```text
@talent-signal/agent (core library)
  definition + schemas + policy + orchestration
                  │
                  ▼
@talent-signal/agent-host (local executable)
  provider registry + secrets + safe fetch + JSON/JSONL state + drafts
                  │ optional, separately authorized
                  ▼
Talent Signal backend
  scoped product reads + explicit publish/proposal gateways + audit
```

## Milestones

1. **Complete — Correct the core contract.** Separate public research scope
   from Pursuit scope, add host-enforced query policy, and make the runner
   checkpoint search/fetch observations through an injected Run store.
2. **Complete — Build the local host.** Move search adapters and safe fetch into
   an executable local package with local credentials and durable artifacts.
3. **Complete — Remove backend ownership.** Delete endpoints and provider
   execution, remove Compose/Infisical exposure, and add a safe decommission
   migration after proving the table is empty.
4. **Complete — Route durable knowledge.** Supersede the backend-first decision,
   update canonical Agent boundaries, and remove stale duplication.
5. **Complete — Prove the real surface.** Run focused and repository checks,
   execute the local CLI against deterministic providers, verify restart
   continuity, deploy the changed backend per repository guidance, and inspect
   the resulting database/runtime state.

## Completion evidence

- a local CLI Run searches, fetches only a same-Run handle, restarts from its
  persisted checkpoint, and creates a local draft whose every claim maps to
  fetched, content-hashed sources without any backend;
- person-like/PII queries, implicit open-web access, private addresses,
  cross-domain redirects, unfetched citations, and over-budget calls fail
  closed;
- backend source contains no Brave/Tavily adapter, search-provider secret,
  public-search execution endpoint, or active research-artifact table;
- existing Pursuit Agent behavior, product authority, and external-effect
  boundaries remain unchanged;
- Agent/host/backend tests, typechecks, docs checks, secret checks, migration,
  and the required local TestFlight backend deployment pass.

Observed proof on 2026-08-30:

- Agent core: 6 files / 37 tests; local host: 5 files / 14 tests;
- backend: 27 files / 194 tests plus its full CI build;
- deterministic host execution created an owner-only cited draft, restored a
  checkpoint in a new store instance, and replayed one terminal receipt without
  any backend dependency;
- TestFlight migration 035 applied after confirming the deprecated table held
  zero rows; the table is now absent and both widened checks are restored;
- the rebuilt TestFlight API is healthy and its environment contains no Brave,
  Tavily, or public-search selector;
- secret-contract and documentation/diagram checks passed. No live Brave or
  Tavily credential was available, so vendor behavior is proved with bounded
  adapter fixtures rather than a billable external request.

## Reconsider when

- mobile remote dispatch becomes a product requirement;
- multiple machines must share one Agent Run;
- local research needs explicit publication into a Pursuit;
- several unrelated third-party Tool families justify a policy-enforcing MCP
  gateway or tenant installation lifecycle.
