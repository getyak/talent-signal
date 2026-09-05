import { describe, expect, it } from "vitest";

import {
  initialAgentTaskStreamState,
  parseAgentTaskStreamCursor,
  reduceAgentTaskStream,
  semanticTextChunks,
  sseFrame,
} from "./agentTaskStream";

describe("Agent Task semantic stream", () => {
  it("deduplicates replayed durable events", () => {
    const event = {
      event_id: "11111111-1111-4111-8111-111111111111",
      workspace_id: "22222222-2222-4222-8222-222222222222",
      task_id: "33333333-3333-4333-8333-333333333333",
      run_id: null,
      task_sequence: 2,
      stream_cursor: "8",
      name: "context.compiled" as const,
      occurred_at: "2026-09-06T00:00:00.000Z",
      schema_version: 1 as const,
      public_payload: {},
    };
    const first = reduceAgentTaskStream(initialAgentTaskStreamState(null), {
      event,
      type: "task_event",
    });
    const replay = reduceAgentTaskStream(first, {
      event,
      type: "task_event",
    });
    expect(replay.steps).toHaveLength(1);
    expect(replay.latestSequence).toBe(2);
  });

  it("forms and commits stable semantic blocks", () => {
    const block = {
      citationIds: ["44444444-4444-4444-8444-444444444444"],
      id: "artifact:dependency",
      kind: "dependency" as const,
      title: "当前依赖",
    };
    let state = initialAgentTaskStreamState(null);
    state = reduceAgentTaskStream(state, {
      block,
      operation: "start",
      type: "content_block",
    });
    state = reduceAgentTaskStream(state, {
      block,
      delta: "等待客户确认",
      operation: "delta",
      type: "content_block",
    });
    state = reduceAgentTaskStream(state, {
      block,
      operation: "commit",
      type: "content_block",
    });
    expect(state.blocks).toEqual([
      expect.objectContaining({
        id: "artifact:dependency",
        status: "committed",
        text: "等待客户确认",
      }),
    ]);

    state = reduceAgentTaskStream(state, {
      block,
      operation: "start",
      type: "content_block",
    });
    state = reduceAgentTaskStream(state, {
      block,
      delta: "等待客户确认",
      operation: "delta",
      type: "content_block",
    });
    expect(state.blocks[0]?.text).toBe("等待客户确认");
  });

  it("accepts only non-negative integer replay cursors", () => {
    expect(parseAgentTaskStreamCursor("7")).toBe(7);
    expect(parseAgentTaskStreamCursor("7.2")).toBe(0);
    expect(parseAgentTaskStreamCursor("7events")).toBe(0);
    expect(parseAgentTaskStreamCursor("-1")).toBe(0);
    expect(parseAgentTaskStreamCursor(null)).toBe(0);
  });

  it("chunks on semantic sentence boundaries", () => {
    expect(semanticTextChunks("第一句。第二句需要确认。", 5)).toEqual([
      "第一句。",
      "第二句需要确认。",
    ]);
  });

  it("encodes resumable SSE events without leaking non-JSON framing", () => {
    const encoded = sseFrame(
      "stream-open",
      { taskId: "task-id", type: "stream_open" },
      "12",
    );
    expect(encoded).toContain("id: 12\nevent: stream-open\n");
    expect(encoded).toContain('data: {"taskId":"task-id","type":"stream_open"}');
  });
});
