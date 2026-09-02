import type { RunEvaluationCaseOutputV1 } from "./runSuite.js";

export interface EvaluationReportSummaryV1 {
  schemaVersion: "evaluation-report-summary.v1";
  total: number;
  pass: number;
  fail: number;
  needsReview: number;
  notRun: number;
  projectionFailures: number;
  results: Array<{
    scenarioId: string;
    attemptId: string;
    gateStatus: string;
    terminalStatus: string;
    reasonCode: string;
    vetoScoreIds: string[];
  }>;
}

export function summarizeEvaluationResults(
  values: readonly RunEvaluationCaseOutputV1[],
): EvaluationReportSummaryV1 {
  const results = values.map((item) => ({
    scenarioId: item.gate.scenarioId,
    attemptId: item.gate.attemptId,
    gateStatus: item.gate.status,
    terminalStatus: item.result.terminalStatus,
    reasonCode: item.result.terminalReasonCode,
    vetoScoreIds: item.gate.capabilities.flatMap((capability) => capability.vetoScoreIds),
  }));
  return {
    schemaVersion: "evaluation-report-summary.v1",
    total: values.length,
    pass: values.filter((item) => item.gate.status === "pass").length,
    fail: values.filter((item) => item.gate.status === "fail").length,
    needsReview: values.filter((item) => item.gate.status === "needs_review").length,
    notRun: values.filter((item) => item.gate.status === "not_run").length,
    projectionFailures: values.reduce(
      (count, item) =>
        count +
        item.projectionErrors.length +
        item.projectionReceipts.filter((receipt) => receipt.status === "failed").length,
      0,
    ),
    results,
  };
}

export function renderEvaluationMarkdown(summary: EvaluationReportSummaryV1): string {
  const lines = [
    "# Talent Signal Evaluation Report",
    "",
    `- Total: ${summary.total}`,
    `- Pass: ${summary.pass}`,
    `- Fail: ${summary.fail}`,
    `- Needs review: ${summary.needsReview}`,
    `- Not run: ${summary.notRun}`,
    `- Projection failures: ${summary.projectionFailures}`,
    "",
    "| Scenario | Gate | Terminal | Reason | Vetoes |",
    "| --- | --- | --- | --- | --- |",
    ...summary.results.map(
      (item) =>
        `| ${item.scenarioId} | ${item.gateStatus} | ${item.terminalStatus} | ${item.reasonCode} | ${item.vetoScoreIds.join(", ") || "—"} |`,
    ),
    "",
  ];
  return lines.join("\n");
}
