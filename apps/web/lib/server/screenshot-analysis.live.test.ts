import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseScreenshotAnalysisGoldCorpus,
  scoreScreenshotAnalysisGoldCase,
} from "../test/screenshot-analysis-gold";
import { analyzeScreenshot } from "./screenshot-analysis";

const live = process.env.TALENT_SIGNAL_RUN_LIVE_AI === "true";

if (live) {
  process.loadEnvFile(
    fileURLToPath(new URL("../../.env.local", import.meta.url)),
  );
}

const repeats = Math.min(
  3,
  Math.max(
    1,
    Number.parseInt(
      process.env.TALENT_SIGNAL_SCREENSHOT_GOLD_REPEATS ?? "1",
      10,
    ) || 1,
  ),
);

const verbose = process.env.TALENT_SIGNAL_SCREENSHOT_GOLD_VERBOSE === "true";

describe.runIf(live)("live synthetic screenshot analysis gold set", () => {
  it(
    `meets every safety-critical gold check across ${repeats} run(s)`,
    async () => {
      const corpusUrl = new URL(
        "../../test/fixtures/screenshot-analysis-gold.v1.json",
        import.meta.url,
      );
      const corpus = parseScreenshotAnalysisGoldCorpus(
        JSON.parse(await readFile(corpusUrl, "utf8")),
      );
      const requestedCase =
        process.env.TALENT_SIGNAL_SCREENSHOT_GOLD_CASE?.trim();
      const selectedCases = requestedCase
        ? corpus.cases.filter((item) => item.id === requestedCase)
        : corpus.cases;
      expect(
        selectedCases.length,
        requestedCase
          ? `Unknown screenshot gold case ${requestedCase}`
          : "The screenshot gold corpus must not be empty",
      ).toBeGreaterThan(0);
      let passedChecks = 0;
      let requiredChecks = 0;
      const runFailures: Array<{
        case_id: string;
        critical_failures: string[];
        provider_error?: string;
        repeat: number;
        score_percent: number;
      }> = [];
      const transientProviderFailures: Array<{
        attempt: number;
        case_id: string;
        error: string;
        repeat: number;
      }> = [];

      for (let repeat = 0; repeat < repeats; repeat += 1) {
        const orderedCases =
          repeat % 2 === 0 ? selectedCases : [...selectedCases].reverse();
        for (const gold of orderedCases) {
          const imageUrl = new URL(
            `../../public/marketing/signal-journey/${gold.file}`,
            import.meta.url,
          );
          const bytes = new Uint8Array(await readFile(imageUrl));
          const sourceSha256 = createHash("sha256")
            .update(bytes)
            .digest("hex");
          const startedAt = performance.now();
          let result:
            | Awaited<ReturnType<typeof analyzeScreenshot>>
            | undefined;
          let providerError: string | undefined;
          let succeededOnAttempt = 0;
          for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
              result = await analyzeScreenshot({
                bytes,
                mimeType: "image/webp",
                contactName: `Synthetic Candidate · ${gold.id}`,
                assignmentLabel: "Synthetic executive-search evaluation",
                screenshotOwner: gold.screenshot_owner,
                sourceSha256,
              });
              succeededOnAttempt = attempt;
              break;
            } catch (error) {
              providerError =
                error instanceof Error ? error.message : String(error);
              transientProviderFailures.push({
                attempt,
                case_id: gold.id,
                error: providerError,
                repeat: repeat + 1,
              });
              console.warn(
                "LIVE_SCREENSHOT_GOLD_PROVIDER_FAILURE",
                JSON.stringify({
                  repeat: repeat + 1,
                  case_id: gold.id,
                  attempt,
                  error: providerError,
                }),
              );
            }
          }
          if (!result) {
            runFailures.push({
              case_id: gold.id,
              critical_failures: ["provider_unavailable_after_two_attempts"],
              provider_error: providerError,
              repeat: repeat + 1,
              score_percent: 0,
            });
            continue;
          }
          const score = scoreScreenshotAnalysisGoldCase(gold, result.draft);
          passedChecks += score.passed_checks;
          requiredChecks += score.required_checks;

          expect(result.meta.provider).toBe("OpenRouter");
          expect(result.meta.request_id).toBeTruthy();
          expect(result.meta.source_sha256).toBe(sourceSha256);
          expect(result.meta.raw_image_stored_by_talent_signal).toBe(false);
          for (const assertion of result.draft.assertions) {
            const message = result.draft.messages.find(
              (candidate) =>
                candidate.source_message_id === assertion.evidence_message_id,
            );
            expect(message?.text).toContain(assertion.evidence_quote);
            if (assertion.status === "proposed") {
              expect(message?.speaker).toBe("candidate");
            }
          }

          console.log(
            "LIVE_SCREENSHOT_GOLD_RESULT",
            JSON.stringify({
              repeat: repeat + 1,
              case_id: gold.id,
              file: gold.file,
              provider: result.meta.provider,
              model: result.meta.model,
              request_id: result.meta.request_id,
              attempt: succeededOnAttempt,
              latency_ms: Math.round(performance.now() - startedAt),
              source_sha256: result.meta.source_sha256,
              message_count: result.draft.messages.length,
              ...(verbose
                ? {
                    messages: result.draft.messages.map((message) => ({
                      speaker: message.speaker,
                      text: message.text,
                    })),
                  }
                : {}),
              assertions: result.draft.assertions.map((assertion) => ({
                field: assertion.field,
                status: assertion.status,
                ...(verbose
                  ? { evidence_quote: assertion.evidence_quote }
                  : {}),
              })),
              disposition: result.draft.disposition,
              score_percent: score.score_percent,
              passed_checks: score.passed_checks,
              required_checks: score.required_checks,
              critical_failures: score.critical_failures,
              quality_warnings: score.quality_warnings,
            }),
          );

          if (
            score.critical_failures.length > 0 ||
            score.score_percent !== 100
          ) {
            runFailures.push({
              case_id: gold.id,
              critical_failures: score.critical_failures,
              repeat: repeat + 1,
              score_percent: score.score_percent,
            });
          }
        }
      }

      const scorePercent = Number(
        ((passedChecks / Math.max(requiredChecks, 1)) * 100).toFixed(2),
      );
      console.log(
        "LIVE_SCREENSHOT_GOLD_SUMMARY",
        JSON.stringify({
          artifact: corpus.artifact,
          cases: selectedCases.length,
          repeats,
          passed_checks: passedChecks,
          required_checks: requiredChecks,
          score_percent: scorePercent,
          provider_attempt_failures: transientProviderFailures.length,
          provider_attempt_failure_details: transientProviderFailures,
        }),
      );
      expect(runFailures, "screenshot gold failures").toEqual([]);
      expect(scorePercent).toBe(100);
    },
    repeats * 5 * 90_000,
  );
});
