# Infisical-backed GLM integration

## Outcome

Make Infisical the single runtime source for Talent Signal secrets, then add a
bounded GLM provider path for synthetic Agent evaluation and multimodal
screenshot evaluation without admitting private candidate evidence or granting
models execution authority.

Completion is observable when:

- the repository is linked to the existing Infisical `talent-signal` project;
- local commands inject `dev` secrets into child processes without exporting a
  plaintext `.env` file;
- deployment guidance distinguishes human CLI login, workload identity, and
  GitHub OIDC;
- GLM requests use a pinned provider/model, strict host validation, explicit
  reasoning and cost limits, and the existing evidence parser;
- focused tests and `pnpm docs:check` pass;
- the Infisical CLI can read the intended environment after the user completes
  its email verification;
- any GLM purchase stops at a reviewed checkout until the user confirms the
  exact financial transaction.

## Boundaries

In scope:

- Infisical project configuration, runtime wrappers, examples, and operations
  guidance;
- GLM through the existing OpenRouter Agent path for synthetic evaluation;
- a direct BigModel multimodal screenshot adapter suitable for later provider
  admission;
- tests for configuration, host pinning, malformed results, and safe failure;
- purchase preparation and price verification.

Out of scope:

- revealing, copying into chat, or committing secret values;
- OAuth applications, because the current Infisical role cannot access that
  organization section and OAuth is not the runtime-secret mechanism;
- enabling remote models for private candidate evidence;
- completing a payment without action-time confirmation;
- production provider admission, DPA negotiation, or cross-border approval.

## Current evidence and unknowns

- Infisical organization `getyak` already contains one Secrets Management
  project named `talent-signal`, project ID
  `6e8dbb8d-93b9-4979-8248-62100d86e733`, with three environments and 84
  secrets.
- Infisical CLI `0.43.125` is installed and authenticated with the current
  human developer account. The scoped `dev:/shared` and `dev:/web` contracts
  now supply `AUTH_SECRET`, `OPENROUTER_API_KEY`, `ARK_API_KEY`, and
  `ZHIPU_API_KEY`; name-only readback passed without printing values.
- The `dev` environment now pins the Agent to `openrouter`,
  `z-ai/glm-5.3`, and low reasoning effort. Readback matched all three names,
  and a synthetic OpenRouter smoke request returned the exact configured model
  with 37 total tokens and USD 0.0000878 reported cost.
- Price readback on 2026-08-28 lists OpenRouter `z-ai/glm-5.3` at USD 1.40
  input / USD 4.40 output per million tokens and `z-ai/glm-5.3-flash` at
  USD 0.075 / USD 0.25. The standard GLM-5.3 listing is text-only; Flash is
  listed as native multimodal and still needs a synthetic screenshot benchmark.
- The official BigModel pricing page currently lists GLM-5.2 rather than
  GLM-5.3 for direct China API billing. It lists GLM-5V-Turbo image/video/text
  input below 32K at CNY 5 input / CNY 22 output per million tokens. Do not buy
  a direct GLM-5.3 balance based on the OpenRouter model name alone.
- The signed-in BigModel console currently shows about 1,999,075 universal
  inference tokens plus 6,000,000 GLM-4.6V tokens. Direct Infisical-backed smoke
  calls passed without payment: `glm-5.3` returned the requested JSON using 217
  total tokens, and `glm-5.3-flash` correctly analyzed a synthetic project brand
  PNG using a Base64 Data URL and 267 total tokens.
- The repository previously relied on ignored `.env` files and process
  environment variables. It is now bound to the existing Infisical project,
  while applications continue to consume process environment variables.
- Capability-scoped migration state and remaining GitHub/production cutover
  work are owned by `plans/2026-08-27-infisical-secret-migration.md`; this plan
  retains only the GLM/provider admission work.
- OpenRouter Agent support already records returned usage cost and remains
  synthetic-only, but it does not send the screenshot path's ZDR/provider
  restrictions or a GLM reasoning-effort setting.
- The screenshot path supports Ark directly and OpenRouter, with a strict
  evidence parser and sensitive-processing gate.
- The working tree contains unrelated active changes, including `.env.example`,
  backend media work, and deployment files. Changes must avoid or carefully
  preserve those edits.
- Existing OpenRouter credit and the BigModel account's free resource packages
  are sufficient for the current synthetic text and vision evaluation. No
  checkout is justified now. A direct purchase becomes relevant only after the
  free packages approach exhaustion and a separately benchmarked vision path or
  deliberate provider-direct routing decision is approved.

## Chosen approach

1. Commit a non-secret `.infisical.json` that binds the repository to the
   existing project and defaults only to `dev`; never infer production from a
   branch name.
2. Add explicit `infisical run` package scripts for local web, backend, tests,
   and one safe environment-name check. Keep applications provider-neutral by
   continuing to read `process.env`.
3. Use human CLI login only for local development. Recommend GitHub OIDC and
   separate least-privilege workload identities for CI, TestFlight, and
   production; do not create long-lived service tokens as the default.
4. Enable GLM-5.3 synthetic Agent evaluation through the existing pinned
   OpenRouter adapter, adding explicit low reasoning effort and privacy routing.
5. Add a direct BigModel screenshot adapter for `glm-5v-turbo` rather than
   treating text-only GLM-5.3 as a vision model. Keep selection explicit and
   disabled until its key and sensitive-processing gate are present.
6. Benchmark `glm-4.6v`, `glm-5v-turbo`, and `glm-5.3-flash` only on synthetic
   screenshots before choosing a production default.

Rejected alternatives:

- Infisical OAuth Applications: delegated user access, wrong abstraction for
  workload secret delivery, and inaccessible to the current role.
- plaintext Infisical export to `.env`: creates a second secret source and
  leaves recoverable values on disk.
- one all-powerful machine identity: widens blast radius across environments.
- GLM-5.3 as the screenshot model: its standard endpoint is text-only.

## Milestones

1. **Complete — Secret delivery foundation**
   Add project config, safe local wrappers, documentation, and tests without
   touching secret values.
2. **Complete — GLM provider implementation**
   Harden the OpenRouter Agent request and add the direct BigModel screenshot
   adapter with focused tests.
3. **Complete — Account and purchase preparation**
   Inspected the signed-in billing surface and chose no purchase because the
   existing free packages cover the bounded text and vision proofs. Reassess at
   a defined low-balance threshold and confirm the exact amount before any
   future payment.
4. **Complete — Verification and review**
   CLI readback, focused provider tests, the full repository check, and durable
   secret-delivery guidance pass. Account purchase remains separately blocked
   on the explicit billing decision above.

## Decisions that could change direction

- If the current Infisical Free plan cannot create workload identities or OIDC,
  keep production migration pending rather than fall back silently to a shared
  personal token.
- If GLM-5.3 is not available from the China BigModel account, keep OpenRouter
  for synthetic Agent evaluation and purchase BigModel balance only for an
  officially listed vision model such as GLM-5V-Turbo.
- If the provider contract does not meet the private-data admission checklist,
  retain the existing synthetic-only boundary.
