import { randomUUID } from "node:crypto";

import {
  PROHIBITED_INFERENCE_TERMS,
  type AnalysisProposalResponse,
  type SubmitAnalysisProposalRequest,
} from "@talent-signal/contracts";
import type { Pool, PoolClient } from "pg";

import { inTransaction } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { appendAudit } from "../lib/audit.js";
import { digestValue } from "../lib/hash.js";
import {
  claimIdempotency,
  completeIdempotency,
} from "../lib/idempotency.js";
import type { AuthContext } from "./auth.js";
import type { MutationResult } from "./captures.js";

interface CaptureProposalContext {
  id: string;
  identity_status: "bound" | "ambiguous" | "unbound";
  subject_id: string | null;
  assignment_id: string | null;
  status: "active" | "deleted";
}

interface EvidenceContext {
  id: string;
  source_message_id: string;
  speaker: "candidate" | "recruiter" | "hiring_manager" | "unknown";
  redacted_text: string | null;
}

function assertSafeProposalShape(
  capture: CaptureProposalContext,
  request: SubmitAnalysisProposalRequest,
): void {
  const serialized = JSON.stringify(request).toLowerCase();
  const prohibited = PROHIBITED_INFERENCE_TERMS.find((term) =>
    serialized.includes(term.replaceAll("_", " ")),
  );
  if (prohibited) {
    throw new ApiError(
      422,
      "PROHIBITED_INFERENCE",
      "Candidate scoring, fit, personality, protected-trait, and acceptance inference are outside the contract.",
      { prohibited_term: prohibited },
    );
  }

  if (
    capture.identity_status !== "bound" &&
    (request.assertions.length > 0 || request.action !== null)
  ) {
    throw new ApiError(
      422,
      "IDENTITY_REVIEW_REQUIRED",
      "Assertions and actions cannot be persisted until identity is explicitly bound.",
    );
  }
  if (request.disposition === "propose_action" && request.action === null) {
    throw new ApiError(
      422,
      "ACTION_REQUIRED",
      "A propose_action disposition requires one reviewable action.",
    );
  }
  if (request.disposition !== "propose_action" && request.action !== null) {
    throw new ApiError(
      422,
      "ACTION_NOT_ALLOWED",
      "Only propose_action may include an action proposal.",
    );
  }
  if (
    (request.disposition === "clarify" || request.disposition === "block") &&
    request.action !== null
  ) {
    throw new ApiError(
      422,
      "UNRESOLVED_ACTION_FORBIDDEN",
      "Clarification and blocked states cannot create an action.",
    );
  }
}

async function validateSupersession(
  client: PoolClient,
  accountId: string,
  capture: CaptureProposalContext,
  assertion: SubmitAnalysisProposalRequest["assertions"][number],
): Promise<void> {
  if (assertion.temporal_relation !== "supersedes") {
    if (assertion.supersedes_state_id !== undefined) {
      throw new ApiError(
        422,
        "UNEXPECTED_SUPERSESSION_TARGET",
        "A supersession target is only valid for a supersedes relation.",
      );
    }
    return;
  }
  if (!assertion.supersedes_state_id) {
    throw new ApiError(
      422,
      "SUPERSESSION_TARGET_REQUIRED",
      "A superseding assertion must identify the active state it may replace.",
    );
  }
  const state = await client.query<{ id: string }>(
    `SELECT id
     FROM confirmed_states
     WHERE account_id = $1
       AND id = $2
       AND subject_id = $3
       AND assignment_id = $4
       AND field = $5
       AND status = 'active'`,
    [
      accountId,
      assertion.supersedes_state_id,
      capture.subject_id,
      capture.assignment_id,
      assertion.field,
    ],
  );
  if (!state.rows[0]) {
    throw new ApiError(
      409,
      "SUPERSESSION_TARGET_STALE",
      "The proposed supersession target is no longer the active scoped state.",
    );
  }
}

export async function submitAnalysisProposal(
  pool: Pool,
  auth: AuthContext,
  captureId: string,
  request: SubmitAnalysisProposalRequest,
): Promise<MutationResult<AnalysisProposalResponse>> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `submit_analysis:${captureId}`,
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      return {
        body: idempotency.replay.body as AnalysisProposalResponse,
        replayed: true,
        status: idempotency.replay.status,
      };
    }

    const captureResult = await client.query<CaptureProposalContext>(
      `SELECT id, identity_status, subject_id, assignment_id, status
       FROM captures
       WHERE account_id = $1 AND id = $2
       FOR UPDATE`,
      [auth.accountId, captureId],
    );
    const capture = captureResult.rows[0];
    if (!capture) {
      throw new ApiError(
        404,
        "CAPTURE_NOT_FOUND",
        "The capture was not found.",
      );
    }
    if (capture.status === "deleted") {
      throw new ApiError(
        410,
        "CAPTURE_DELETED",
        "Deleted evidence cannot receive a proposal.",
      );
    }
    assertSafeProposalShape(capture, request);

    const evidenceResult = await client.query<EvidenceContext>(
      `SELECT id, source_message_id, speaker, redacted_text
       FROM evidence_items
       WHERE account_id = $1 AND capture_id = $2 AND status = 'active'`,
      [auth.accountId, captureId],
    );
    const evidenceBySourceId = new Map(
      evidenceResult.rows.map((item) => [item.source_message_id, item]),
    );

    for (const assertion of request.assertions) {
      const evidence = evidenceBySourceId.get(assertion.evidence_message_id);
      if (!evidence?.redacted_text) {
        throw new ApiError(
          422,
          "EVIDENCE_REFERENCE_INVALID",
          "Every assertion must reference active evidence in this capture.",
          { evidence_message_id: assertion.evidence_message_id },
        );
      }
      if (!evidence.redacted_text.includes(assertion.evidence_quote)) {
        throw new ApiError(
          422,
          "EVIDENCE_QUOTE_NOT_EXACT",
          "The cited evidence quote must be an exact contiguous source span.",
          { evidence_message_id: assertion.evidence_message_id },
        );
      }
      if (
        assertion.subject_kind === "candidate" &&
        evidence.speaker !== "candidate"
      ) {
        throw new ApiError(
          422,
          "SPEAKER_ATTRIBUTION_UNSUPPORTED",
          "A non-candidate message cannot support a candidate assertion.",
          { evidence_message_id: assertion.evidence_message_id },
        );
      }
      if (
        assertion.status === "ambiguous" &&
        request.disposition === "propose_action"
      ) {
        throw new ApiError(
          422,
          "AMBIGUOUS_ASSERTION_CANNOT_TRIGGER_ACTION",
          "An ambiguous assertion requires clarification, not execution.",
        );
      }
      await validateSupersession(
        client,
        auth.accountId,
        capture,
        assertion,
      );
    }

    if (request.action) {
      for (const messageId of request.action.evidence_message_ids) {
        if (!evidenceBySourceId.has(messageId)) {
          throw new ApiError(
            422,
            "ACTION_EVIDENCE_INVALID",
            "The action must cite evidence from this capture.",
            { evidence_message_id: messageId },
          );
        }
      }
    }

    const proposalId = randomUUID();
    const createdAt = new Date();
    await client.query(
      `INSERT INTO analysis_proposals(
         id, account_id, capture_id, disposition, producer_kind,
         producer_name, producer_version
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        proposalId,
        auth.accountId,
        captureId,
        request.disposition,
        request.producer.kind,
        request.producer.name,
        request.producer.version,
      ],
    );

    const assertions: AnalysisProposalResponse["assertions"] = [];
    for (const assertion of request.assertions) {
      const id = randomUUID();
      const evidence = evidenceBySourceId.get(assertion.evidence_message_id);
      if (!evidence) {
        throw new ApiError(
          422,
          "EVIDENCE_REFERENCE_INVALID",
          "The evidence reference became unavailable.",
        );
      }
      await client.query(
        `INSERT INTO proposed_assertions(
           id, account_id, capture_id, analysis_proposal_id, evidence_id,
           field, proposal_status, proposed_value, evidence_quote,
           subject_kind, temporal_relation, supersedes_state_id
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
         )`,
        [
          id,
          auth.accountId,
          captureId,
          proposalId,
          evidence.id,
          assertion.field,
          assertion.status,
          assertion.value,
          assertion.evidence_quote,
          assertion.subject_kind,
          assertion.temporal_relation,
          assertion.supersedes_state_id ?? null,
        ],
      );
      assertions.push({
        id,
        field: assertion.field,
        status: assertion.status,
        review_status: "pending",
        value: assertion.value,
        evidence_id: evidence.id,
        evidence_quote: assertion.evidence_quote,
        subject_kind: assertion.subject_kind,
        temporal_relation: assertion.temporal_relation,
        supersedes_state_id: assertion.supersedes_state_id ?? null,
        version: 1,
      });
    }

    let action: AnalysisProposalResponse["action"] = null;
    if (request.action) {
      const actionId = randomUUID();
      const evidenceIds = request.action.evidence_message_ids.map(
        (messageId) => {
          const evidence = evidenceBySourceId.get(messageId);
          if (!evidence) {
            throw new ApiError(
              422,
              "ACTION_EVIDENCE_INVALID",
              "The action evidence reference became unavailable.",
            );
          }
          return evidence.id;
        },
      );
      const requiredAssertionIds = assertions.map((assertion) => assertion.id);
      const exactPreviewDigest = digestValue(request.action.effect_preview);
      await client.query(
        `INSERT INTO action_proposals(
           id, account_id, capture_id, analysis_proposal_id, proposed_by_kind,
           action_type, owner_kind, target_text, reason_text, due_text,
           evidence_ids, required_assertion_ids, exact_preview,
           exact_preview_digest, simulated
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, true
         )`,
        [
          actionId,
          auth.accountId,
          captureId,
          proposalId,
          request.producer.kind,
          request.action.type,
          request.action.owner,
          request.action.target,
          request.action.reason,
          request.action.due,
          evidenceIds,
          requiredAssertionIds,
          request.action.effect_preview,
          exactPreviewDigest,
        ],
      );
      action = {
        id: actionId,
        type: "prepare_question",
        status: "proposed",
        version: 1,
        target: request.action.target,
        reason: request.action.reason,
        due: request.action.due,
        evidence_ids: evidenceIds,
        required_assertion_ids: requiredAssertionIds,
        exact_preview: request.action.effect_preview,
        exact_preview_digest: exactPreviewDigest,
        simulated: true,
      };
    }

    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "analysis.proposed",
      "analysis_proposal",
      proposalId,
      {
        assertion_count: assertions.length,
        disposition: request.disposition,
        has_action: action !== null,
        producer_kind: request.producer.kind,
      },
    );
    const body: AnalysisProposalResponse = {
      id: proposalId,
      capture_id: captureId,
      disposition: request.disposition,
      producer: request.producer,
      assertions,
      action,
      created_at: createdAt.toISOString(),
    };
    await completeIdempotency(client, idempotency, 201, body);
    return { body, replayed: false, status: 201 };
  });
}
