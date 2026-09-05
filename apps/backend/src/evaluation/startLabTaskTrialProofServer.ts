import assert from "node:assert/strict";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import type { BackendConfig } from "../config.js";
import { createEnvironmentChatAnswerProvider, ZhipuChatAnswerProvider } from "../modules/chatAnswerProvider.js";

// Owned loopback evaluation service. Real mode must be explicitly admitted and
// has a process-wide two-request ceiling; fixture mode never sends model data.
const databaseURL = process.env.LAB_TRIAL_EVALUATION_DATABASE_URL;
assert(databaseURL && ["localhost", "127.0.0.1"].includes(new URL(databaseURL).hostname), "Use an explicit disposable loopback database.");
const live = process.env.LAB_TRIAL_REAL_PROVIDER_PROOF === "true";
const requestLimit = Number(process.env.LAB_TRIAL_REAL_REQUEST_LIMIT ?? "2");
assert(Number.isInteger(requestLimit) && requestLimit >= 1 && requestLimit <= 2);
let requestsStarted = 0;
let responsesReceived = 0;
const fetcher = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  if (live && requestsStarted >= requestLimit) throw new Error("Owned proof model request limit reached.");
  requestsStarted += 1;
  if (live) {
    const response = await fetch(input, init);
    responsesReceived += 1;
    return response;
  }
  const body = JSON.parse(String(init?.body));
  responsesReceived += 1;
  return new Response(JSON.stringify({ id: `synthetic-native-${requestsStarted}`, model: body.model,
    choices: [{ message: { content: JSON.stringify({ outcome: "reply", title: "Synthetic reply",
      body: "Your session model trial is connected to this product conversation." }) } }],
    usage: { prompt_tokens: 11, completion_tokens: 7 } }), { status: 200 });
}) as typeof fetch;
const baseline = live ? createEnvironmentChatAnswerProvider(process.env, fetcher)
  : new ZhipuChatAnswerProvider({ apiKey: "fixture-only", model: "glm-5.3", fetcher });
assert(baseline, "Real mode requires an admitted provider.");
const providers = new Map([[baseline.model, baseline]]);
if (!live) providers.set("glm-4.7", new ZhipuChatAnswerProvider({ apiKey: "fixture-only", model: "glm-4.7", fetcher }));
const pool = new Pool({ connectionString: databaseURL, max: 4 });
const config: BackendConfig = { databaseUrl: databaseURL, host: "127.0.0.1", port: 4329,
  allowedOrigins: [], appleSignInAudiences: [], appleSignInEnabled: false,
  passwordAuthEnabled: false, passwordRegistrationEnabled: false, simulatedAuthEnabled: true,
  internalLabEnabled: true, retentionSweepIntervalMs: 60_000, sessionTtlSeconds: 3600 };
const app = await buildApp({ pool, config, remoteChatProvider: baseline, labProviders: providers, personResearchProvider: null });
app.get("/proof-state", async () => ({ purpose: "owned-native-lab-trial-proof", real_provider: live,
  requests_started: requestsStarted, responses_received: responsesReceived, real_request_ceiling: live ? requestLimit : 0 }));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
  void (async () => { await app.close(); await pool.end(); process.exit(0); })();
});
await app.listen({ host: "127.0.0.1", port: 4329 });
console.log(JSON.stringify({ listening: 4329, real_provider: live, model: baseline.model, real_request_ceiling: live ? requestLimit : 0 }));
