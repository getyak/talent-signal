import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

/** Check actual host receipts, never a model's assertion that it made a card.
 * The private runner retains the source and raw output outside the repository.
 * These mechanical checks complement human review of interpretation quality.
 */
export function evaluateLiveResult(report) {
  const failures = [];
  const response = report.turn?.response;
  if (report.providerError || !response) failures.push("RUN_INCOMPLETE");
  const staged = (report.toolCalls ?? []).filter(call => call.name === "memory_review"
    && call.input?.operation === "propose" && call.result?.isError === false);
  const receipts = staged.flatMap(call => (call.result.content ?? []).flatMap(block => {
    try { return block.type === "text" ? [JSON.parse(block.text)] : []; } catch { return []; }
  }));
  const reference = response?.memoryProposal?.proposal_id;
  if (!reference || !receipts.some(receipt => receipt.ok
    && receipt.data?.proposal_id === reference)) failures.push("NO_STORED_PROPOSAL_RECEIPT");
  const items = staged.flatMap(call => call.input.items ?? []);
  if (!items.length) failures.push("NO_REVIEW_ITEMS");
  if (items.some(item => !item.source_excerpt || item.source_locator?.kind !== "image_region")) {
    failures.push("SOURCE_LOCATOR_MISSING");
  }
  if (items.some(item => /[¥￥]|转账|transfer|payment/iu.test(item.display_text))) {
    failures.push("INCIDENTAL_FINANCIAL_MEMORY");
  }
  if (!items.some(item => /(?:Friday|星期五|周五)\s*20[:：]18/iu.test(item.display_text)
    && item.time_status === "unknown" && !item.valid_time)) failures.push("RELATIVE_TIME_LOST");
  const body = (response?.unboundConversationBlocks ?? []).map(block => block.body).join("\n");
  if (body.length > 450 || /(?:^|\n)\s*(?:[-*•]|\d+[.)])\s/u.test(body)) failures.push("OCR_STYLE_RECAP");
  return { passed: failures.length === 0, failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = evaluateLiveResult(JSON.parse(await readFile(process.argv[2], "utf8")));
  console.log(JSON.stringify(result));
  if (!result.passed) process.exitCode = 1;
}
