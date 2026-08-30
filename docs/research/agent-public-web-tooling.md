# Agent public-web tooling

Date: 2026-08-30
Status: current research; implementation placement corrected by ADR 0009

## Question

How should Talent Signal give an Agent useful web search while preserving
provider neutrality, public/private data boundaries, citations, budgets, and
the existing distinction between research, evidence, confirmed state, and
effect authority?

## Findings

Frontier Agent APIs converge on two distinct operations:

- **search** discovers candidate sources and returns ranked metadata or short
  excerpts;
- **fetch** reads one chosen URL and is independently bounded by domain,
  invocation, and content limits.

Anthropic exposes separate versioned web-search and web-fetch server tools.
Search citations are always enabled; fetch adds its own maximum-use,
allowed-domain, citation, and content-token controls. OpenAI's Responses API
exposes web search as a built-in tool with domain and context controls. This is
strong evidence against one ambiguous `browse` tool that hides discovery,
retrieval, citations, and cost inside a single opaque action.

Specialized providers follow two useful patterns:

| Provider | Relevant shape | Implication |
| --- | --- | --- |
| Brave | Independent web index and structured search results | Strong default for provider-neutral discovery; page retrieval remains our responsibility. |
| Tavily | Search plus separate extract/crawl/research endpoints | Useful Agent-oriented adapter, but generated answers and raw-content bundling should remain disabled at the boundary. |
| Exa | Search may optionally include highlights or page contents | Useful future adapter; combined calls must still normalize into separate Talent Signal search and fetch observations. |

The official MCP Registry is a discovery catalog, not a trust decision or
subscription manager. MCP gateways can centralize routing and policy, but they
add another privileged control plane. Talent Signal currently has one tool
family and sensitive relationship boundaries, so a small in-process registry
is the narrower choice. Reconsider a policy-enforcing gateway after several
unrelated tool families require tenant installation or dynamic discovery.

Provider subscription administration has three separate concerns:

1. vendor commercial plans and invoices remain vendor-owned;
2. credentials, environment separation, access, and rotation remain
   Infisical-owned;
3. capability selection, request budgets, provider identity, health, and usage
   remain local Agent-host responsibilities.

Trying to make one service own all three would either expose billing authority
to the runtime or turn a secret store into a tool router. Infisical already
supports scoped secret delivery and API-key rotation, so Talent Signal should
continue consuming injected environment variables in the local host instead of
adding provider SDK access to the canonical domain process.

## Talent Signal decision implications

- Keep the existing evidence-to-Proposal Agent definition unchanged.
- Add a separate public company/market research definition with no conversation
  evidence or task attachments.
- Require an explicit run authorization containing purpose, company/market
  query anchors, allowed domains, and maximum search/fetch counts.
- Let `fetch_web` accept only an opaque handle returned by `search_web` in the
  same run.
- Require every research-artifact claim to cite handles successfully fetched
  in that run.
- Store the result as a local draft artifact. It is not evidence, confirmed
  state, a Proposal approval, or an external effect.
- Pin one search provider per Run and fail closed; do not silently mix
  rankings, privacy terms, cost, or failure semantics through fallback.
- Keep fetch authorization and the provider-neutral gateway interface in Agent
  core. Keep DNS, redirects, robots, byte limits, text extraction, and content
  hashing in the local host so network implementation cannot leak into core or
  vary by search vendor.
- Keep the shared backend, iOS, Web, TestFlight, Pursuit, and Capture outside
  the execution dependency graph. Any later publication is a separate human-
  authorized product intake.

## Alternatives rejected for the first slice

- **Enable Claude/OpenAI built-in search directly:** fast for one model, but
  couples capability policy, observations, and citations to the model provider
  and leaves OpenRouter/BigModel behavior different.
- **Install arbitrary remote MCP search servers:** flexible, but expands the
  trust and credential boundary before tenant-installed tools are required.
- **Use search snippets as evidence:** snippets are discovery metadata and may
  be truncated, stale, or synthesized; they cannot support relationship truth.
- **Allow arbitrary `fetch_web(url)`:** bypasses same-run discovery scope and
  makes URL exfiltration and SSRF policy harder to explain and audit.
- **Automatic multi-provider fallback:** silently changes ranking, data
  processing, cost, and attribution. Operational availability alone does not
  justify that ambiguity.

## Sources

- [OpenAI API quickstart: built-in web search](https://platform.openai.com/docs/quickstart)
- [Anthropic web search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)
- [Anthropic web fetch tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool)
- [Anthropic server-tool domain and retention controls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools)
- [Brave Web Search API](https://api-dashboard.search.brave.com/api-reference/web/search/get)
- [Tavily API introduction](https://docs.tavily.com/documentation/api-reference/introduction)
- [Exa search API](https://exa.ai/docs/reference/search)
- [Official MCP Registry](https://registry.modelcontextprotocol.io/docs)
- [Infisical secret rotation](https://infisical.com/docs/documentation/platform/secret-rotation/overview)

## Reconsider when

- provider evaluation shows one index cannot meet required recall;
- a tenant must connect its own provider account;
- research needs reviewed promotion into governed evidence;
- dynamic tool installation becomes a real product requirement;
- provider data residency, retention, or availability changes the admission
  boundary.
