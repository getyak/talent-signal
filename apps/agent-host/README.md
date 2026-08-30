# Talent Signal local Agent host

This executable runs public company and market research on the user's machine.
It owns search-provider credentials, guarded network access, restartable local
state, and draft artifacts. It does not require or call the Talent Signal
backend, Web app, iOS app, Docker, or TestFlight.

## Run

Build and inject the model-provider values from `/shared` plus search-provider
values from `/agent-host`:

```sh
pnpm secrets:check:agent-host
./scripts/infisical/run.sh dev /shared /agent-host -- \
  pnpm agent:research -- \
  --objective "Research Example Company's public market update" \
  --subject company \
  --anchor "Example Company" \
  --allow-domain example.com
```

Use one to five `--anchor` flags to bind every model-generated query to the
authorized company or market subject. Use repeated `--allow-domain` flags for an allowlist. Unrestricted public-web
discovery requires the explicit `--open-web` flag. The host rejects implicit
open-web access and person, candidate, contact-detail, and profile queries.

Select exactly one model provider with `TALENT_SIGNAL_AGENT_PROVIDER` and one
search provider with `TALENT_SIGNAL_AGENT_WEB_SEARCH_PROVIDER`. Search supports
`brave` and `tavily`; model execution supports `claude`, `openrouter`, and
`zhipu`. Providers never fall back silently.

## Local state

State defaults to `~/.talent-signal/agent/runs/<run-id>/` with owner-only
directory and file permissions. Each Run contains its immutable scope,
checkpoint, append-only events and outputs, terminal receipt, and either a
draft artifact or `no_action`. Drafts declare `publicationAuthority: "none"`.

Pass `--run-id <uuid>` to resume or replay a Run and `--state-dir <path>` to
choose another local root. A Run ID cannot be reused with a different objective
or authorization. Deleting local state is a local user operation; no backend
copy exists.

## Verify

```sh
pnpm agent:check
```

The deterministic suite verifies same-Run search/fetch handles, restart
checkpoints, local draft creation, idempotent terminal replay, provider
normalization, query privacy, budgets, claim-level citations, DNS/IP rejection,
redirects, robots handling, and byte/content limits without using live vendor
credentials.
