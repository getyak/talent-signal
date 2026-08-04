# Integration boundary

Talent Signal integrates services only when they advance the evidence-to-action
loop without silently widening access to candidate data.

## Active local integration

The web demo has two analysis routes:

- `Local rules` is the default. It runs deterministic extraction in the
  browser and transmits nothing.
- `Private AI` is an explicit opt-in. It sends the current note to the
  server-side OpenRouter adapter, does not persist the request, and returns only
  schema-validated evidence proposals.

The AI adapter:

- keeps the API key server-side;
- enforces strict JSON Schema output;
- accepts only exact source excerpts;
- rejects unsupported fields and silently invented quotes;
- prevents ambiguous-speaker evidence from creating an action;
- asks OpenRouter to require all parameters, deny data collection, and use only
  zero-data-retention endpoints;
- keeps verdict and action selection deterministic;
- applies body limits, a same-origin production check, a short timeout, and a
  lightweight rate limit;
- stays disabled in production unless
  `TALENT_SIGNAL_ALLOW_PUBLIC_AI_DEMO=true`.

The production flag is an evaluation escape hatch, not a substitute for
authentication and a durable distributed rate limiter.

## Model routing

The configured order is:

1. `deepseek/deepseek-v4-pro` for the normal multilingual structured
   extraction path;
2. `anthropic/claude-opus-5` as the higher-capability fallback;
3. `deepseek/deepseek-v4-flash-0731` as the fast availability fallback.

All three currently advertise structured-output support in OpenRouter's public
model catalog. The order remains environment-configurable so model evaluation
can change without a code deploy.

References:

- [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs)
- [OpenRouter provider routing and data controls](https://openrouter.ai/docs/guides/routing/provider-selection)
- [OpenRouter zero data retention](https://openrouter.ai/docs/guides/features/zdr)

## Credentials intentionally not reused

The supplied credentials include resources created for other products. They
are not copied into Talent Signal merely because they are available:

| Resource | Decision |
| --- | --- |
| Stripe products and webhook | Defer. They belong to another billing catalog. |
| Google OAuth client | Defer. Redirect URIs and consent branding must be registered specifically for Talent Signal. |
| Supabase project | Defer. No Talent Signal schema, RLS policy, retention, or deletion cascade exists there. |
| Sentry project | Defer. Cross-project telemetry would mix incidents and may capture candidate context without a scrub policy. |
| Resend sender | Defer. Email is an external write and is outside the current approved action whitelist. |
| GitHub personal token | Never place in the application environment. Use GitHub Actions or a scoped installation token. |
| Whisper, Doubao ASR, ARK, weather | Defer until audio, image generation, or weather advances a validated product path. |
| Direct DeepSeek key | Defer. OpenRouter already supplies the configured DeepSeek fallback under the same privacy routing controls. |

Before production use, create project-specific credentials with least privilege
and rotate every credential that has been pasted into chat, terminal history,
issue text, or another shared surface.
