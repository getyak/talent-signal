# Secret delivery

## Purpose

Infisical is Talent Signal's canonical secret store. Applications remain
provider-neutral and consume runtime environment variables; Infisical delivers
those values to the process that needs them. Do not export the Infisical project
to a persistent `.env` file as an ordinary workflow.

The existing project is `talent-signal`, with project ID
`6e8dbb8d-93b9-4979-8248-62100d86e733`. The committed `.infisical.json` binds
local commands to this project and defaults to `dev`. Environment selection is
always explicit for staging and production.

## Local development

Install the Infisical CLI, then authenticate as the current human developer:

```sh
infisical login
pnpm secrets:check:dev
pnpm dev:infisical
```

`secrets:check:dev` prints only whether the expected names are present. It never
prints values. `dev:infisical` injects `dev:/shared` and `dev:/web` into the web
process for the lifetime of that process.

Start the local Docker backend with the same transient injection:

```sh
pnpm backend:up:infisical
```

The repository does not provide a command that exports Infisical to `.env`.
When a value changes, update Infisical and restart the affected process. A
pre-existing ignored `.env` may be retained only for a bounded offline recovery
window and should be removed after the new paths have been verified.

Human CLI sessions keep Infisical's encrypted, mode-`0600` last-successful-fetch
cache for local offline recovery; the encryption key stays in the operating
system keychain. Production cannot use that path: the shared wrapper requires
`INFISICAL_TOKEN`, and Machine Identity fetch failure stops the command.

## Workload identities

Use a separate least-privilege Machine Identity for each workload and
environment:

- GitHub Actions authenticates with GitHub OIDC and a subject restricted to the
  exact repository, workflow, branch or GitHub Environment;
- the owner-operated TestFlight backend reads only `staging` and only the paths
  needed by that backend;
- production API and web workloads have separate identities and read only
  `prod` paths needed by their capability;
- rotation or migration jobs use short-lived, separately authorized identities.

Do not reuse a human CLI session in CI or production. Do not use an OAuth
Application for workload secret delivery. Do not choose a long-lived Service
Token when OIDC or Universal Auth with a short-lived access token is available.

The Infisical identity ID is safe to commit. Its client secret, a Universal Auth
access token, and any provider API key are secrets and must never enter Git,
logs, build arguments, chat, or generated artifacts.

## Paths and names

Keep stable process environment names so providers remain replaceable. Group
authorization in Infisical with folders and identity permissions rather than
renaming application variables per environment.

The authoritative names and runtime contracts live in
`config/infisical-secrets.json`. The folders are:

- `/shared`: provider and cross-surface runtime configuration;
- `/agent-host`: local open-world Tool provider configuration and credentials;
- `/web`: Next.js server credentials and web-only policy;
- `/backend`: database, authentication, API, and storage configuration;
- `/release`: App Store Connect, signing, Tailscale, and release configuration;
- `/operations`: human-operated GitHub, Linear, and weather integrations.

An application requests only the paths declared by its contract. The shared
wrapper rejects unknown environments and paths, and nested injection composes
multiple explicit folders without recursive root access:

```sh
./scripts/infisical/run.sh dev /shared /web -- pnpm --filter @talent-signal/web dev
pnpm secrets:check:agent-host
./scripts/infisical/run.sh dev /shared /agent-host -- pnpm agent:research -- --objective "..." --subject company --anchor "Example Company" --allow-domain example.com
./scripts/infisical/run.sh staging /shared /backend -- node scripts/infisical/verify-contract.mjs testflightBackend
```

Use `scripts/infisical/migrate.mjs` only for a reviewed, allowlisted one-time
copy. It refuses to write without `--apply`, filters names through the manifest,
uses a mode-`0600` temporary file, removes that file, and prints only the count
and destination path. Import a multiline private key with
`--source-key-file=NAME:PATH`; this delegates the raw file to the Infisical CLI
instead of serializing it through dotenv. Verify a provider can parse the
Infisical readback before removing the source file. Never copy the reserved
`PATH` name into a folder.

## GitHub Actions cutover

The iOS workflows prefer the pinned Infisical Secrets Action with GitHub OIDC.
The identity is restricted to the exact immutable subject
`repo:getyak@269524475/talent-signal@1322192683:environment:testflight`, custom audience
`infisical://talent-signal/testflight`, environment `staging`, and path
`/release`. The OIDC discovery URL is the provider origin
`https://token.actions.githubusercontent.com`; Infisical performs discovery
from that origin. Its base project access remains `no-access`; a path-scoped
Additional Privilege grants only `describeSecret` and `readValue`. This keeps
the same least-privilege boundary on plans where custom roles are unavailable.

The `INFISICAL_TESTFLIGHT_IDENTITY_ID` variable is bound to the protected
release identity. Release `0.1.13 (20260828111000)` completed Apple processing
and internal distribution through that identity, after which the legacy GitHub
secrets and fallback branches were removed. The workflows now deliberately fail
closed when Infisical cannot supply the complete contract.

## Provider keys

Use separate credentials for provider capabilities and environments. In
particular, keep `OPENROUTER_API_KEY`, `ARK_API_KEY`, and `ZHIPU_API_KEY`
distinct. A model key grants compute access; it does not grant private-evidence
admission. Keep `TALENT_SIGNAL_ALLOW_SENSITIVE_AI_PROCESSING=false` until the
provider contract and observed data path satisfy the integration admission
checklist.

Public-web research selects one environment provider with
`TALENT_SIGNAL_AGENT_WEB_SEARCH_PROVIDER=brave` or `tavily`. Keep
`BRAVE_SEARCH_API_KEY` and `TAVILY_API_KEY` as separate `/agent-host` secrets; do
not place either key in an Agent definition, MCP configuration visible to the
model, backend container, or client bundle. Load `/shared` for the selected
model provider and `/agent-host` for the search provider into the local Agent
process only. The selector is application configuration, while the API key
remains the secret. Provider subscription and invoice ownership stay in the
vendor account; Infisical owns delivery and rotation, and the local host owns
Run budgets and provider readback. Do not configure silent cross-provider
fallback because it changes ranking, data processing, cost, and attribution
without changing the Run authorization.

Recruiter dictation uses the narrower
`TALENT_SIGNAL_ALLOW_REMOTE_VOICE_TRANSCRIPTION` gate. Set it only for a
runtime whose authenticated flow records in the foreground, stops before
upload, discloses the remote transcription boundary, returns an editable
draft, and deletes its temporary audio. Enabling recruiter dictation does not
admit screenshots, candidate-call recordings, or private candidate evidence
to another model path.

Relationship Ask has its own narrower
`TALENT_SIGNAL_ALLOW_REMOTE_CHAT_PROCESSING` gate. When enabled, configure
`TALENT_SIGNAL_CHAT_PROVIDER=zhipu`, pin `TALENT_SIGNAL_CHAT_MODEL=glm-5.3`,
and keep the environment-specific `ZHIPU_API_KEY` in that environment's
`/shared` path. The backend sends only the user's submitted question and the
minimum selected, published, reviewed relationship blocks. Chat photos remain
local unless the same environment also sets
`TALENT_SIGNAL_ALLOW_SENSITIVE_AI_PROCESSING=true` and pins
`TALENT_SIGNAL_CHAT_VISION_MODEL`; only then are manifest-bound images sent as
unreviewed task material to that vision model. This still does not admit whole
transcripts, provider keys, or contact, message, and calendar write authority.
The server rejects citations outside the supplied evidence manifest and falls
back to the deterministic response when the provider is disabled or fails.
The remote Chat gate alone does not enable the broader Agent runtime or image
processing.

Use a dedicated credential for each environment. In particular, do not copy
`dev:/shared/ZHIPU_API_KEY` into `staging:/shared`; create a staging key in the
provider account, write it directly to Infisical, then prove it with the
synthetic Relationship Ask probe. The iOS app and `/release` workflows never
receive this key.

For GLM, the Agent runtime accepts either a direct BigModel credential with
`TALENT_SIGNAL_AGENT_PROVIDER=zhipu` and a pinned `glm-*` model, or the existing
OpenRouter credential with a pinned `z-ai/glm-*` model. Screenshot analysis
selects `TALENT_SIGNAL_SCREENSHOT_PROVIDER=zhipu` and uses a separately pinned
vision model. Do not treat the text-only GLM Agent model as proof of image
support.

## Recovery and verification

- Revoke the affected workload identity before rotating a suspected credential.
- Verify the destination process starts and the relevant provider health check
  succeeds; a successful secret write is not runtime proof.
- Never diagnose by printing the whole environment. Check only names and
  presence.
- Keep the prior provider credential valid only for the shortest rollback
  window, then revoke it after destination readback succeeds.
- Remove legacy `.env`, host environment files, and GitHub secret copies only
  after the corresponding runtime or workflow has passed its real health gate.
- If Infisical is unavailable, fail closed for production model, storage, auth,
  and database credentials. Do not silently fall back to committed or shared
  personal credentials.
