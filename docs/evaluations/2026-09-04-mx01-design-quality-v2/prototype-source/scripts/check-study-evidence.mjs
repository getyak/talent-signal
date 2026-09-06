import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const compiledDirectory = mkdtempSync(join(tmpdir(), "mx01-study-evidence-"));
process.on("exit", () => rmSync(compiledDirectory, { recursive: true, force: true }));
const compile = spawnSync(
  join(process.cwd(), "node_modules/.bin/tsc"),
  [
    "src/studyEvidence.ts",
    "--ignoreConfig",
    "--target", "ES2022",
    "--module", "ES2022",
    "--moduleResolution", "Bundler",
    "--skipLibCheck",
    "--outDir", compiledDirectory,
  ],
  { cwd: process.cwd(), encoding: "utf8" },
);
assert.equal(compile.status, 0, compile.stderr || compile.stdout || "studyEvidence.ts failed to compile");

const evidence = await import(pathToFileURL(join(compiledDirectory, "studyEvidence.js")));
const {
  adjudicationHeaders,
  buildAdjudicationCsv,
  buildFinalResultsCsv,
  buildScorerCsv,
  buildStatusDraft,
  criteria,
  finalizeStudy,
  findDisagreements,
  parseCsv,
  parseRawStudyCsv,
  parseScorerCsv,
  participantIds,
  rawStudyHeaders,
  serializeCsv,
  validateScorerPair,
} = evidence;

const rawRows = [Array.from(rawStudyHeaders)];
for (const [index, participantId] of participantIds.entries()) {
  rawRows.push([
    participantId,
    `Independent recruiter, cohort ${index + 1}`,
    "true",
    "Facilitator screen",
    index % 2 === 0 ? "fact-first" : "approval-first",
    "Alex Chen, candidate for Aurora’s Staff Product Designer role",
    "Remote policy remains unresolved",
    "Decision due Wednesday, Sep 2",
    "Review the supported fact next",
    "Tap Review one supported fact",
    "",
    "Confirm fact changes the internal date only. Approve exact effect creates one local reminder. No message, meeting, contact, ATS, or CRM write.",
    "",
    "",
    "",
    "",
    index === 0 ? "Contains a comma, a quote \"and\" a\nline break." : "",
  ]);
}
const rawCsv = serializeCsv(rawRows);
const rawParsed = parseRawStudyCsv(rawCsv);
assert.equal(rawParsed.ok, true, "complete raw evidence must validate");
assert.equal(rawParsed.value[0].notes, "Contains a comma, a quote \"and\" a\nline break.");

const allTrue = Object.fromEntries(criteria.map((criterion) => [criterion.id, true]));
const scorer1Scores = participantIds.map((participantId) => ({ participantId, decisions: { ...allTrue }, notes: "" }));
const scorer2Scores = participantIds.map((participantId) => ({
  participantId,
  decisions: { ...allTrue, ...(participantId === "P03" ? { lead_due: false } : {}) },
  notes: participantId === "P03" ? "Date wording disputed." : "",
}));
const fingerprint = createHash("sha256").update(rawCsv).digest("hex");
const scorer1Csv = buildScorerCsv(fingerprint, "scorer_1", "S-A", scorer1Scores);
const scorer2Csv = buildScorerCsv(fingerprint, "scorer_2", "S-B", scorer2Scores);
const fixtureFlagIndex = process.argv.indexOf("--write-fixtures");
if (fixtureFlagIndex >= 0) {
  const fixtureDirectory = process.argv[fixtureFlagIndex + 1];
  assert.ok(fixtureDirectory?.startsWith("/tmp/mx01-"), "fixture output must be an explicit /tmp/mx01-* path");
  mkdirSync(fixtureDirectory, { recursive: true });
  writeFileSync(join(fixtureDirectory, "synthetic-raw.csv"), rawCsv);
  writeFileSync(join(fixtureDirectory, "synthetic-scorer-1.csv"), scorer1Csv);
  writeFileSync(join(fixtureDirectory, "synthetic-scorer-2.csv"), scorer2Csv);
}
const scorer1 = parseScorerCsv(scorer1Csv);
const scorer2 = parseScorerCsv(scorer2Csv);
assert.equal(scorer1.ok, true);
assert.equal(scorer2.ok, true);
const pair = validateScorerPair(scorer1.value, scorer2.value, fingerprint);
assert.equal(pair.ok, true);
const disagreements = findDisagreements(pair.value);
assert.deepEqual(disagreements, [{
  participantId: "P03",
  criterionId: "lead_due",
  scorer1Value: true,
  scorer2Value: false,
}]);

const incompleteFinal = finalizeStudy(fingerprint, pair.value, "ADJ-1", []);
assert.equal(incompleteFinal.ok, false, "a disagreement cannot disappear without a rationale");
const tamperedAdjudication = finalizeStudy(fingerprint, pair.value, "ADJ-1", [{
  ...disagreements[0],
  scorer1Value: false,
  finalValue: false,
  rationale: "Tampered scorer value.",
}]);
assert.equal(tamperedAdjudication.ok, false, "adjudication cannot rewrite a frozen scorer value");
const finalized = finalizeStudy(fingerprint, pair.value, "ADJ-1", [{
  ...disagreements[0],
  finalValue: false,
  rationale: "The frozen response did not name Wednesday or Sep 2.",
}]);
assert.equal(finalized.ok, true);

const status = buildStatusDraft(finalized.value);
assert.equal(status.five_second_passes, 9);
assert.equal(status.fact_action_passes, 10);
assert.equal(status.five_second_gate, "passed");
assert.equal(status.fact_action_gate, "passed");
assert.equal(status.draft_requires_manual_review, true);

const resultsRows = parseCsv(buildFinalResultsCsv(rawParsed.value, finalized.value));
assert.equal(resultsRows.length, 11);
assert.equal(resultsRows[3][10], "false", "P03 final five-second result must reflect adjudication");
assert.equal(resultsRows[3][13], "S-A");
assert.equal(resultsRows[3][14], "S-B");
assert.match(resultsRows[3][15], /lead_due=false/);

const adjudicationRows = parseCsv(buildAdjudicationCsv(finalized.value));
assert.deepEqual(adjudicationRows[0], Array.from(adjudicationHeaders));
assert.equal(adjudicationRows.length, 2);
assert.equal(adjudicationRows[1][1], "P03");

const contaminatedRows = parseCsv(rawCsv);
contaminatedRows[1][10] = "true";
assert.equal(parseRawStudyCsv(serializeCsv(contaminatedRows)).ok, false, "prefilled pass fields must be rejected");

const tamperedScoreRows = parseCsv(scorer2Csv);
tamperedScoreRows[1][12] = "false";
assert.equal(parseScorerCsv(serializeCsv(tamperedScoreRows)).ok, false, "derived pass columns must match atomic judgments");

console.log("MX-01 study evidence logic: PASS");
console.log("CSV round-trip: embedded commas, quotes, and line breaks preserved");
console.log("Independent scorer join: raw SHA-256 matched");
console.log("Adjudication: one atomic disagreement required and resolved");
console.log("Gate draft: Test A 9/10; Test B 10/10; official status untouched");
