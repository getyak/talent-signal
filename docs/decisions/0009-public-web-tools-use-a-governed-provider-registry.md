# ADR 0009: Public-web tools run in a governed local Agent host

## Context

The bounded Agent runtime originally had three Pursuit-momentum tools and no way
to discover current public information. Adding a model provider's native web
tool would make capability behavior, citations, privacy, and availability vary
with the selected model. Installing arbitrary MCP servers would add a second
dynamic authority surface around sensitive relationship work.

Search also differs from page retrieval. A search result is a discovery lead;
a fetched, hashed page is an observation; neither is relationship evidence or
confirmed state.

The first implementation placed the provider registry, credentials, execution
route, and draft artifact table in the shared backend. That confused a product
control surface with the Agent execution boundary: public search did not need
canonical product state, a Pursuit, a Capture, TestFlight, or an always-on
server. It also made local Agent operation depend on infrastructure outside the
capability's actual trust boundary.

## Decision

Add public web access as a separate immutable Agent definition for explicit
company and market research. It receives no conversation evidence or task
attachments and may terminate only in a cited local draft artifact or
`no_action`.

Use separate `search_web` and `fetch_web` capabilities. Fetch accepts only a
source handle returned by search in the same run, and an artifact accepts only
sources fetched in that run. Every artifact claim carries its exact source
handles. Run authorization owns purpose, subject query
anchors, domain policy, search count, and fetch count.

Keep schemas, policy, and orchestration in the provider-neutral Agent core.
Run the registry, Brave/Tavily adapters, guarded HTTPS fetch, credentials,
checkpoints, and drafts in a local Agent host. Pin one provider per Run and
fail closed. Credentials remain Infisical-managed local process inputs and
never enter model context, Tool results, the shared backend, or the journal.

The shared backend remains authoritative only for authenticated product reads,
review, canonical state, proposals, effects, and audit. A local draft gains no
publication authority; a future product import requires a separate explicit
human decision and governed intake path. iOS and Web may later control or
observe the local host but are not required to execute it.

## Alternatives considered

- Model-provider native web tools: less code, but couple governance and
  citations to one runtime and create different behavior across providers.
- A remote MCP marketplace or gateway: useful for dynamic Tool fleets, but
  unjustified privileged infrastructure for one read-only tool family.
- Backend execution: operationally convenient for remote UI dispatch, but it
  couples open-world compute and vendor credentials to canonical product
  infrastructure before remote dispatch or shared Runs are required.
- One combined search-and-content API: convenient, but hides separate discovery
  and retrieval budgets and makes source identity harder to verify.
- Automatic search-provider fallback: improves availability but silently
  changes ranking, privacy terms, attribution, and cost.

## Consequences

- the ordinary Pursuit Agent retains its three real capabilities, while
  `no_action` remains a validated terminal output outside the Tool manifest;
- public research has explicit data-exposure and cost authorization;
- provider substitution does not change model-facing tool schemas;
- the local host can run and recover without backend or frontend availability;
- the backend carries no public-search credential, execution route, or draft
  persistence;
- sources remain local draft dependencies rather than promoted facts;
- provider commercial subscriptions remain vendor-owned, while Infisical owns
  credentials and Talent Signal owns capability/usage policy;
- adding a provider requires an adapter, normalization tests, privacy review,
  and environment configuration rather than a prompt change;
- a future promotion into evidence must use governed source intake, review,
  freshness, retention, and deletion instead of updating the artifact in
  place.

## Reconsider when

Revisit physical placement if users need shared multi-machine Runs, managed
remote dispatch, or explicit publication into product state. Revisit the
in-process registry if several unrelated Tool families require tenant
installation or runtime discovery, or if measured recall requires
multi-provider fan-out. Any MCP gateway must preserve the same task scope,
policy decision, credential isolation, observation identity, budget, and audit
boundary.
