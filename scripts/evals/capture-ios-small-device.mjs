import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const resultPath =
  process.env.IOS_XCRESULT_PATH ?? "/tmp/talent-signal-se-375x667.xcresult";
const logPath =
  process.env.IOS_CHECK_LOG_PATH ?? "/tmp/talent-signal-se-375x667.log";
const outputPath = path.join(
  repositoryRoot,
  process.env.IOS_SMALL_DEVICE_OUTPUT_PATH ??
    "docs/evaluations/2026-08-24-v1-prd-09/ios-375x667-runtime.json",
);
const result = JSON.parse(
  execFileSync(
    "xcrun",
    ["xcresulttool", "get", "test-results", "tests", "--path", resultPath],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  ),
);
const cases = [];
function collect(node) {
  if (node.nodeType === "Test Case") cases.push(node);
  for (const child of node.children ?? []) collect(child);
}
for (const node of result.testNodes ?? []) collect(node);
assert.equal(result.devices?.[0]?.modelName, "iPhone SE (3rd generation)");
assert.equal(cases.length, 3);
assert.equal(cases.every((test) => test.result === "Passed"), true);
const identifiers = new Set(cases.map((test) => test.nodeIdentifier));
const checks = {
  capture_chooser_before_capture: identifiers.has(
    "CandidateSignalUITests/testCaptureRailOpensPurposeBoundChooserBeforeAnyCapture()",
  ),
  audio_consent_and_stop_reachable_at_ax5_dark: identifiers.has(
    "CandidateSignalUITests/testAudioSignalAX5DarkKeepsConsentAndStopReachable()",
  ),
  canonical_review_and_action_outcome_at_ax5_dark: identifiers.has(
    "CandidateSignalUITests/testCanonicalWorkspaceAX5DarkReducedMotionKeepsNavigationReachable()",
  ),
};
assert.equal(Object.values(checks).every(Boolean), true);
const log = await readFile(logPath, "utf8");
assert(log.includes("** BUILD SUCCEEDED **"));
assert(log.includes("** TEST SUCCEEDED **"));
assert(!log.includes("Failing tests:"));
const artifact = {
  artifact_version: "talent-signal.v1-ios-375x667.1",
  contract_version: "2026-08-24.10",
  generated_at: new Date().toISOString(),
  data_classification: "synthetic_only",
  verdict: "pass",
  environment: result.devices[0],
  logical_screen_points: { width: 375, height: 667 },
  content_size: "accessibility-extra-extra-extra-large",
  appearance: "dark",
  release_build: "passed",
  passed_test_count: cases.length,
  failed_test_count: 0,
  skipped_test_count: 0,
  checks,
  limitation:
    "Automated accessibility hierarchy and audits are direct Simulator proof; manual VoiceOver traversal remains separate human evidence.",
};
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log("iPhone SE 375x667 AX5 dark acceptance passed 3/3 journeys.");
