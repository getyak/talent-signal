import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateLiveResult } from "./live-result.mjs";

const sample = () => ({
  toolCalls: [{ name: "memory_review", input: { operation: "propose", items: [{
    display_text: "周五20:18出现加好友提示，具体日期未知", time_status: "unknown",
    source_excerpt: "Friday 20:18", source_locator: { kind: "image_region", artifact_id: "synthetic" },
  }] }, result: { isError: false, content: [{ type: "text", text: JSON.stringify({
    ok: true, data: { proposal_id: "synthetic-proposal" },
  }) }] } }],
  turn: { response: { memoryProposal: { proposal_id: "synthetic-proposal" },
    unboundConversationBlocks: [{ body: "已整理相识来源与相对时间，待你确认。" }] } },
});

test("only a successful tool receipt matching the stored turn proves a card", () => {
  assert.equal(evaluateLiveResult(sample()).passed, true);
  for (const mutate of [s => { s.toolCalls = []; },
    s => { s.toolCalls[0].result.isError = true; },
    s => { s.turn.response.memoryProposal.proposal_id = "invented"; },
    s => { s.providerError = "TOKEN_BUDGET_EXHAUSTED"; }]) {
    const report = sample(); mutate(report);
    assert.equal(evaluateLiveResult(report).passed, false);
  }
});

test("completed transport does not excuse repeated OCR, incidental payments, or an invented date", () => {
  const report = sample();
  report.turn.response.unboundConversationBlocks[0].body = "- 你好\n- 我叫林舟\n- 转账";
  report.toolCalls[0].input.items[0].display_text = "三笔转账已完成";
  report.toolCalls[0].input.items[0].valid_time = "2026-09-18T12:18:00Z";
  assert.deepEqual(evaluateLiveResult(report).failures,
    ["INCIDENTAL_FINANCIAL_MEMORY", "RELATIVE_TIME_LOST", "OCR_STYLE_RECAP"]);
});
