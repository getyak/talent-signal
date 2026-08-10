import { ASSERTION_FIELDS } from "@talent-signal/contracts";
import { z } from "zod";

import {
  SCREENSHOT_OWNER_ROLES,
  SCREENSHOT_PLATFORMS,
  type ScreenshotCaptureDraft,
} from "../screenshot-capture";

const speakerSchema = z.enum(["candidate", "recruiter", "unknown"]);
const statusSchema = z.enum(["proposed", "ambiguous"]);

const goldCaseSchema = z.object({
  id: z.string().min(1),
  file: z.string().regex(/^[a-z0-9-]+\.webp$/),
  allowed_platforms: z.array(z.enum(SCREENSHOT_PLATFORMS)).min(1),
  screenshot_owner: z.enum(SCREENSHOT_OWNER_ROLES),
  expected_messages: z.array(
    z.object({
      speaker: speakerSchema,
      text_contains: z.string().min(1),
    }),
  ),
  expected_assertions: z.array(
    z.object({
      field: z.enum(ASSERTION_FIELDS),
      status: statusSchema,
      evidence_contains: z.string().min(1),
      required: z.boolean().default(true),
    }),
  ),
  forbid_action: z.boolean(),
});

const goldCorpusSchema = z.object({
  artifact: z.literal("screenshot-analysis-gold.v1"),
  review_status: z.literal("curated_synthetic"),
  independent_human_review: z.literal("pending"),
  scope: z.string().min(1),
  cases: z.array(goldCaseSchema).min(1),
});

export type ScreenshotAnalysisGoldCorpus = z.infer<typeof goldCorpusSchema>;
export type ScreenshotAnalysisGoldCase = z.infer<typeof goldCaseSchema>;

export type ScreenshotGoldScore = {
  case_id: string;
  passed_checks: number;
  required_checks: number;
  score_percent: number;
  critical_failures: string[];
  quality_warnings: string[];
};

export function parseScreenshotAnalysisGoldCorpus(
  value: unknown,
): ScreenshotAnalysisGoldCorpus {
  return goldCorpusSchema.parse(value);
}

function normalizeForGold(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function editDistance(left: string, right: string) {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? Number.POSITIVE_INFINITY;
}

function matchGoldText(value: string, expected: string) {
  const normalizedValue = normalizeForGold(value);
  const normalizedExpected = normalizeForGold(expected);
  if (normalizedValue.includes(normalizedExpected)) {
    return "exact" as const;
  }
  if (normalizedExpected.length < 12) {
    return "none" as const;
  }
  const allowedDistance = Math.max(
    1,
    Math.floor(normalizedExpected.length * 0.06),
  );
  for (
    let windowLength = normalizedExpected.length - allowedDistance;
    windowLength <= normalizedExpected.length + allowedDistance;
    windowLength += 1
  ) {
    for (
      let start = 0;
      start <= Math.max(normalizedValue.length - windowLength, 0);
      start += 1
    ) {
      const window = normalizedValue.slice(start, start + windowLength);
      if (editDistance(window, normalizedExpected) <= allowedDistance) {
        return "approximate" as const;
      }
    }
  }
  return "none" as const;
}

export function scoreScreenshotAnalysisGoldCase(
  gold: ScreenshotAnalysisGoldCase,
  draft: ScreenshotCaptureDraft,
): ScreenshotGoldScore {
  let requiredChecks = 1;
  let passedChecks = gold.allowed_platforms.includes(draft.platform) ? 1 : 0;
  const criticalFailures: string[] = [];
  const qualityWarnings: string[] = [];

  if (passedChecks === 0) {
    criticalFailures.push(
      `platform:${draft.platform};expected:${gold.allowed_platforms.join("|")}`,
    );
  }

  for (const expected of gold.expected_messages) {
    requiredChecks += 2;
    const messageMatch = draft.messages
      .map((candidate) => ({
        candidate,
        match: matchGoldText(candidate.text, expected.text_contains),
      }))
      .find((candidate) => candidate.match !== "none");
    if (!messageMatch) {
      criticalFailures.push(`missing_message:${expected.text_contains}`);
      continue;
    }
    const { candidate: message } = messageMatch;
    passedChecks += 1;
    if (messageMatch.match === "approximate") {
      qualityWarnings.push(`approximate_ocr:${expected.text_contains}`);
    }
    if (message.speaker === expected.speaker) {
      passedChecks += 1;
    } else {
      criticalFailures.push(
        `speaker:${expected.text_contains};actual:${message.speaker};expected:${expected.speaker}`,
      );
    }
  }

  for (const expected of gold.expected_assertions) {
    requiredChecks += 2;
    const assertion = draft.assertions.find(
      (candidate) =>
        candidate.field === expected.field &&
        matchGoldText(candidate.evidence_quote, expected.evidence_contains) !==
          "none",
    );
    if (!assertion) {
      if (expected.required) {
        criticalFailures.push(
          `missing_assertion:${expected.field}:${expected.evidence_contains}`,
        );
      } else {
        passedChecks += 2;
        qualityWarnings.push(
          `optional_clarification_omitted:${expected.field}:${expected.evidence_contains}`,
        );
      }
      continue;
    }
    passedChecks += 1;
    if (assertion.status === expected.status) {
      passedChecks += 1;
    } else if (
      expected.status === "proposed" &&
      assertion.status === "ambiguous"
    ) {
      passedChecks += 1;
      qualityWarnings.push(
        `conservative_abstention:${expected.field}:${expected.evidence_contains}`,
      );
    } else {
      criticalFailures.push(
        `assertion_status:${expected.field};actual:${assertion.status};expected:${expected.status}`,
      );
    }
  }

  const expectedProposals = gold.expected_assertions.filter(
    (assertion) => assertion.status === "proposed",
  );
  for (const assertion of draft.assertions.filter(
    (candidate) => candidate.status === "proposed",
  )) {
    requiredChecks += 1;
    const expected = expectedProposals.some(
      (candidate) =>
        candidate.field === assertion.field &&
        matchGoldText(assertion.evidence_quote, candidate.evidence_contains) !==
          "none",
    );
    if (expected) {
      passedChecks += 1;
    } else {
      criticalFailures.push(
        `unexpected_proposal:${assertion.field}:${assertion.evidence_quote}`,
      );
    }
  }

  if (gold.forbid_action) {
    requiredChecks += 1;
    if (draft.action === null && draft.disposition !== "propose_action") {
      passedChecks += 1;
    } else {
      criticalFailures.push("unexpected_action");
    }
  }

  return {
    case_id: gold.id,
    passed_checks: passedChecks,
    required_checks: requiredChecks,
    score_percent: Number(
      ((passedChecks / Math.max(requiredChecks, 1)) * 100).toFixed(2),
    ),
    critical_failures: criticalFailures,
    quality_warnings: qualityWarnings,
  };
}
