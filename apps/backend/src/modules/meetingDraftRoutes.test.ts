import rateLimit from "@fastify/rate-limit";
import { CONTRACT_VERSION } from "@talent-signal/contracts";
import Fastify from "fastify";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "./auth.js";

const mocked = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("./meetingDrafts.js", () => ({
  dismissMeetingDraft: vi.fn(),
  getMeetingDraft: vi.fn(),
  listMeetingDrafts: mocked.list,
  updateMeetingDraft: vi.fn(),
}));

import { registerMeetingDraftRoutes } from "./meetingDraftRoutes.js";

const app = Fastify({ logger: false });

beforeAll(async () => {
  mocked.list.mockResolvedValue({
    complete: true,
    contract_version: CONTRACT_VERSION,
    drafts: [],
    next_cursor: null,
  });
  app.decorateRequest("auth", null as unknown as AuthContext);
  await app.register(rateLimit, { global: false });
  app.setErrorHandler((error, request, reply) => {
    if ((error as { statusCode?: number }).statusCode === 429) {
      void reply.status(429).send({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Retry after the current window.",
          request_id: request.id,
        },
      });
      return;
    }
    void reply.send(error);
  });
  registerMeetingDraftRoutes(
    app,
    { query: vi.fn() } as unknown as Pool,
    async (request) => {
      const accountId = String(request.headers["x-test-account"] ?? "account-a");
      const userId = String(request.headers["x-test-user"] ?? "user-a");
      request.auth = {
        accountId,
        accountSlug: accountId,
        sessionId: `${userId}-session`,
        userEmail: `${userId}@example.test`,
        userId,
        userKind: "simulated_human",
      };
    },
  );
  await app.ready();
});

afterAll(async () => app.close());

describe("meeting draft route resource guard", () => {
  it("isolates the read bucket by authenticated account and user on one IP", async () => {
    for (let index = 0; index < 30; index += 1) {
      const response = await app.inject({
        headers: { "x-test-account": "account-a", "x-test-user": "user-a" },
        method: "GET",
        url: "/v1/meeting-drafts",
      });
      expect(response.statusCode).toBe(200);
    }
    const limited = await app.inject({
      headers: { "x-test-account": "account-a", "x-test-user": "user-a" },
      method: "GET",
      url: "/v1/meeting-drafts",
    });
    expect(limited.statusCode, limited.body).toBe(429);

    const peer = await app.inject({
      headers: { "x-test-account": "account-a", "x-test-user": "user-b" },
      method: "GET",
      url: "/v1/meeting-drafts",
    });
    expect(peer.statusCode).toBe(200);
  });
});
