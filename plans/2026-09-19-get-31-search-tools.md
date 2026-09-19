# GET-31 multi-channel contact search

## Outcome

Make the first authorized public-person search broad enough to discover the
same person across multiple public surfaces in one tool call, while preserving
provider identity, per-channel failures, source provenance, budgets, and the
existing human identity decision.

## Boundary

In scope:

- one `search_contact_public` call can select multiple channels;
- default first-search coverage includes LinkedIn, Web, Xiaohongshu, and Reddit;
- the supported channel catalog also includes Douyin, TikTok, Weibo, Threads,
  and Instagram;
- Exa remains the LinkedIn/Web adapter and TikHub remains the social-profile
  adapter;
- partial provider failures are explicit and cannot erase successful channels;
- local and TestFlight secret contracts require every runtime credential;
- deterministic tests cover dispatch, deduplication, limits, partial failure,
  query privacy, and configuration drift.

Out of scope:

- private accounts, cookies, contact-detail search, background checks, face
  matching, candidate scoring, or automatic identity binding;
- provider-account creation, billing changes, or silent provider fallback;
- using snippets as confirmed relationship evidence.

## Current evidence

- GET-31 reports that `search_contact_public` currently accepts one `channel`
  and returns at most three results.
- `dev:/agent-host` has no `EXA_API_KEY`; its TikHub name is present but the
  authenticated account-envelope readback returns `TIKHUB_AUTH_FAILED`.
- `staging:/agent-host` contains both names and TikHub health plus credential
  readback succeeds.
- The local Compose and `localPersonResearchHost` contract omit `EXA_API_KEY`
  even though the contact-research runtime uses it.
- TikHub documents user search for Xiaohongshu, Reddit dynamic search with
  `search_type=people`, and Instagram user search. The existing adapters for
  Douyin, TikTok, Weibo, and Threads remain current.

## Approach

1. Extend the contact-research contract and intake tool with a bounded ordered
   `channels` list and per-channel result limit.
2. Fan out only the explicitly selected channels, keep one provider per
   channel, normalize and deduplicate sources, cap the combined response, and
   return bounded per-channel failure codes alongside successful results.
3. Add TikHub normalization and routes for Xiaohongshu, Reddit, and Instagram.
4. Make Exa/TikHub credential requirements consistent across local Compose,
   examples, Infisical contracts, and operational documentation.
5. Verify focused tests, package checks, docs checks, an independent safety
   review, latest-head CI, merge, and Linear acceptance readback.

## Completion evidence

- deterministic tests prove one request dispatches all selected channels and
  preserves partial failures without cross-provider fallback;
- official provider route shapes are covered by request/normalization tests;
- secret-name checks fail when Exa or TikHub is absent;
- the latest PR head passes all applicable required checks and is merged;
- GET-31 is read back as complete only after merged-head verification.

## External credential blocker

Code can make configuration gaps observable, but it cannot manufacture vendor
credentials. Dev remains externally blocked until the owner restores TikHub
authorization and writes a dedicated Exa key to `dev:/agent-host`. Staging is
currently configured and TikHub-authorized.

## Implemented

- `contact-research-tools.v2` accepts an ordered unique channel list, defaults
  the model tool to LinkedIn, Web, Xiaohongshu, and Reddit, and caps both each
  channel and the combined response.
- Agent Host fans selected channels out concurrently, keeps Exa pinned to
  LinkedIn/Web and TikHub pinned to social profiles, deduplicates canonical
  URLs, and returns schema-checked per-channel outcomes without provider text.
- TikHub adapters cover the documented Xiaohongshu, Reddit people, and
  Instagram user-search routes in addition to Douyin, TikTok, Weibo, and
  Threads.
- Backend task observations and limitations preserve partial channel failures;
  repeated calls retain exactly the sources returned to the model at the
  task-wide cap, and no provider result can confirm identity or authorize an
  external write.
- Local secret and Compose contracts now explicitly require and inject Exa
  alongside TikHub.

## Local verification

- Agent: 29 files passed, 1 skipped; 266 tests passed, 1 skipped.
- Agent Host: 14 files and 63 tests passed.
- Backend: 59 files passed, 10 skipped; 450 tests passed, 165 skipped.
- Agent, Agent Host, and Backend typechecks passed.
- Secret contract suite: 21 tests passed, including explicit Exa/TikHub local
  runtime coverage.
- Documentation, wiki, architecture-boundary, architecture-diagram, and
  whitespace checks passed.
- Independent review closed the unknown-envelope, receipt visibility, and
  single-call/task-wide truncation findings; final readback found no P0/P1.
