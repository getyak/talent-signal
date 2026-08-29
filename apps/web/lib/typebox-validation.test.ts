import { CreateTelemetryTraceRequestSchema } from "@talent-signal/contracts";
import { describe, expect, it } from "vitest";

import { matchesTypeBox } from "./typebox-validation";

const validTrace = {
  trace_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  root_span_id: "bbbbbbbbbbbbbbbb",
  interaction_id: "00000000-0000-4000-a000-000000000001",
  browser_session_id: "00000000-0000-4000-a000-000000000002",
  name: "evaluation.capture",
  surface: "web",
  route: "/workspace/evals",
  started_at: "2026-08-29T12:00:00.000Z",
  data_classification: "synthetic",
  attributes: { "ts.content.part_count": 1 },
  content_parts: [
    {
      id: "00000000-0000-4000-a000-000000000003",
      ordinal: 0,
      kind: "text",
      mime_type: "text/plain; charset=utf-8",
      byte_size: 3,
      content_hash: "c".repeat(64),
      capture_status: "governed_full",
      purpose: "evaluation",
      authorization_scope: "synthetic:test",
      retention_days: 1,
      content_text: "abc",
    },
  ],
} as const;

describe("matchesTypeBox", () => {
  it("accepts contract uuid and date-time formats at the Web boundary", () => {
    expect(matchesTypeBox(CreateTelemetryTraceRequestSchema, validTrace)).toBe(
      true,
    );
  });

  it("rejects invalid contract formats instead of treating them as unknown", () => {
    expect(
      matchesTypeBox(CreateTelemetryTraceRequestSchema, {
        ...validTrace,
        interaction_id: "not-a-uuid",
        started_at: "not-a-date",
      }),
    ).toBe(false);
  });
});
