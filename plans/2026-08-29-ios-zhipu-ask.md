# iOS Zhipu Ask

## Outcome

Make the authenticated iOS Ask surface use one bounded Zhipu `glm-5.3`
response over the existing governed Chat context. The result must remain
evidence-bound, visibly remote-AI assisted, effect-free, retryable, and safe to
fall back to the existing deterministic answer when remote processing is not
admitted or fails.

Completion evidence is a real Zhipu synthetic probe, focused backend contract
tests, a simulator journey that exposes the remote-processing boundary, a
Release build, and a healthy TestFlight backend after transient Infisical
injection. Physical-iPhone replay remains a separate device proof.

## Boundaries

In scope:

- a provider-neutral Chat answer interface with a direct Zhipu implementation;
- sending only the recruiter question and selected published gold Wiki blocks,
  never raw screenshots, uploaded Chat media, or whole source transcripts;
- strict server-side validation of response kind and citation IDs;
- answer, question-set, clarification, and no-action outputs only;
- a Chat-specific remote-processing gate and server-only staging credential;
- iOS disclosure before send and visible AI-assisted response labeling;
- deterministic fallback with an honest recovery block;
- provider, timeout, malformed-output, unsupported-intent, and citation tests.

Out of scope:

- granting the model contact, calendar, messaging, ATS, or state-write tools;
- using the existing multi-step Agent runtime for ordinary Ask answers;
- sending Chat media to the text model;
- copying the development Zhipu credential into staging;
- claiming production or physical-device readiness without direct proof.

## Current evidence and decisions

- `/v1/chat/tasks` currently compiles a context manifest and assembles a
  deterministic response; the objective is recorded but not model-interpreted.
- The existing `BigModelAgentProvider` calls the official v4 Chat Completions
  endpoint with function calling. It belongs to multi-step Agent runs and is
  hard-limited to synthetic evidence, so ordinary Ask receives a smaller
  provider contract instead of weakening that boundary.
- iOS already stages contact proposals locally, checks identity matches, and
  requires explicit confirmation. Remote Chat must not bypass that loop.
- Development and staging provider probes succeed with the explicitly pinned
  `glm-5.3`; they returned contract-valid structured output with only allowed
  citations. Staging owns a dedicated backend-only Zhipu key in Infisical and
  admits remote Chat processing independently from Agent execution.
- Provider public privacy documentation is not sufficient proof of a no-
  retention/no-training private-evidence contract. The product therefore
  minimizes context, discloses remote processing, records provider/model
  metadata, and keeps the admission gate independently reversible.

## Chosen approach

1. Keep deterministic context assembly authoritative and let Zhipu add exactly
   one optional response block.
2. Give the model typed block summaries plus allowed evidence-fragment IDs; the
   server rejects citations outside that set and outputs that imply an external
   effect.
3. Keep provider calls bounded by timeout, token, and response-size limits. A
   provider failure preserves the deterministic response and adds a truthful
   recovery block.
4. Configure development and staging through Infisical `/shared`; Compose
   allowlists only the Chat variables used by the API. GitHub Actions remains
   scoped to `/release` and never receives the provider credential.
5. Add a synthetic container probe before declaring the deployed runtime ready.

## Milestones

1. **Complete — executable provider and contract**
   - add the provider interface, Zhipu adapter, output validation, context
     minimization, tests, and Chat integration;
   - keep all external effects unavailable.
2. **Complete — configuration and deployment gate**
   - add secret names, Compose allowlist, semantic verifier, synthetic probe,
     and operations documentation;
   - configure a staging-specific Zhipu credential without exposing its value.
3. **Complete except physical-device replay — iOS experience and proof**
   - disclose remote processing before send and label AI-assisted results;
   - pass focused backend/iOS tests, Release build, live provider probe,
     TestFlight runtime audit, and document remaining physical-device proof;
   - the deployed TestFlight container reached `zhipu-chat-completions/glm-5.3`
     with synthetic context and returned a citation-bound response while the
     API remained loopback-only behind tailnet HTTPS.

## Reconsider when

- Zhipu offers an account-level private-data contract or control that changes
  the retention/training evidence;
- question generation needs several governed tools or resumable steps, at which
  point it can become an Agent task without giving the model effect authority;
- TestFlight expands beyond the small authorized tailnet group.
