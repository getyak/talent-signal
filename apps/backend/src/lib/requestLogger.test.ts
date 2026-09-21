import { Writable } from "node:stream";
import Fastify from "fastify";
import { expect, it } from "vitest";
import { requestLoggerOptions } from "./requestLogger.js";

it("redacts ephemeral conversation content and credentials while keeping diagnostic codes", async () => {
  let output = "";
  const stream = new Writable({ write(chunk, _encoding, done) { output += String(chunk); done(); } });
  const app = Fastify({ logger: { ...requestLoggerOptions("info"), stream } });
  app.log.info({ code: "PRIVATE_CONVERSATION_TIMEOUT", body: {
    messages: [{ role: "user", content: "private-content-canary" }],
    password: "password-canary", access_token: "token-canary",
  }, headers: { authorization: "authorization-canary" } });
  await app.close();
  expect(output).toContain("PRIVATE_CONVERSATION_TIMEOUT");
  for (const canary of ["private-content-canary", "password-canary", "token-canary", "authorization-canary"]) expect(output).not.toContain(canary);
});
