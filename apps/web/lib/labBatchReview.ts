import type {
  LabJob,
  LabJobAttempt,
  LabRegression,
} from "@talent-signal/contracts";

type LabJobStatus = LabJob["status"];

export const activeLabJobStatuses = new Set<LabJobStatus>([
  "queued",
  "running",
  "cancelling",
]);

export type LabCaseComparison = {
  caseId: string;
  title: string;
  partition: "development" | "held_out";
  expected: string;
  a: LabJobAttempt[];
  b: LabJobAttempt[];
  hardFailures: number;
  unknownOutcomes: number;
};

export function isTerminalLabJob(status: LabJobStatus): boolean {
  return !activeLabJobStatuses.has(status);
}

export function jobProgress(job: LabJob) {
  const issued = job.attempts.filter((attempt) => attempt.started_at !== null).length;
  const completed = job.attempts.filter((attempt) => attempt.status === "completed").length;
  const unknown = job.attempts.filter((attempt) => attempt.status === "unknown").length;
  const failed = job.attempts.filter((attempt) => attempt.status === "failed").length;
  const hardFailures = job.attempts.reduce(
    (total, attempt) =>
      total + attempt.checks.filter((check) => check.verdict === "fail").length,
    0,
  );
  return {
    planned: job.attempts.length,
    issued,
    completed,
    failed,
    unknown,
    hardFailures,
  };
}

export function attemptRunLabel(attempt: LabJobAttempt): string {
  return `第 ${attempt.repetition} 次`;
}

export function compareJobCases(job: LabJob): LabCaseComparison[] {
  return job.definition.cases.map((sample) => {
    const attempts = job.attempts.filter((attempt) => attempt.case_id === sample.id);
    return {
      caseId: sample.id,
      title: sample.title,
      partition: sample.partition,
      expected: sample.expected,
      a: attempts.filter((attempt) => attempt.configuration_index === 0),
      b: attempts.filter((attempt) => attempt.configuration_index === 1),
      hardFailures: attempts.reduce(
        (total, attempt) =>
          total + attempt.checks.filter((check) => check.verdict === "fail").length,
        0,
      ),
      unknownOutcomes: attempts.filter(
        (attempt) => attempt.status === "unknown" || attempt.status === "failed",
      ).length,
    };
  });
}

export function regressionEligibleAttempts(job: LabJob): LabJobAttempt[] {
  if (!isTerminalLabJob(job.status)) return [];
  return job.attempts.filter(
    (attempt) =>
      ["completed", "failed", "unknown"].includes(attempt.status) &&
      (attempt.status !== "completed" ||
        attempt.checks.some((check) => check.verdict === "fail")),
  );
}

export function releaseEvidence(regression: LabRegression): {
  label: string;
  tone: "verified" | "stale" | "unverified";
  detail: string;
} {
  if (regression.release_check === "ci_verified") {
    return {
      label: "CI 已验证",
      tone: "verified",
      detail: "受信工作流已消费这条冻结案例；质量结论仍需人工审阅。",
    };
  }
  if (regression.release_check === "ci_needs_refresh") {
    return {
      label: "CI 证据已过期",
      tone: "stale",
      detail: "保存状态仍有效，但当前发布版本需要新的托管执行记录。",
    };
  }
  return {
    label: "尚未纳入发布检查",
    tone: "unverified",
    detail: "保存为回归案例不等于发布门禁已执行。",
  };
}
