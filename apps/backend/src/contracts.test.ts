import {
  CreateCaptureRequestSchema,
  SimulatedEffectPreviewSchema,
} from "@talent-signal/contracts";
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";

describe("shared HTTP contract", () => {
  it("requires an explicit identity state for intentional capture", () => {
    const candidate = {
      idempotency_key: "capture-1",
      source: {
        kind: "fixture",
        captured_at: "2026-08-05T00:00:00.000Z",
        source_timezone: "Asia/Singapore",
        purpose: "Synthetic evaluation",
      },
      messages: [
        {
          source_message_id: "m1",
          sequence: 0,
          speaker: "candidate",
          text: "Tuesday afternoon works.",
        },
      ],
    };
    expect(Value.Check(CreateCaptureRequestSchema, candidate)).toBe(false);
  });

  it("exposes only the labeled local deterministic effect adapter", () => {
    const preview = {
      simulated: true,
      capability: "local.simulated_attention.create",
      adapter: "local_deterministic",
      target: {
        destination_key: "fixture:queue",
        label: "Local simulated queue",
      },
      change: {
        kind: "create_attention",
        title: "Prepare one question",
      },
      expected_destination_version: 0,
      simulation_behavior: "success",
    };
    expect(Value.Check(SimulatedEffectPreviewSchema, preview)).toBe(true);
    expect(
      Value.Check(SimulatedEffectPreviewSchema, {
        ...preview,
        capability: "calendar.create",
        simulated: false,
      }),
    ).toBe(false);
  });
});
