import { CONTRACT_VERSION } from "@talent-signal/contracts";
import Fastify from "fastify";
import { registerLabDiagnostics } from "../lib/labDiagnostics.js";
import { executeUnscopedChatTask } from "../modules/unscopedChat.js";

// Owned loopback proof only. The probe deliberately traverses the real text
// product adapter with a local synthetic provider; it never contacts a model.
const app = Fastify({ logger: false });
app.decorateRequest("auth", null as never);
registerLabDiagnostics(app, true, "synthetic_fixture");
let requests = 0;
app.get("/health/ready", async () => {
  requests++;
  await executeUnscopedChatTask({
    request: { idempotency_key: "diagnostic-native-fixture", objective: "synthetic-diagnostic-objective" },
    provider: {
      providerId: "zhipu-chat-completions", model: "synthetic-local-provider", supportsImageInput: false,
      answer: async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        return { kind: "answer", title: "Synthetic", body: "synthetic-diagnostic-result", citation_ids: [],
          provider_id: "zhipu-chat-completions", model: "synthetic-local-provider", provider_request_id: null,
          input_tokens: 0, output_tokens: 0 };
      },
    },
  });
  return { status: "synthetic-ready" };
});
app.post("/v1/auth/apple/challenges", async () => ({
  contract_version: CONTRACT_VERSION, challenge_id: "synthetic-unavailable", nonce: "synthetic-only",
  expires_at: new Date(Date.now() + 60_000).toISOString(),
}));
app.get("/test/metadata", async () => ({ fixture: "lab-diagnostics-stage-proof-v1", synthetic: true, requests, external_model_calls: 0, business_writes: 0 }));
await app.listen({ host: "127.0.0.1", port: 4340 });
console.log(JSON.stringify({ listening: 4340, synthetic: true }));
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => {
  void app.close().then(() => { console.log(JSON.stringify({ closed: true, requests })); process.exit(0); });
});
