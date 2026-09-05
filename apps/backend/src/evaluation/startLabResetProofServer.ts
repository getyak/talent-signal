import { randomUUID } from "node:crypto";
import { CONTRACT_VERSION } from "@talent-signal/contracts";
import Fastify from "fastify";

// Loopback-owned synthetic auth boundary. No database, Apple authentication,
// model calls or business writes. Tokens never appear in console metadata.
const app = Fastify({ logger: false });
const sessions = new Map<string, { id: string; expiresAt: string; attempts: number; revoked: boolean }>();
let validations = 0;
app.post("/test/fixture", async () => {
  const id = randomUUID(), token = `fixture-reset-${id}`;
  const expiresAt = new Date(Date.now() + 1_800_000).toISOString();
  sessions.set(token, { id, expiresAt, attempts: 0, revoked: false });
  return { baseURL: "http://127.0.0.1:4341", accessToken: token, expiresAt,
    account: { id, slug: `fixture-${id}`, name: "Synthetic reset account" },
    user: { id, email: "reset@example.test", displayName: "Synthetic user", kind: "simulated_human" } };
});
app.post("/v1/auth/apple/challenges", async () => ({ contract_version: CONTRACT_VERSION,
  challenge_id: "synthetic-reset-challenge", nonce: "synthetic-reset-only", expires_at: new Date(Date.now() + 60_000).toISOString() }));
app.get("/v1/auth/session", async (request, reply) => {
  validations++;
  const value = sessions.get(request.headers.authorization?.replace(/^Bearer /, "") ?? "");
  if (!value || value.revoked) return reply.code(401).send({ error: { code: "SESSION_INVALID", message: "Synthetic session unavailable." } });
  return { contract_version: CONTRACT_VERSION, expires_at: value.expiresAt,
    account: { id: value.id, slug: `fixture-${value.id}`, name: "Synthetic reset account" },
    user: { id: value.id, email: "reset@example.test", display_name: "Synthetic user", kind: "simulated_human" } };
});
app.post("/v1/auth/logout", async (request, reply) => {
  const value = sessions.get(request.headers.authorization?.replace(/^Bearer /, "") ?? "");
  if (!value || value.revoked) return reply.code(401).send({ error: { code: "SESSION_INVALID", message: "Synthetic session unavailable." } });
  value.attempts++;
  if (value.attempts === 1) return reply.code(503).send({ error: { code: "SYNTHETIC_UNAVAILABLE", message: "First synthetic revocation is deliberately unavailable." } });
  value.revoked = true;
  return { contract_version: CONTRACT_VERSION };
});
app.get("/health/ready", async () => ({ status: "synthetic-reset-ready" }));
app.get("/test/metadata", async () => ({ purpose: "lab-reset-native-proof-v1", synthetic: true, validations,
  logout_attempts: [...sessions.values()].reduce((sum, value) => sum + value.attempts, 0),
  revoked_sessions: [...sessions.values()].filter(value => value.revoked).length,
  external_model_calls: 0, business_writes: 0 }));
await app.listen({ host: "127.0.0.1", port: 4341 });
console.log(JSON.stringify({ listening: 4341, synthetic: true }));
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => {
  void app.close().then(() => { console.log(JSON.stringify({ closed: true })); process.exit(0); });
});
