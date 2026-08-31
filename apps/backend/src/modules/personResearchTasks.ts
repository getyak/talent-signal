import { createHash } from "node:crypto";

import {
  CONTRACT_VERSION,
  type PersonResearchTaskRequest,
  type PersonResearchTaskResponse,
} from "@talent-signal/contracts";
import type { Pool } from "pg";

import { inTransaction } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { appendAudit } from "../lib/audit.js";
import {
  claimIdempotency,
  completeIdempotency,
} from "../lib/idempotency.js";
import type { AuthContext } from "./auth.js";
import type { PersonResearchAgentProviding } from "./personResearchAgentClient.js";
import {
  personResearchRunID,
  runPersonResearchChatIngress,
} from "./personResearchChatIngress.js";

export interface PersonResearchTaskMutationResult {
  body: PersonResearchTaskResponse;
  replayed: boolean;
  status: number;
}

function imageBytes(request: PersonResearchTaskRequest): Uint8Array {
  const decoded = Buffer.from(request.image.data_base64, "base64");
  const canonicalBase64 = decoded.toString("base64");
  const contentHash = createHash("sha256").update(decoded).digest("hex");
  if (
    canonicalBase64 !== request.image.data_base64 ||
    decoded.byteLength !== request.image.byte_size ||
    contentHash !== request.image.content_hash
  ) {
    throw new ApiError(
      400,
      "PERSON_RESEARCH_IMAGE_MISMATCH",
      "The screenshot bytes do not match the declared size and content hash.",
    );
  }
  return decoded;
}

function requestIdentity(request: PersonResearchTaskRequest): {
  objective_hash: string;
  image: {
    media_type: PersonResearchTaskRequest["image"]["media_type"];
    byte_size: number;
    content_hash: string;
  };
} {
  return {
    objective_hash: createHash("sha256")
      .update(request.objective)
      .digest("hex"),
    image: {
      media_type: request.image.media_type,
      byte_size: request.image.byte_size,
      content_hash: request.image.content_hash,
    },
  };
}

export async function executePersonResearchTask(input: {
  accountID: string;
  request: PersonResearchTaskRequest;
  provider: PersonResearchAgentProviding;
  createdAt?: Date;
}): Promise<PersonResearchTaskResponse> {
  const data = imageBytes(input.request);
  const taskID = personResearchRunID(
    input.accountID,
    input.request.idempotency_key,
  );
  const research = await runPersonResearchChatIngress({
    provider: input.provider,
    media: [{
      id: "request-image",
      media_type: input.request.image.media_type,
    }],
    loadMedia: async (mediaID) => {
      if (mediaID !== "request-image") {
        throw new Error("The person-research Run requested unknown media.");
      }
      return data;
    },
    runID: taskID,
    objective: input.request.objective,
  });
  if (!research.block || research.status === "disabled") {
    throw new ApiError(
      503,
      "PERSON_RESEARCH_DISABLED",
      "Screenshot public-profile research is not enabled for this workspace.",
    );
  }
  const disposition: PersonResearchTaskResponse["disposition"] =
    research.status === "completed"
      ? "answer"
      : research.status === "no_action"
        ? "no_action"
        : "unavailable";
  return {
    contract_version: CONTRACT_VERSION,
    task_id: taskID,
    disposition,
    blocks: [research.block],
    source_image: {
      media_type: input.request.image.media_type,
      byte_size: input.request.image.byte_size,
      content_hash: input.request.image.content_hash,
      persisted: false,
    },
    external_effects: [],
    created_at: (input.createdAt ?? new Date()).toISOString(),
  };
}

export async function createPersonResearchTask(
  pool: Pool,
  auth: AuthContext,
  request: PersonResearchTaskRequest,
  provider: PersonResearchAgentProviding | null,
): Promise<PersonResearchTaskMutationResult> {
  if (!provider) {
    throw new ApiError(
      503,
      "PERSON_RESEARCH_DISABLED",
      "Screenshot public-profile research is not enabled for this workspace.",
    );
  }
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "create_person_research_task",
      request.idempotency_key,
      requestIdentity(request),
    );
    if (idempotency.replay) {
      const replay = idempotency.replay.body as PersonResearchTaskResponse;
      if (
        !replay ||
        typeof replay !== "object" ||
        !("source_image" in replay) ||
        replay.task_id !== personResearchRunID(auth.accountId, request.idempotency_key)
      ) {
        throw new ApiError(
          409,
          "IDEMPOTENCY_STATE_UNAVAILABLE",
          "The prior screenshot research task could not be resolved.",
        );
      }
      return {
        body: replay,
        replayed: true,
        status: idempotency.replay.status,
      };
    }
    const body = await executePersonResearchTask({
      accountID: auth.accountId,
      request,
      provider,
    });
    const block = body.blocks[0];
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "person_research_task.completed",
      "person_research_task",
      body.task_id,
      {
        disposition: body.disposition,
        image_media_type: body.source_image.media_type,
        image_byte_size: body.source_image.byte_size,
        image_content_hash: body.source_image.content_hash,
        raw_image_persisted: false,
        public_source_count: block?.public_source_refs?.length ?? 0,
        external_effect_count: 0,
      },
    );
    await completeIdempotency(client, idempotency, 201, body);
    return { body, replayed: false, status: 201 };
  });
}
