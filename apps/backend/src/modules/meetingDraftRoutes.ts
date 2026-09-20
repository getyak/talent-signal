import { Type } from "@sinclair/typebox";
import {
  CONTRACT_VERSION,
  ErrorResponseSchema,
  MeetingDraftDismissRequestSchema,
  MeetingDraftListResponseSchema,
  MeetingDraftResponseSchema,
  type MeetingDraftDismissRequest,
} from "@talent-signal/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { Pool } from "pg";
import {
  dismissMeetingDraft,
  getMeetingDraft,
  listMeetingDrafts,
} from "./meetingDrafts.js";
import { registerRecurringJob } from "../lib/recurringJob.js";

export function registerMeetingDraftRoutes(
  app: FastifyInstance,
  pool: Pool,
  authenticate: preHandlerHookHandler,
) {
  const common = {
    preHandler: authenticate,
    schema: { security: [{ bearerSession: [] }], tags: ["meeting-drafts"] },
  };
  const params = Type.Object(
    { id: Type.String({ format: "uuid" }) },
    { additionalProperties: false },
  );
  app.get<{ Querystring: { after?: string; limit?: string } }>(
    "/v1/meeting-drafts",
    {
      ...common,
      schema: {
        ...common.schema,
        querystring: Type.Object(
          {
            after: Type.Optional(Type.String({ format: "uuid" })),
            limit: Type.Optional(
              Type.String({ pattern: "^(?:[1-9]|[1-4][0-9]|50)$" }),
            ),
          },
          { additionalProperties: false },
        ),
        response: {
          200: MeetingDraftListResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      return listMeetingDrafts(
        pool,
        request.auth,
        request.query.after,
        Number(request.query.limit ?? 50),
      );
    },
  );
  app.get<{ Params: { id: string } }>(
    "/v1/meeting-drafts/:id",
    {
      ...common,
      schema: {
        ...common.schema,
        params,
        response: {
          200: MeetingDraftResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      return {
        contract_version: CONTRACT_VERSION,
        draft: await getMeetingDraft(pool, request.auth, request.params.id),
      };
    },
  );
  app.post<{
    Params: { id: string };
    Body: MeetingDraftDismissRequest;
  }>(
    "/v1/meeting-drafts/:id/dismiss",
    {
      ...common,
      schema: {
        ...common.schema,
        params,
        body: MeetingDraftDismissRequestSchema,
        response: {
          200: MeetingDraftResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      return {
        contract_version: CONTRACT_VERSION,
        draft: await dismissMeetingDraft(
          pool,
          request.auth,
          request.params.id,
          request.body,
        ),
      };
    },
  );
  registerRecurringJob(app, {
    name: "meeting-draft-retention-sweep",
    intervalMs: 60_000,
    run: async () => {
      const accounts = await pool.query<{ account_id: string }>(
        "SELECT DISTINCT account_id FROM meeting_drafts WHERE status NOT IN ('redacted','expired')",
      );
      for (const account of accounts.rows)
        await pool.query("SELECT redact_unavailable_meeting_drafts($1)", [
          account.account_id,
        ]);
    },
  });
}
