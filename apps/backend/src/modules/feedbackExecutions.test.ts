import { describe, expect, it } from "vitest";
import { recordFeedbackExecution } from "./feedbackExecutions.js";
import type { DatabaseClient } from "../database/pool.js";
import type { AuthContext } from "./auth.js";
import type { RemoteChatAnswerResult } from "./chatAnswerProvider.js";

describe("feedback execution provider receipts", () => {
  it("keeps SDK transport counts and unreported identity unknown instead of inventing one request", async () => {
    for (const reported of [null, "claude-sonnet-5"]) {
      let snapshot: any;
      const client = { query: async (sql: string, values?: unknown[]) => {
        if (sql.includes("INSERT INTO feedback_execution_snapshots")) snapshot = JSON.parse(values![8] as string);
        return { rows: [{ expires_at: new Date(Date.now() + 60_000) }] };
      } } as unknown as DatabaseClient;
      const result: RemoteChatAnswerResult = { kind: "answer", title: "Synthetic", body: "Synthetic answer", citation_ids: [],
        provider_id: "claude-agent-sdk", model: "anthropic/claude-sonnet-5", reported_model: reported, remote_requests_started: null,
        input_tokens: 12, output_tokens: 4, provider_request_id: "synthetic-session" };
      await recordFeedbackExecution(client, { accountId: "account", userId: "user" } as AuthContext, {
        task_id: "task", session_id: "session", manifest_id: "manifest", person_id: "person", relationship_context_id: "context",
        input: { objective: "Synthetic", context_blocks: [], allowed_citation_ids: [] }, result,
        started_at: "2026-09-09T12:00:00Z", finished_at: "2026-09-09T12:00:01Z", reference_time: new Date().toISOString(), policy_version: "synthetic",
      });
      expect(snapshot.attempt).toMatchObject({ requested_model: "anthropic/claude-sonnet-5", actual_model: reported,
        remote_requests_started: null, input_tokens: 12, output_tokens: 4 });
    }
  });
});
