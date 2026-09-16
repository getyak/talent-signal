import { Type } from "@sinclair/typebox";
import type { ScreenshotContactTaskRequest } from "@talent-signal/agent";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { Pool } from "pg";
import { ApiError } from "../lib/apiError.js";
import type { ChatMediaStorage } from "./chatMediaStorage.js";
import {
  cancelScreenshotContactTask,
  confirmScreenshotContactProfile,
  createScreenshotContactTask,
  deleteContactCaptureTask,
  deleteScreenshotPreprocessingSource,
  linkScreenshotContactTaskCapture,
  listScreenshotContactTasks,
  loadBrowserCaptureTask,
  loadScreenshotContactImage,
  loadScreenshotContactTask,
  lookupScreenshotContactReceipt,
  resumeScreenshotContactTask,
  type ScreenshotContactTaskRunner,
} from "./screenshotContactTasks.js";

export function registerScreenshotContactRoutes(
  app: FastifyInstance,
  pool: Pool,
  authenticate: preHandlerHookHandler,
  chatMediaStorage: ChatMediaStorage,
  screenshotRunner: ScreenshotContactTaskRunner | null,
) {
  const security = [{ bearerSession: [] }];
  const idParams = Type.Object({ id: Type.String({ format: "uuid" }) });
  const revisionBody = Type.Object(
    { expected_revision: Type.Integer({ minimum: 1 }) },
    { additionalProperties: false },
  );

  app.post<{ Body: unknown }>("/v1/contact-agent/tasks", {
    preHandler: authenticate,
    bodyLimit: 40_100_000,
    schema: { tags: ["contact-agent"], security },
  }, async (request, reply) => {
    if (!screenshotRunner) {
      throw new ApiError(503, "CONTACT_AGENT_UNAVAILABLE", "Screenshot contact Agent is not configured.");
    }
    const result = await createScreenshotContactTask(
      pool,
      request.auth,
      request.body,
      chatMediaStorage,
      { preprocessingRequired: true },
    );
    void screenshotRunner.start(request.auth, result.body.task_id)
      .catch(() => request.log.error({ task_id: result.body.task_id }, "Contact task could not start"));
    return reply.header("idempotent-replayed", result.replayed)
      .status(result.replayed ? 200 : 201).send(result.body);
  });

  app.get<{ Params: { id: string; index: number } }>("/v1/contact-agent/tasks/:id/images/:index", {
    preHandler: authenticate,
    schema: {
      security,
      params: Type.Object({ id: Type.String({ format: "uuid" }), index: Type.Integer({ minimum: 0, maximum: 9 }) }),
    },
  }, async (request, reply) => {
    const image = await loadScreenshotContactImage(
      pool,
      request.auth,
      request.params.id,
      request.params.index,
      chatMediaStorage,
    );
    return reply.header("cache-control", "private, no-store")
      .header("x-content-type-options", "nosniff")
      .type(image.media_type).send(Buffer.from(image.data_base64, "base64"));
  });

  app.post<{ Params: { id: string }; Body: { expected_revision: number } }>(
    "/v1/contact-agent/tasks/:id/delete",
    { preHandler: authenticate, schema: { security, params: idParams, body: revisionBody } },
    async request => deleteContactCaptureTask(
      pool,
      request.auth,
      request.params.id,
      request.body.expected_revision,
      chatMediaStorage,
      () => screenshotRunner?.fenceSourceDeletion(request.auth, request.params.id),
    ),
  );
  app.post<{ Params: { id: string }; Body: { expected_revision: number } }>(
    "/v1/contact-agent/tasks/:id/preprocessing-source/delete",
    { preHandler: authenticate, schema: { security, params: idParams, body: revisionBody } },
    async request => deleteScreenshotPreprocessingSource(
      pool,
      request.auth,
      request.params.id,
      request.body.expected_revision,
      chatMediaStorage,
      () => screenshotRunner?.fenceSourceDeletion(request.auth, request.params.id),
    ),
  );
  app.post<{
    Params: { id: string };
    Body: { expected_revision: number; capture_id: string; source_resource_id: string };
  }>("/v1/contact-agent/tasks/:id/capture-link", {
    preHandler: authenticate,
    schema: {
      security,
      params: idParams,
      body: Type.Object({
        expected_revision: Type.Integer({ minimum: 1 }),
        capture_id: Type.String({ format: "uuid" }),
        source_resource_id: Type.String({ format: "uuid" }),
      }, { additionalProperties: false }),
    },
  }, async request => linkScreenshotContactTaskCapture(
    pool,
    request.auth,
    request.params.id,
    request.body,
  ));

  app.get<{ Params: { requestId: string } }>("/v1/contact-agent/browser-captures/:requestId", {
    preHandler: authenticate,
    schema: {
      security,
      params: Type.Object({ requestId: Type.String({ pattern: "^[a-zA-Z0-9-]{8,80}$" }) }),
    },
  }, async request => loadBrowserCaptureTask(pool, request.auth, request.params.requestId));
  app.get<{ Querystring: { handoff_request_id?: string } }>("/v1/contact-agent/tasks", {
    preHandler: authenticate,
    schema: {
      security,
      querystring: Type.Object({
        handoff_request_id: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
      }, { additionalProperties: false }),
    },
  }, async request => request.query.handoff_request_id
    ? lookupScreenshotContactReceipt(pool, request.auth, request.query.handoff_request_id)
    : listScreenshotContactTasks(pool, request.auth));
  app.get<{ Params: { id: string } }>("/v1/contact-agent/tasks/:id", {
    preHandler: authenticate,
    schema: { security, params: idParams },
  }, async request => {
    const result = await loadScreenshotContactTask(pool, request.auth, request.params.id);
    if (result.status === "running") {
      void screenshotRunner?.start(request.auth, result.task_id).catch(() => {});
    }
    return result;
  });

  app.post<{
    Params: { id: string };
    Body: {
      expected_revision: number;
      selected_person_id?: string;
      selected_relationship_context_id?: string;
      new_contact_name?: string;
      image?: ScreenshotContactTaskRequest["image"];
    };
  }>("/v1/contact-agent/tasks/:id/resume", {
    preHandler: authenticate,
    bodyLimit: 14_000_000,
    schema: {
      security,
      params: idParams,
      body: Type.Object({
        expected_revision: Type.Integer({ minimum: 1 }),
        selected_person_id: Type.Optional(Type.String({ format: "uuid" })),
        selected_relationship_context_id: Type.Optional(Type.String({ format: "uuid" })),
        new_contact_name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
        image: Type.Optional(Type.Object({
          media_type: Type.Union([Type.Literal("image/png"), Type.Literal("image/jpeg"), Type.Literal("image/webp")]),
          byte_size: Type.Integer({ minimum: 1, maximum: 10_000_000 }),
          content_hash: Type.String({ pattern: "^[a-f0-9]{64}$" }),
          data_base64: Type.String({ maxLength: 13_400_000 }),
        }, { additionalProperties: false })),
      }, { additionalProperties: false }),
    },
  }, async request => {
    if (!screenshotRunner) {
      throw new ApiError(503, "CONTACT_AGENT_UNAVAILABLE", "Screenshot contact Agent is not configured.");
    }
    const result = await resumeScreenshotContactTask(pool, request.auth, request.params.id, request.body);
    void screenshotRunner.start(request.auth, result.task_id, request.body.image).catch(() => {});
    return result;
  });
  app.post<{ Params: { id: string }; Body: unknown }>("/v1/contact-agent/tasks/:id/profile-confirmation", {
    preHandler: authenticate,
    bodyLimit: 16_000,
    schema: { security, params: idParams },
  }, async request => confirmScreenshotContactProfile(pool, request.auth, request.params.id, request.body));
  app.post<{ Params: { id: string }; Body: { expected_revision: number } }>(
    "/v1/contact-agent/tasks/:id/cancel",
    { preHandler: authenticate, schema: { security, params: idParams, body: revisionBody } },
    async request => cancelScreenshotContactTask(
      pool,
      request.auth,
      request.params.id,
      request.body.expected_revision,
      () => screenshotRunner?.fenceTaskCancellation(request.auth, request.params.id),
    ),
  );
}
