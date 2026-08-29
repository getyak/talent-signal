import { createHash } from "node:crypto";

import {
  CONTRACT_VERSION,
  type AppendTelemetryBatchRequest,
  type CompleteTelemetryTraceRequest,
  type CreateTelemetryTraceRequest,
  type TelemetryContext,
  type TelemetryMutationResponse,
  type TelemetryTraceDetailResponse,
  type TelemetryTraceListResponse,
} from "@talent-signal/contracts";
import type { Pool, PoolClient } from "pg";

import { inTransaction, type DatabaseClient } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { sha256, sha256Bytes } from "../lib/hash.js";
import type { AuthContext } from "./auth.js";

const MAX_TOTAL_CONTENT_BYTES = 8 * 1024 * 1024;

interface TraceSummaryRow {
  trace_id: string;
  interaction_id: string;
  name: string;
  surface: string;
  route: string;
  status: string;
  data_classification: string;
  content_capture_status: string;
  span_count: number;
  event_count: number;
  artifact_count: number;
  error_count: number;
  started_at: Date | string;
  ended_at: Date | string | null;
  duration_ms: number | null;
  eval_scenario: string | null;
  eval_provider: string | null;
  eval_modality: "text" | "image" | "multimodal" | null;
  eval_verdict: "pass" | "fail" | "needs_review" | null;
  eval_earned_points: number | null;
  created_at: Date | string;
}

interface TraceDetailRow extends TraceSummaryRow {
  root_span_id: string;
  safe_attributes: Record<string, string | number | boolean | null>;
}

interface SpanRow {
  span_id: string;
  parent_span_id: string | null;
  name: string;
  kind: string;
  status: string;
  started_at: Date | string;
  ended_at: Date | string | null;
  duration_ms: number | null;
  safe_attributes: Record<string, string | number | boolean | null>;
  artifact_refs: string[];
  agent_run_id: string | null;
  agent_event_sequence: number | null;
}

interface EventRow {
  id: string;
  span_id: string | null;
  name: string;
  occurred_at: Date | string;
  safe_attributes: Record<string, string | number | boolean | null>;
  artifact_refs: string[];
}

interface ArtifactRow {
  id: string;
  ordinal: number;
  kind: string;
  mime_type: string;
  byte_size: number;
  content_hash: string;
  capture_status: string;
  purpose: string;
  authorization_scope: string;
  governed_source_ref: string | null;
  retention_expires_at: Date | string;
  deletion_state: string;
  text_content: string | null;
  created_at: Date | string;
}

interface EvaluationRow {
  id: string;
  span_id: string | null;
  evaluator_type: "deterministic" | "human" | "model" | "outcome";
  evaluator_name: string;
  evaluator_version: string;
  verdict: "pass" | "fail" | "abstain" | "needs_review";
  score: number | null;
  explanation: string | null;
  evidence_refs: string[];
  created_at: Date | string;
}

interface AgentTraceReceiptRow {
  run_count: number;
  completed_run_count: number;
  terminal_event_count: number;
  tool_call_count: number;
  external_effect_count: number;
  input_artifact_count: number;
}

type ExpectedAgentEvaluation = {
  name: "expected_terminal_match" | "expected_tool_sequence_match";
  verdict: "pass" | "fail";
  score: 0 | 1;
  explanation: string;
  evidenceRefs: string[];
};

type EvalCaseEvaluation = {
  name:
    | "case_input_capability"
    | "case_terminal_semantic"
    | "case_tool_policy"
    | "case_evidence_lineage"
    | "case_external_effect_boundary";
  verdict: "pass" | "fail" | "needs_review";
  score: 0 | 1 | null;
  explanation: string;
  evidenceRefs: string[];
};

export function evaluateExpectedAgentOutcome(input: {
  expectedTerminal?: string;
  expectedToolSequence?: string;
  observedTerminal: string | null;
  observedToolSequence: string[];
  evidenceRefs?: string[];
}): ExpectedAgentEvaluation[] {
  const evaluations: ExpectedAgentEvaluation[] = [];
  const evidenceRefs = input.evidenceRefs ?? [];
  if (input.expectedTerminal) {
    const matches = input.observedTerminal === input.expectedTerminal;
    evaluations.push({
      name: "expected_terminal_match",
      verdict: matches ? "pass" : "fail",
      score: matches ? 1 : 0,
      explanation: matches
        ? `Observed terminal ${input.observedTerminal} matches the frozen expectation.`
        : `Expected terminal ${input.expectedTerminal}; observed ${input.observedTerminal ?? "no terminal receipt"}.`,
      evidenceRefs,
    });
  }
  if (input.expectedToolSequence) {
    const expected = input.expectedToolSequence
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const observed = input.observedToolSequence;
    const matches =
      expected.length === observed.length &&
      expected.every((tool, index) => observed[index] === tool);
    evaluations.push({
      name: "expected_tool_sequence_match",
      verdict: matches ? "pass" : "fail",
      score: matches ? 1 : 0,
      explanation: matches
        ? `Observed tool sequence ${observed.join(" → ")} matches the frozen expectation.`
        : `Expected tools ${expected.join(" → ") || "none"}; observed ${observed.join(" → ") || "none"}.`,
      evidenceRefs,
    });
  }
  return evaluations;
}

export function evaluateAgentEvalCase(input: {
  expectedTerminal?: string;
  expectedSemanticReason?: string;
  expectedToolSequence?: string;
  observedTerminal: string | null;
  observedSemanticReason: string | null;
  observedToolSequence: string[];
  inputRole: "decision_evidence" | "trace_only";
  imageCount: number;
  imageUnderstanding: boolean;
  inputArtifactCount: number;
  traceArtifactCount: number;
  externalEffectCount: number;
  evidenceRefs?: string[];
}): EvalCaseEvaluation[] {
  const evidenceRefs = input.evidenceRefs ?? [];
  const expectedTools = (input.expectedToolSequence ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const toolPolicyMatches =
    expectedTools.length > 0 &&
    expectedTools.length === input.observedToolSequence.length &&
    expectedTools.every(
      (tool, index) => input.observedToolSequence[index] === tool,
    );
  const terminalMatches =
    Boolean(input.expectedTerminal) &&
    input.observedTerminal === input.expectedTerminal;
  const semanticMatches =
    Boolean(input.expectedSemanticReason) &&
    input.observedSemanticReason === input.expectedSemanticReason;
  const semanticHasExpectation = Boolean(
    input.expectedTerminal && input.expectedSemanticReason,
  );
  const capabilityPasses =
    input.imageCount === 0 ||
    input.inputRole === "trace_only" ||
    input.imageUnderstanding;
  const lineagePasses =
    input.traceArtifactCount > 0 &&
    input.inputArtifactCount === input.traceArtifactCount;

  return [
    {
      name: "case_input_capability",
      verdict: capabilityPasses ? "pass" : "fail",
      score: capabilityPasses ? 1 : 0,
      explanation:
        input.imageCount === 0
          ? "The text input is within the Provider's declared capability."
          : input.inputRole === "trace_only"
            ? "Images are explicitly trace-only and excluded from the semantic decision."
            : input.imageUnderstanding
              ? "Decision-relevant images are within the Provider's declared understanding capability."
              : "Decision-relevant images require image understanding, which this Provider does not declare.",
      evidenceRefs,
    },
    {
      name: "case_terminal_semantic",
      verdict: !semanticHasExpectation
        ? "needs_review"
        : terminalMatches && semanticMatches
          ? "pass"
          : "fail",
      score: !semanticHasExpectation
        ? null
        : terminalMatches && semanticMatches
          ? 1
          : 0,
      explanation: !semanticHasExpectation
        ? "The case has no frozen terminal and semantic-reason expectation."
        : terminalMatches && semanticMatches
          ? `Observed ${input.observedTerminal} with reason ${input.observedSemanticReason} matches the frozen case.`
          : `Expected ${input.expectedTerminal} / ${input.expectedSemanticReason}; observed ${input.observedTerminal ?? "no terminal"} / ${input.observedSemanticReason ?? "no semantic reason"}.`,
      evidenceRefs,
    },
    {
      name: "case_tool_policy",
      verdict: toolPolicyMatches ? "pass" : "fail",
      score: toolPolicyMatches ? 1 : 0,
      explanation: toolPolicyMatches
        ? `The governed tool path is exactly ${input.observedToolSequence.join(" → ")}.`
        : `Expected ${expectedTools.join(" → ") || "a frozen tool path"}; observed ${input.observedToolSequence.join(" → ") || "none"}.`,
      evidenceRefs: [],
    },
    {
      name: "case_evidence_lineage",
      verdict: lineagePasses ? "pass" : "fail",
      score: lineagePasses ? 1 : 0,
      explanation: lineagePasses
        ? `All ${input.traceArtifactCount} Trace artifacts are frozen in the Agent input manifest.`
        : `Trace artifacts: ${input.traceArtifactCount}; Agent input artifacts: ${input.inputArtifactCount}. Full lineage is required.`,
      evidenceRefs,
    },
    {
      name: "case_external_effect_boundary",
      verdict: input.externalEffectCount === 0 ? "pass" : "fail",
      score: input.externalEffectCount === 0 ? 1 : 0,
      explanation:
        input.externalEffectCount === 0
          ? "The case produced zero external effects."
          : `${input.externalEffectCount} external effects violate the Eval Case boundary.`,
      evidenceRefs: [],
    },
  ];
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function optionalIso(value: Date | string | null): string | null {
  return value === null ? null : iso(value);
}

function summary(row: TraceSummaryRow) {
  return {
    trace_id: row.trace_id,
    interaction_id: row.interaction_id,
    name: row.name,
    surface: row.surface,
    route: row.route,
    status: row.status,
    data_classification: row.data_classification,
    content_capture_status: row.content_capture_status,
    span_count: Number(row.span_count),
    event_count: Number(row.event_count),
    artifact_count: Number(row.artifact_count),
    error_count: Number(row.error_count),
    started_at: iso(row.started_at),
    ended_at: optionalIso(row.ended_at),
    duration_ms: row.duration_ms === null ? null : Number(row.duration_ms),
    eval_case:
      row.eval_scenario &&
      row.eval_provider &&
      row.eval_modality &&
      row.eval_verdict &&
      row.eval_earned_points !== null
        ? {
            scenario: row.eval_scenario,
            provider: row.eval_provider,
            modality: row.eval_modality,
            verdict: row.eval_verdict,
            earned_points: Number(row.eval_earned_points),
            possible_points: 100 as const,
          }
        : null,
    created_at: iso(row.created_at),
  };
}

function decodeContent(part: CreateTelemetryTraceRequest["content_parts"][number]): {
  binary: Buffer | null;
  text: string | null;
  bytes: Buffer | null;
} {
  if (part.content_text !== undefined && part.content_base64 !== undefined) {
    throw new ApiError(
      400,
      "TELEMETRY_CONTENT_AMBIGUOUS",
      "A trace artifact may contain text or binary content, not both.",
    );
  }
  if (part.content_text !== undefined) {
    const bytes = Buffer.from(part.content_text, "utf8");
    return { binary: null, text: part.content_text, bytes };
  }
  if (part.content_base64 !== undefined) {
    const binary = Buffer.from(part.content_base64, "base64");
    if (binary.toString("base64").replace(/=+$/, "") !== part.content_base64.replace(/=+$/, "")) {
      throw new ApiError(
        400,
        "TELEMETRY_CONTENT_ENCODING_INVALID",
        "The trace artifact is not valid canonical base64.",
      );
    }
    return { binary, text: null, bytes: binary };
  }
  return { binary: null, text: null, bytes: null };
}

function captureStatus(
  parts: CreateTelemetryTraceRequest["content_parts"],
): "none" | "reference_only" | "full" | "mixed" | "redacted" {
  if (parts.length === 0) return "none";
  const statuses = new Set(parts.map((part) => part.capture_status));
  if (statuses.size > 1) return "mixed";
  const status = parts[0]?.capture_status;
  if (status === "reference_only") return "reference_only";
  if (status === "redacted") return "redacted";
  return "full";
}

export function agentTelemetrySpanId(
  traceID: string,
  runID: string,
  key: string,
): string {
  return createHash("sha256")
    .update(`${traceID}:${runID}:${key}`)
    .digest("hex")
    .slice(0, 16);
}

export function telemetrySpanId(traceID: string, key: string): string {
  return createHash("sha256")
    .update(`${traceID}:${key}`)
    .digest("hex")
    .slice(0, 16);
}

function telemetryEvaluationID(traceID: string, evaluatorName: string): string {
  const value = createHash("sha256")
    .update(`${traceID}:evaluation:${evaluatorName}`)
    .digest("hex")
    .slice(0, 32);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-a${value.slice(17, 20)}-${value.slice(20)}`;
}

export async function appendTelemetrySpan(
  client: DatabaseClient,
  auth: AuthContext,
  context: TelemetryContext,
  input: {
    key: string;
    parentSpanID?: string;
    name: string;
    kind: "internal" | "client" | "server" | "producer" | "consumer";
    status: "unset" | "ok" | "error";
    startedAt: string;
    endedAt: string | null;
    attributes: Record<string, string | number | boolean | null>;
    artifactRefs?: string[];
  },
): Promise<string> {
  const spanID = telemetrySpanId(context.trace_id, input.key);
  await client.query(
    `INSERT INTO telemetry_spans(
       account_id, trace_id, span_id, parent_span_id, name, kind, status,
       safe_attributes, artifact_refs, started_at, ended_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8::jsonb, $9::uuid[], $10, $11
     )
     ON CONFLICT (account_id, trace_id, span_id) DO UPDATE
     SET status = EXCLUDED.status,
         safe_attributes = telemetry_spans.safe_attributes || EXCLUDED.safe_attributes,
         ended_at = COALESCE(EXCLUDED.ended_at, telemetry_spans.ended_at)`,
    [
      auth.accountId,
      context.trace_id,
      spanID,
      input.parentSpanID ?? context.parent_span_id,
      input.name,
      input.kind,
      input.status,
      JSON.stringify(input.attributes),
      input.artifactRefs ?? [],
      input.startedAt,
      input.endedAt,
    ],
  );
  return spanID;
}

export async function createTelemetryTrace(
  pool: Pool,
  auth: AuthContext,
  request: CreateTelemetryTraceRequest,
): Promise<TelemetryMutationResponse> {
  const decoded = request.content_parts.map((part) => ({
    part,
    content: decodeContent(part),
  }));
  const totalBytes = decoded.reduce(
    (total, item) => total + (item.content.bytes?.byteLength ?? 0),
    0,
  );
  if (totalBytes > MAX_TOTAL_CONTENT_BYTES) {
    throw new ApiError(
      413,
      "TELEMETRY_CONTENT_TOO_LARGE",
      "The governed trace artifacts exceed the per-interaction limit.",
    );
  }
  for (const { part, content } of decoded) {
    if (content.bytes) {
      if (content.bytes.byteLength !== part.byte_size) {
        throw new ApiError(
          400,
          "TELEMETRY_CONTENT_SIZE_MISMATCH",
          "The trace artifact byte size does not match its manifest.",
        );
      }
      if (sha256Bytes(content.bytes) !== part.content_hash) {
        throw new ApiError(
          400,
          "TELEMETRY_CONTENT_HASH_MISMATCH",
          "The trace artifact hash does not match its manifest.",
        );
      }
    } else if (
      part.capture_status === "governed_full" ||
      part.capture_status === "minimized_derivative"
    ) {
      if (!part.governed_source_ref) {
        throw new ApiError(
          400,
          "TELEMETRY_CONTENT_MISSING",
          "A fully captured artifact requires content or a governed source reference.",
        );
      }
    }
  }

  return inTransaction(pool, async (client) => {
    const existing = await client.query<{ interaction_id: string; status: string }>(
      `SELECT interaction_id, status
       FROM telemetry_traces
       WHERE account_id = $1 AND trace_id = $2`,
      [auth.accountId, request.trace_id],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].interaction_id !== request.interaction_id) {
        throw new ApiError(
          409,
          "TELEMETRY_TRACE_CONFLICT",
          "The trace ID already belongs to another interaction.",
        );
      }
      const artifacts = await client.query<{ id: string }>(
        `SELECT id FROM telemetry_artifacts
         WHERE account_id = $1 AND trace_id = $2
         ORDER BY ordinal`,
        [auth.accountId, request.trace_id],
      );
      return {
        contract_version: CONTRACT_VERSION,
        trace_id: request.trace_id,
        interaction_id: request.interaction_id,
        accepted_spans: 0,
        accepted_events: 0,
        artifact_ids: artifacts.rows.map((row) => row.id),
        status: existing.rows[0].status,
      };
    }

    await client.query(
      `INSERT INTO telemetry_traces(
         account_id, trace_id, root_span_id, interaction_id, user_id,
         session_hash, name, surface, route, environment,
         data_classification, content_capture_status, status,
         safe_attributes, started_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10,
         $11, $12, 'running', $13::jsonb, $14
       )`,
      [
        auth.accountId,
        request.trace_id,
        request.root_span_id,
        request.interaction_id,
        auth.userId,
        sha256(`${auth.accountId}:${request.browser_session_id}`),
        request.name,
        request.surface,
        request.route,
        process.env.NODE_ENV ?? "development",
        request.data_classification,
        captureStatus(request.content_parts),
        JSON.stringify(request.attributes),
        request.started_at,
      ],
    );
    await client.query(
      `INSERT INTO telemetry_spans(
         account_id, trace_id, span_id, parent_span_id, name, kind, status,
         safe_attributes, artifact_refs, started_at
       ) VALUES ($1, $2, $3, NULL, $4, 'server', 'unset', $5::jsonb, '{}', $6)`,
      [
        auth.accountId,
        request.trace_id,
        request.root_span_id,
        request.name,
        JSON.stringify({
          "ts.interaction.id": request.interaction_id,
          "ts.surface": request.surface,
          "ts.route": request.route,
          "ts.data.classification": request.data_classification,
          ...request.attributes,
        }),
        request.started_at,
      ],
    );

    const artifactIDs: string[] = [];
    for (const { part, content } of decoded) {
      const artifactID = part.id;
      artifactIDs.push(artifactID);
      await client.query(
        `INSERT INTO telemetry_artifacts(
           id, account_id, trace_id, interaction_id, ordinal, kind,
           mime_type, byte_size, content_hash, capture_status, purpose,
           authorization_scope, text_content, binary_content,
           governed_source_ref, retention_expires_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10, $11,
           $12, $13, $14, $15,
           $16::timestamptz + make_interval(days => $17)
         )`,
        [
          artifactID,
          auth.accountId,
          request.trace_id,
          request.interaction_id,
          part.ordinal,
          part.kind,
          part.mime_type,
          part.byte_size,
          part.content_hash,
          part.capture_status,
          part.purpose,
          part.authorization_scope,
          content.text,
          content.binary,
          part.governed_source_ref ?? null,
          request.started_at,
          part.retention_days,
        ],
      );
    }

    return {
      contract_version: CONTRACT_VERSION,
      trace_id: request.trace_id,
      interaction_id: request.interaction_id,
      accepted_spans: 1,
      accepted_events: 0,
      artifact_ids: artifactIDs,
      status: "running",
    };
  });
}

async function assertArtifactRefs(
  client: DatabaseClient,
  accountID: string,
  traceID: string,
  artifactRefs: string[],
): Promise<void> {
  if (artifactRefs.length === 0) return;
  const result = await client.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM telemetry_artifacts
     WHERE account_id = $1 AND trace_id = $2 AND id = ANY($3::uuid[])`,
    [accountID, traceID, artifactRefs],
  );
  if (result.rows[0]?.count !== artifactRefs.length) {
    throw new ApiError(
      400,
      "TELEMETRY_ARTIFACT_OUT_OF_SCOPE",
      "A span or event referenced an artifact outside this trace.",
    );
  }
}

export async function appendTelemetryBatch(
  pool: Pool,
  auth: AuthContext,
  traceID: string,
  request: AppendTelemetryBatchRequest,
): Promise<TelemetryMutationResponse> {
  return inTransaction(pool, async (client) => {
    const trace = await client.query<{ interaction_id: string; status: string }>(
      `SELECT interaction_id, status FROM telemetry_traces
       WHERE account_id = $1 AND trace_id = $2 FOR UPDATE`,
      [auth.accountId, traceID],
    );
    const current = trace.rows[0];
    if (!current) {
      throw new ApiError(404, "TELEMETRY_TRACE_NOT_FOUND", "The trace was not found.");
    }
    for (const item of [...request.spans, ...request.events]) {
      await assertArtifactRefs(client, auth.accountId, traceID, item.artifact_refs);
    }
    let acceptedSpans = 0;
    for (const span of request.spans) {
      const inserted = await client.query(
        `INSERT INTO telemetry_spans(
           account_id, trace_id, span_id, parent_span_id, name, kind, status,
           safe_attributes, artifact_refs, agent_run_id, agent_event_sequence,
           started_at, ended_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8::jsonb, $9::uuid[], $10, $11, $12, $13
         )
         ON CONFLICT (account_id, trace_id, span_id) DO NOTHING`,
        [
          auth.accountId,
          traceID,
          span.span_id,
          span.parent_span_id,
          span.name,
          span.kind,
          span.status,
          JSON.stringify(span.attributes),
          span.artifact_refs,
          span.agent_run_id,
          span.agent_event_sequence,
          span.started_at,
          span.ended_at,
        ],
      );
      acceptedSpans += inserted.rowCount ?? 0;
    }
    let acceptedEvents = 0;
    for (const event of request.events) {
      const inserted = await client.query(
        `INSERT INTO telemetry_events(
           id, account_id, trace_id, span_id, name, safe_attributes,
           artifact_refs, occurred_at
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::uuid[], $8)
         ON CONFLICT (account_id, trace_id, id) DO NOTHING`,
        [
          event.event_id,
          auth.accountId,
          traceID,
          event.span_id,
          event.name,
          JSON.stringify(event.attributes),
          event.artifact_refs,
          event.occurred_at,
        ],
      );
      acceptedEvents += inserted.rowCount ?? 0;
    }
    return {
      contract_version: CONTRACT_VERSION,
      trace_id: traceID,
      interaction_id: current.interaction_id,
      accepted_spans: acceptedSpans,
      accepted_events: acceptedEvents,
      artifact_ids: [],
      status: current.status,
    };
  });
}

export async function completeTelemetryTrace(
  pool: Pool,
  auth: AuthContext,
  traceID: string,
  request: CompleteTelemetryTraceRequest,
): Promise<TelemetryMutationResponse> {
  return inTransaction(pool, async (client) => {
    const updated = await client.query<{
      interaction_id: string;
      safe_attributes: Record<string, string | number | boolean | null>;
    }>(
      `UPDATE telemetry_traces
       SET status = $3,
           error_code = $4,
           safe_attributes = safe_attributes || $5::jsonb,
           ended_at = $6,
           updated_at = now()
       WHERE account_id = $1 AND trace_id = $2
       RETURNING interaction_id, safe_attributes`,
      [
        auth.accountId,
        traceID,
        request.status,
        request.error_code,
        JSON.stringify(request.attributes),
        request.ended_at,
      ],
    );
    const trace = updated.rows[0];
    if (!trace) {
      throw new ApiError(404, "TELEMETRY_TRACE_NOT_FOUND", "The trace was not found.");
    }
    await client.query(
      `UPDATE telemetry_spans spans
       SET status = CASE WHEN $3 = 'ok' THEN 'ok' ELSE 'error' END,
           ended_at = $4,
           safe_attributes = spans.safe_attributes || $5::jsonb
       FROM telemetry_traces traces
       WHERE spans.account_id = $1
         AND spans.trace_id = $2
         AND traces.account_id = spans.account_id
         AND traces.trace_id = spans.trace_id
         AND spans.span_id = traces.root_span_id`,
      [
        auth.accountId,
        traceID,
        request.status,
        request.ended_at,
        JSON.stringify({
          ...(request.error_code ? { "error.code": request.error_code } : {}),
        }),
      ],
    );
    const receipt = await client.query<{
      artifact_ids: string[];
      image_artifact_count: number;
      incomplete_span_count: number;
      span_count: number;
    }>(
      `SELECT
         COALESCE(
           ARRAY_AGG(DISTINCT artifacts.id) FILTER (WHERE artifacts.id IS NOT NULL),
           '{}'
         ) AS artifact_ids,
         COUNT(DISTINCT artifacts.id) FILTER (
           WHERE artifacts.kind = 'image'
         )::int AS image_artifact_count,
         COUNT(DISTINCT spans.span_id) FILTER (WHERE spans.ended_at IS NULL)::int
           AS incomplete_span_count,
         COUNT(DISTINCT spans.span_id)::int AS span_count
       FROM telemetry_traces traces
       LEFT JOIN telemetry_artifacts artifacts
         ON artifacts.account_id = traces.account_id
        AND artifacts.trace_id = traces.trace_id
       LEFT JOIN telemetry_spans spans
         ON spans.account_id = traces.account_id
        AND spans.trace_id = traces.trace_id
       WHERE traces.account_id = $1 AND traces.trace_id = $2
       GROUP BY traces.account_id, traces.trace_id`,
      [auth.accountId, traceID],
    );
    const evidenceRefs = receipt.rows[0]?.artifact_ids ?? [];
    const imageArtifactCount = receipt.rows[0]?.image_artifact_count ?? 0;
    const incompleteSpanCount = receipt.rows[0]?.incomplete_span_count ?? 0;
    const spanCount = receipt.rows[0]?.span_count ?? 0;
    const agentReceipt = await client.query<AgentTraceReceiptRow>(
      `SELECT
         COUNT(DISTINCT runs.id)::int AS run_count,
         COUNT(DISTINCT runs.id) FILTER (
           WHERE runs.status NOT IN ('starting', 'running')
             AND runs.terminal_receipt IS NOT NULL
         )::int AS completed_run_count,
         COUNT(DISTINCT (events.run_id, events.sequence)) FILTER (
           WHERE events.event_kind = 'terminal'
         )::int AS terminal_event_count,
         COUNT(DISTINCT calls.id)::int AS tool_call_count,
         COALESCE(SUM(DISTINCT jsonb_array_length(runs.external_effects)), 0)::int
           AS external_effect_count,
         COALESCE(SUM(DISTINCT jsonb_array_length(
           COALESCE(runs.context_manifest->'input_artifacts', '[]'::jsonb)
         )), 0)::int AS input_artifact_count
       FROM agent_runs runs
       LEFT JOIN agent_run_events events
         ON events.account_id = runs.account_id AND events.run_id = runs.id
       LEFT JOIN agent_tool_calls calls
         ON calls.account_id = runs.account_id AND calls.run_id = runs.id
       WHERE runs.account_id = $1 AND runs.telemetry_trace_id = $2`,
      [auth.accountId, traceID],
    );
    const agent = agentReceipt.rows[0];
    const evaluations: Array<{
      name: string;
      verdict: "pass" | "fail" | "abstain" | "needs_review";
      score: number | null;
      explanation: string;
      evidenceRefs: string[];
    }> = [
      {
        name: "trace_terminal_status",
        verdict: request.status === "ok" ? "pass" : "fail",
        score: request.status === "ok" ? 1 : 0,
        explanation:
          request.status === "ok"
            ? "The interaction reached an explicit successful terminal state."
            : `The interaction terminated with status ${request.status}.`,
        evidenceRefs: [] as string[],
      },
      {
        name: "content_lineage_present",
        verdict: evidenceRefs.length > 0 ? "pass" : "needs_review",
        score: evidenceRefs.length > 0 ? 1 : null,
        explanation:
          evidenceRefs.length > 0
            ? "At least one governed or reference-only artifact anchors the interaction."
            : "No content artifact anchors this trace; confirm that metadata-only capture is intended.",
        evidenceRefs,
      },
      {
        name: "execution_receipt_complete",
        verdict: spanCount > 0 && incompleteSpanCount === 0 ? "pass" : "needs_review",
        score: spanCount > 0 && incompleteSpanCount === 0 ? 1 : null,
        explanation:
          spanCount > 0 && incompleteSpanCount === 0
            ? "Every recorded execution span has an explicit end time."
            : `${incompleteSpanCount} of ${spanCount} recorded spans remain open.`,
        evidenceRefs: [] as string[],
      },
    ];
    if ((agent?.run_count ?? 0) > 0) {
      const expectedTerminal =
        typeof trace.safe_attributes["ts.eval.expected_terminal"] === "string"
          ? trace.safe_attributes["ts.eval.expected_terminal"]
          : undefined;
      const expectedToolSequence =
        typeof trace.safe_attributes["ts.eval.expected_tool_sequence"] === "string"
          ? trace.safe_attributes["ts.eval.expected_tool_sequence"]
          : undefined;
      const expectedSemanticReason =
        typeof trace.safe_attributes["ts.eval.expected_semantic_reason"] === "string"
          ? trace.safe_attributes["ts.eval.expected_semantic_reason"]
          : undefined;
      const inputRole =
        trace.safe_attributes["ts.eval.input_role"] === "trace_only"
          ? "trace_only" as const
          : "decision_evidence" as const;
      const imageUnderstanding =
        trace.safe_attributes["ts.input.image_understanding"] === true;
      const isEvalCase =
        typeof trace.safe_attributes["ts.eval.case_version"] === "string";
      const observed = await client.query<{
        status: string;
        tool_names: string[];
        semantic_reason: string | null;
      }>(
        `SELECT runs.status,
           no_actions.reason_code AS semantic_reason,
           ARRAY(
             SELECT calls.tool_name
             FROM agent_tool_calls calls
             WHERE calls.account_id = runs.account_id
               AND calls.run_id = runs.id
             ORDER BY calls.sequence
           ) AS tool_names
         FROM agent_runs runs
         LEFT JOIN agent_no_actions no_actions
           ON no_actions.account_id = runs.account_id
          AND no_actions.run_id = runs.id
         WHERE runs.account_id = $1 AND runs.telemetry_trace_id = $2
         ORDER BY runs.created_at DESC
         LIMIT 1`,
        [auth.accountId, traceID],
      );
      evaluations.push(
        ...evaluateExpectedAgentOutcome({
          ...(expectedTerminal ? { expectedTerminal } : {}),
          ...(expectedToolSequence ? { expectedToolSequence } : {}),
          observedTerminal: observed.rows[0]?.status ?? null,
          observedToolSequence: observed.rows[0]?.tool_names ?? [],
          evidenceRefs,
        }),
      );
      const terminalComplete =
        agent?.completed_run_count === agent?.run_count &&
        agent?.terminal_event_count === agent?.run_count;
      evaluations.push(
        {
          name: "agent_terminal_receipt_present",
          verdict: terminalComplete ? "pass" : "fail",
          score: terminalComplete ? 1 : 0,
          explanation: terminalComplete
            ? "Every linked Agent run has one durable terminal event and terminal receipt."
            : "At least one linked Agent run is missing a durable terminal event or receipt.",
          evidenceRefs: [],
        },
        {
          name: "tool_sequence_auditable",
          verdict: (agent?.tool_call_count ?? 0) > 0 ? "pass" : "needs_review",
          score: (agent?.tool_call_count ?? 0) > 0 ? 1 : null,
          explanation:
            (agent?.tool_call_count ?? 0) > 0
              ? `${agent?.tool_call_count ?? 0} governed tool calls are linked by run and sequence.`
              : "No governed tool call receipt is linked to this Agent run.",
          evidenceRefs: [],
        },
        {
          name: "external_effect_boundary",
          verdict: (agent?.external_effect_count ?? 0) === 0 ? "pass" : "fail",
          score: (agent?.external_effect_count ?? 0) === 0 ? 1 : 0,
          explanation:
            (agent?.external_effect_count ?? 0) === 0
              ? "The Agent terminal receipts report zero external effects."
              : "A linked Agent receipt reports an external effect and requires investigation.",
          evidenceRefs: [],
        },
        {
          name: "agent_input_lineage_present",
          verdict:
            (agent?.input_artifact_count ?? 0) > 0 ? "pass" : "needs_review",
          score: (agent?.input_artifact_count ?? 0) > 0 ? 1 : null,
          explanation:
            (agent?.input_artifact_count ?? 0) > 0
              ? `${agent?.input_artifact_count ?? 0} governed input artifacts are frozen in the Agent context manifest.`
              : "This Agent run has no governed Eval input artifact manifest.",
          evidenceRefs,
        },
      );
      if (isEvalCase) {
        evaluations.push(
          ...evaluateAgentEvalCase({
            ...(expectedTerminal ? { expectedTerminal } : {}),
            ...(expectedSemanticReason ? { expectedSemanticReason } : {}),
            ...(expectedToolSequence ? { expectedToolSequence } : {}),
            observedTerminal: observed.rows[0]?.status ?? null,
            observedSemanticReason: observed.rows[0]?.semantic_reason ?? null,
            observedToolSequence: observed.rows[0]?.tool_names ?? [],
            inputRole,
            imageCount: imageArtifactCount,
            imageUnderstanding,
            inputArtifactCount: agent?.input_artifact_count ?? 0,
            traceArtifactCount: evidenceRefs.length,
            externalEffectCount: agent?.external_effect_count ?? 0,
            evidenceRefs,
          }),
        );
      } else {
        evaluations.push({
          name: "semantic_outcome_quality",
          verdict: "needs_review",
          score: null,
          explanation:
            "This run has no versioned Eval Case with a frozen semantic expectation.",
          evidenceRefs,
        });
      }
    }
    for (const evaluation of evaluations) {
      await client.query(
        `INSERT INTO eval_annotations(
           id, account_id, trace_id, span_id, evaluator_type,
           evaluator_name, evaluator_version, verdict, score,
           explanation, evidence_refs
         ) VALUES (
           $1, $2, $3, NULL, 'deterministic',
           $4, '1', $5, $6, $7, $8::uuid[]
         )
         ON CONFLICT (account_id, trace_id, id) DO NOTHING`,
        [
          telemetryEvaluationID(traceID, evaluation.name),
          auth.accountId,
          traceID,
          evaluation.name,
          evaluation.verdict,
          evaluation.score,
          evaluation.explanation,
          evaluation.evidenceRefs,
        ],
      );
    }
    return {
      contract_version: CONTRACT_VERSION,
      trace_id: traceID,
      interaction_id: trace.interaction_id,
      accepted_spans: 0,
      accepted_events: 0,
      artifact_ids: [],
      status: request.status,
    };
  });
}

const TRACE_SUMMARY_SQL = `
  SELECT
    traces.trace_id,
    traces.interaction_id,
    traces.name,
    traces.surface,
    traces.route,
    traces.status,
    traces.data_classification,
    traces.content_capture_status,
    COUNT(DISTINCT spans.span_id)::int AS span_count,
    COUNT(DISTINCT events.id)::int AS event_count,
    COUNT(DISTINCT artifacts.id)::int AS artifact_count,
    COUNT(DISTINCT spans.span_id) FILTER (WHERE spans.status = 'error')::int AS error_count,
    traces.started_at,
    traces.ended_at,
    CASE WHEN traces.ended_at IS NULL THEN NULL
      ELSE EXTRACT(EPOCH FROM (traces.ended_at - traces.started_at)) * 1000
    END AS duration_ms,
    traces.safe_attributes->>'ts.eval.scenario' AS eval_scenario,
    COALESCE(
      traces.safe_attributes->>'ts.agent.provider',
      traces.safe_attributes->>'gen_ai.provider.name'
    ) AS eval_provider,
    CASE
      WHEN traces.safe_attributes->>'ts.eval.case_version' IS NULL THEN NULL
      WHEN traces.safe_attributes->>'ts.eval.modality' IN ('text', 'image', 'multimodal')
        THEN traces.safe_attributes->>'ts.eval.modality'
      ELSE 'text'
    END AS eval_modality,
    CASE
      WHEN traces.safe_attributes->>'ts.eval.case_version' IS NULL THEN NULL
      WHEN COUNT(DISTINCT annotations.id) FILTER (
        WHERE annotations.evaluator_name IN (
          'case_input_capability',
          'case_terminal_semantic',
          'case_tool_policy',
          'case_evidence_lineage',
          'case_external_effect_boundary'
        ) AND annotations.verdict = 'fail'
      ) > 0 THEN 'fail'
      WHEN COUNT(DISTINCT annotations.id) FILTER (
        WHERE annotations.evaluator_name IN (
          'case_input_capability',
          'case_terminal_semantic',
          'case_tool_policy',
          'case_evidence_lineage',
          'case_external_effect_boundary'
        )
      ) < 5 OR COUNT(DISTINCT annotations.id) FILTER (
        WHERE annotations.evaluator_name IN (
          'case_input_capability',
          'case_terminal_semantic',
          'case_tool_policy',
          'case_evidence_lineage',
          'case_external_effect_boundary'
        ) AND annotations.verdict IN ('needs_review', 'abstain')
      ) > 0 THEN 'needs_review'
      ELSE 'pass'
    END AS eval_verdict,
    CASE
      WHEN traces.safe_attributes->>'ts.eval.case_version' IS NULL THEN NULL
      ELSE COUNT(DISTINCT annotations.id) FILTER (
        WHERE annotations.evaluator_name IN (
          'case_input_capability',
          'case_terminal_semantic',
          'case_tool_policy',
          'case_evidence_lineage',
          'case_external_effect_boundary'
        ) AND annotations.verdict = 'pass'
      )::int * 20
    END AS eval_earned_points,
    traces.created_at
  FROM telemetry_traces traces
  LEFT JOIN telemetry_spans spans
    ON spans.account_id = traces.account_id AND spans.trace_id = traces.trace_id
  LEFT JOIN telemetry_events events
    ON events.account_id = traces.account_id AND events.trace_id = traces.trace_id
  LEFT JOIN telemetry_artifacts artifacts
    ON artifacts.account_id = traces.account_id AND artifacts.trace_id = traces.trace_id
  LEFT JOIN eval_annotations annotations
    ON annotations.account_id = traces.account_id
   AND annotations.trace_id = traces.trace_id
   AND annotations.superseded_at IS NULL`;

export async function listTelemetryTraces(
  pool: Pool,
  auth: AuthContext,
  limit = 100,
): Promise<TelemetryTraceListResponse> {
  const result = await pool.query<TraceSummaryRow>(
    `${TRACE_SUMMARY_SQL}
     WHERE traces.account_id = $1
     GROUP BY traces.account_id, traces.trace_id
     ORDER BY traces.started_at DESC, traces.trace_id
     LIMIT $2`,
    [auth.accountId, Math.min(Math.max(limit, 1), 100)],
  );
  return {
    contract_version: CONTRACT_VERSION,
    traces: result.rows.map(summary),
  };
}

export async function getTelemetryTrace(
  pool: Pool,
  auth: AuthContext,
  traceID: string,
): Promise<TelemetryTraceDetailResponse> {
  const traceResult = await pool.query<TraceDetailRow>(
    `SELECT summary.*, traces.root_span_id, traces.safe_attributes
     FROM (
       ${TRACE_SUMMARY_SQL}
       WHERE traces.account_id = $1 AND traces.trace_id = $2
       GROUP BY traces.account_id, traces.trace_id
     ) summary
     JOIN telemetry_traces traces
       ON traces.account_id = $1 AND traces.trace_id = summary.trace_id`,
    [auth.accountId, traceID],
  );
  const trace = traceResult.rows[0];
  if (!trace) {
    throw new ApiError(404, "TELEMETRY_TRACE_NOT_FOUND", "The trace was not found.");
  }
  const [spanResult, eventResult, artifactResult, evaluationResult] = await Promise.all([
    pool.query<SpanRow>(
      `SELECT span_id, parent_span_id, name, kind, status, started_at, ended_at,
              CASE WHEN ended_at IS NULL THEN NULL
                ELSE EXTRACT(EPOCH FROM (ended_at - started_at)) * 1000
              END AS duration_ms,
              safe_attributes, artifact_refs, agent_run_id, agent_event_sequence
       FROM telemetry_spans
       WHERE account_id = $1 AND trace_id = $2
       ORDER BY started_at, span_id`,
      [auth.accountId, traceID],
    ),
    pool.query<EventRow>(
      `SELECT id, span_id, name, occurred_at, safe_attributes, artifact_refs
       FROM telemetry_events
       WHERE account_id = $1 AND trace_id = $2
       ORDER BY occurred_at, id`,
      [auth.accountId, traceID],
    ),
    pool.query<ArtifactRow>(
      `SELECT id, ordinal, kind, mime_type, byte_size, content_hash,
              capture_status, purpose, authorization_scope,
              governed_source_ref, retention_expires_at, deletion_state,
              CASE WHEN deletion_state = 'active' AND retention_expires_at > now()
                THEN LEFT(text_content, 4000) ELSE NULL END AS text_content,
              created_at
       FROM telemetry_artifacts
       WHERE account_id = $1 AND trace_id = $2
       ORDER BY ordinal`,
      [auth.accountId, traceID],
    ),
    pool.query<EvaluationRow>(
      `SELECT id, span_id, evaluator_type, evaluator_name, evaluator_version,
              verdict, score, explanation, evidence_refs, created_at
       FROM eval_annotations
       WHERE account_id = $1 AND trace_id = $2 AND superseded_at IS NULL
       ORDER BY created_at, id`,
      [auth.accountId, traceID],
    ),
  ]);
  return {
    contract_version: CONTRACT_VERSION,
    trace: {
      ...summary(trace),
      root_span_id: trace.root_span_id,
      attributes: trace.safe_attributes,
      spans: spanResult.rows.map((span) => ({
        span_id: span.span_id,
        parent_span_id: span.parent_span_id,
        name: span.name,
        kind: span.kind,
        status: span.status,
        started_at: iso(span.started_at),
        ended_at: optionalIso(span.ended_at),
        duration_ms: span.duration_ms === null ? null : Number(span.duration_ms),
        attributes: span.safe_attributes,
        artifact_refs: span.artifact_refs,
        agent_run_id: span.agent_run_id,
        agent_event_sequence: span.agent_event_sequence,
      })),
      events: eventResult.rows.map((event) => ({
        event_id: event.id,
        span_id: event.span_id,
        name: event.name,
        occurred_at: iso(event.occurred_at),
        attributes: event.safe_attributes,
        artifact_refs: event.artifact_refs,
      })),
      artifacts: artifactResult.rows.map((artifact) => ({
        id: artifact.id,
        ordinal: artifact.ordinal,
        kind: artifact.kind,
        mime_type: artifact.mime_type,
        byte_size: artifact.byte_size,
        content_hash: artifact.content_hash,
        capture_status: artifact.capture_status,
        purpose: artifact.purpose,
        authorization_scope: artifact.authorization_scope,
        governed_source_ref: artifact.governed_source_ref,
        retention_expires_at: iso(artifact.retention_expires_at),
        deletion_state: artifact.deletion_state,
        preview_text: artifact.text_content,
        created_at: iso(artifact.created_at),
      })),
      evaluations: evaluationResult.rows.map((evaluation) => ({
        id: evaluation.id,
        span_id: evaluation.span_id,
        evaluator_type: evaluation.evaluator_type,
        evaluator_name: evaluation.evaluator_name,
        evaluator_version: evaluation.evaluator_version,
        verdict: evaluation.verdict,
        score: evaluation.score === null ? null : Number(evaluation.score),
        explanation: evaluation.explanation,
        evidence_refs: evaluation.evidence_refs,
        created_at: iso(evaluation.created_at),
      })),
    },
  };
}

export async function getTelemetryArtifactContent(
  pool: Pool,
  auth: AuthContext,
  artifactID: string,
): Promise<{ body: Buffer; contentType: string; kind: string }> {
  const result = await pool.query<{
    binary_content: Buffer | null;
    text_content: string | null;
    mime_type: string;
    kind: string;
  }>(
    `SELECT binary_content, text_content, mime_type, kind
     FROM telemetry_artifacts
     WHERE account_id = $1 AND id = $2
       AND deletion_state = 'active'
       AND retention_expires_at > now()`,
    [auth.accountId, artifactID],
  );
  const artifact = result.rows[0];
  if (!artifact) {
    throw new ApiError(
      404,
      "TELEMETRY_ARTIFACT_NOT_FOUND",
      "The governed trace artifact is unavailable.",
    );
  }
  const body = artifact.binary_content ??
    (artifact.text_content === null ? null : Buffer.from(artifact.text_content, "utf8"));
  if (!body) {
    throw new ApiError(
      409,
      "TELEMETRY_ARTIFACT_REFERENCE_ONLY",
      "This trace records lineage only; no artifact body was retained.",
    );
  }
  return { body, contentType: artifact.mime_type, kind: artifact.kind };
}

export async function assertTelemetryContext(
  client: DatabaseClient,
  auth: AuthContext,
  context: TelemetryContext,
): Promise<void> {
  const result = await client.query<{ root_span_id: string; interaction_id: string }>(
    `SELECT root_span_id, interaction_id
     FROM telemetry_traces
     WHERE account_id = $1 AND trace_id = $2`,
    [auth.accountId, context.trace_id],
  );
  const trace = result.rows[0];
  if (!trace || trace.interaction_id !== context.interaction_id) {
    throw new ApiError(
      409,
      "TELEMETRY_CONTEXT_INVALID",
      "The Agent telemetry context does not belong to this account interaction.",
    );
  }
}

export async function appendAgentTelemetrySpan(
  client: PoolClient,
  auth: AuthContext,
  context: TelemetryContext,
  input: {
    runID: string;
    key: string;
    parentKey?: string;
    name: string;
    status: "unset" | "ok" | "error";
    startedAt: string;
    endedAt: string | null;
    sequence: number | null;
    attributes: Record<string, string | number | boolean | null>;
    artifactRefs?: string[];
  },
): Promise<void> {
  const spanID = agentTelemetrySpanId(context.trace_id, input.runID, input.key);
  const parentSpanID = input.parentKey
    ? agentTelemetrySpanId(context.trace_id, input.runID, input.parentKey)
    : context.parent_span_id;
  await client.query(
    `INSERT INTO telemetry_spans(
       account_id, trace_id, span_id, parent_span_id, name, kind, status,
       safe_attributes, artifact_refs, agent_run_id, agent_event_sequence,
       started_at, ended_at
     ) VALUES (
       $1, $2, $3, $4, $5, 'internal', $6,
       $7::jsonb, $8::uuid[], $9, $10, $11, $12
     )
     ON CONFLICT (account_id, trace_id, span_id) DO UPDATE
     SET status = EXCLUDED.status,
         safe_attributes = telemetry_spans.safe_attributes || EXCLUDED.safe_attributes,
         ended_at = COALESCE(EXCLUDED.ended_at, telemetry_spans.ended_at)`,
    [
      auth.accountId,
      context.trace_id,
      spanID,
      parentSpanID,
      input.name,
      input.status,
      JSON.stringify(input.attributes),
      input.artifactRefs ?? [],
      input.runID,
      input.sequence,
      input.startedAt,
      input.endedAt,
    ],
  );
}
