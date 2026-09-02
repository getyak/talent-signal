import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const bundle = join(
  repositoryRoot,
  "docs/evaluations/2026-09-01-momentum-experience-v2-direction",
);

const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function readText(relativePath) {
  try {
    return readFileSync(join(bundle, relativePath), "utf8");
  } catch (error) {
    failures.push(`${relativePath}: ${error.message}`);
    return "";
  }
}

function readJson(relativePath) {
  const text = readText(relativePath);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    failures.push(`${relativePath}: ${error.message}`);
    return {};
  }
}

function sha256(relativePath) {
  try {
    return createHash("sha256")
      .update(readFileSync(join(bundle, relativePath)))
      .digest("hex");
  } catch (error) {
    failures.push(`${relativePath}: ${error.message}`);
    return "";
  }
}

const manifest = readJson("manifest.json");
const humanStatus = readJson("human-test/status.json");
const panel = readJson("reviews/panel.json");

check(manifest.goal === "MX-01", "manifest goal must be MX-01");
check(manifest.status === "human_gate_pending", "manifest must keep the human gate pending");
check(manifest.selected_direction?.id === 2, "Direction 2 must be selected");
check(manifest.selected_direction?.owner_selected === true, "product-owner selection must be recorded");
check(manifest.selected_direction?.design_qa === "passed", "selected design QA must pass");
check(manifest.rejected_direction?.id === 1, "Direction 1 must be recorded as rejected");
check(manifest.rejected_direction?.tradeoffs_recorded === true, "rejected tradeoffs must be recorded");

const requiredStates = [
  "today",
  "new-session",
  "fact",
  "approval",
  "executing",
  "unknown",
  "failed",
  "reconciled",
  "verified",
  "ambiguous",
  "insufficient-ax5-dark",
  "no-action",
  "person",
  "pursuit",
];

check(
  JSON.stringify(manifest.selected_state_set) === JSON.stringify(requiredStates),
  "selected state set must contain the frozen fourteen states in order",
);

for (const state of requiredStates) {
  sha256(`qa/states/${state}.jpg`);
}

const expectedHashes = {
  "directions/direction-1-causal-rail.png": manifest.source_sha256?.direction_1,
  "directions/direction-1-stress-states.png": manifest.source_sha256?.direction_1_stress,
  "directions/direction-2-decision-lens.png": manifest.source_sha256?.direction_2,
  "prototype-snapshot/Prototype.tsx": manifest.source_sha256?.prototype_tsx,
  "prototype-snapshot/prototype.css": manifest.source_sha256?.prototype_css,
  "prototype-snapshot/ModeratorStudy.tsx": manifest.source_sha256?.moderator_study_tsx,
  "prototype-snapshot/StudyEvidenceWorkbench.tsx": manifest.source_sha256?.study_workbench_tsx,
  "prototype-snapshot/studyEvidence.ts": manifest.source_sha256?.study_evidence_ts,
  "prototype-snapshot/moderator-study.css": manifest.source_sha256?.moderator_study_css,
  "prototype-snapshot/check-study-evidence.mjs": manifest.source_sha256?.evidence_test_script,
  "prototype-snapshot/package.json": manifest.source_sha256?.prototype_package,
  "prototype-snapshot/package-lock.json": manifest.source_sha256?.prototype_lock,
  "prototype-snapshot/design-qa.md": manifest.source_sha256?.design_qa,
  "prototype-snapshot/today-signal-orb.png": manifest.source_sha256?.today_signal_orb,
  "human-test/protocol.md": manifest.source_sha256?.human_protocol,
  "qa/source-implementation-comparison.jpg": manifest.source_sha256?.final_comparison,
  "qa/today-current-source.png": manifest.source_sha256?.today_current_source,
  "qa/today-current-implementation.jpg": manifest.source_sha256?.today_current_implementation,
  "qa/today-current-comparison.jpg": manifest.source_sha256?.today_current_comparison,
  "qa/today-ax5-dark.jpg": manifest.source_sha256?.today_ax5_dark,
  "qa/study-setup.jpg": manifest.source_sha256?.study_setup,
  "qa/study-lead-response.jpg": manifest.source_sha256?.study_lead_response,
  "qa/study-lead-visible.jpg": manifest.source_sha256?.study_lead_visible,
  "qa/study-lead-stimulus-rendered.jpg": manifest.source_sha256?.study_lead_stimulus,
  "qa/study-stimulus-comparison.jpg": manifest.source_sha256?.study_stimulus_comparison,
  "qa/study-scorer-entry.png": manifest.source_sha256?.study_scorer_entry,
  "qa/study-scorer-evidence.png": manifest.source_sha256?.study_scorer_evidence,
  "qa/study-adjudication-disagreement.png": manifest.source_sha256?.study_adjudication_disagreement,
  "qa/study-adjudication-draft.png": manifest.source_sha256?.study_adjudication_draft,
  "qa/study-scorer-mobile.png": manifest.source_sha256?.study_scorer_mobile,
  "qa/state-matrix.jpg": manifest.source_sha256?.state_matrix,
  "qa/voiceover-order.jpg": manifest.source_sha256?.voiceover_order_render,
};

for (const [relativePath, expected] of Object.entries(expectedHashes)) {
  check(Boolean(expected), `${relativePath}: manifest hash is required`);
  check(sha256(relativePath) === expected, `${relativePath}: sha256 mismatch`);
}

const designQa = readText("prototype-snapshot/design-qa.md");
check(designQa.includes("`passed`"), "design QA snapshot must record passed");
check(designQa.includes("`final result: passed`"), "design QA must record the exact final result");
check(designQa.includes("Human first-use comprehension remains"), "design QA must keep the human gate separate");
check(designQa.includes("`evidence workbench result: passed`"), "evidence workbench design QA must pass");
const moderatorStudy = readText("prototype-snapshot/ModeratorStudy.tsx");
check(moderatorStudy.includes("5_000"), "moderator runner must freeze a five-second exposure");
check(moderatorStudy.includes('"approval-first" : "fact-first"'), "moderator runner must alternate authority-screen order");
check(!moderatorStudy.includes("localStorage"), "moderator runner must not persist raw responses in local storage");
check(moderatorStudy.includes("No comprehension result has been scored or claimed."), "moderator runner must not claim a synthetic result");
const evidenceWorkbench = readText("prototype-snapshot/StudyEvidenceWorkbench.tsx");
const evidenceLogic = readText("prototype-snapshot/studyEvidence.ts");
const evidenceTest = readText("prototype-snapshot/check-study-evidence.mjs");
const prototypePackage = readJson("prototype-snapshot/package.json");
check(evidenceWorkbench.includes('mode === "score"'), "evidence workbench must keep scoring and adjudication separate");
check(evidenceWorkbench.includes("Draft only · manual review required"), "evidence workbench must visibly keep output in draft state");
check(evidenceWorkbench.includes("window.crypto.subtle.digest"), "scorer files must bind to the raw response SHA-256");
check(!evidenceWorkbench.includes("localStorage"), "evidence workbench must not persist responses or scores in local storage");
check(evidenceLogic.includes('"authority_no_external_write"'), "atomic scoring must include the no-external-write criterion");
check(evidenceLogic.includes("draft_requires_manual_review: true"), "status output must remain a manual-review draft");
check(evidenceLogic.includes("Expected exactly 10 participant rows"), "scoring must reject incomplete participant cohorts");
check(evidenceTest.includes("a disagreement cannot disappear without a rationale"), "evidence test must cover mandatory disagreement rationale");
check(prototypePackage.scripts?.["test:evidence"] === "node scripts/check-study-evidence.mjs", "prototype must expose the evidence regression check");
const humanProtocol = readText("human-test/protocol.md");
check(humanProtocol.includes("?study=moderator"), "human protocol must name the moderator entry");
check(humanProtocol.includes("?study=score&role=scorer_1"), "human protocol must name the independent scorer entry");
check(humanProtocol.includes("?study=adjudicate"), "human protocol must name the adjudication entry");
check(humanProtocol.includes("does not count as a participant result"), "human protocol must exclude synthetic rehearsals");
const prototypeEntry = readText("prototype-snapshot/index.html");
check(
  prototypeEntry.includes("<title>Talent Signal · MX-01 Decision Lens</title>"),
  "prototype snapshot must use the Talent Signal delivery title",
);

check(humanStatus.status === "not_run", "human test status must remain not_run before evidence exists");
check(humanStatus.participants_required === 10, "human test must require ten participants");
check(humanStatus.participants_completed === 0, "human participant results must not be fabricated");
check(humanStatus.five_second_passes === 0, "five-second passes must remain zero before the study");
check(humanStatus.fact_action_passes === 0, "fact/action passes must remain zero before the study");
check(humanStatus.five_second_gate === "pending", "five-second gate must remain pending");
check(humanStatus.fact_action_gate === "pending", "fact/action gate must remain pending");

const csvLines = readText("human-test/results-template.csv")
  .trimEnd()
  .split("\n");
const header = csvLines[0]?.split(",") ?? [];
const resultRows = csvLines.slice(1).map((line) => line.split(","));
check(resultRows.length === 10, "human-test template must contain exactly ten participant rows");
for (const [index, row] of resultRows.entries()) {
  check(row.length === header.length, `human-test row ${index + 1} must match the header width`);
  check(row[0] === `P${String(index + 1).padStart(2, "0")}`, `human-test row ${index + 1} has the wrong participant id`);
  check(row[10] === "", `human-test row ${index + 1} must not prefill five_second_pass`);
  check(row[12] === "", `human-test row ${index + 1} must not prefill fact_action_pass`);
}

check(panel.adjudication?.verdict === "pass_with_changes", "panel must not overstate a full pass");
check(panel.adjudication?.release_gate === "needs_evidence", "panel release gate must require evidence");
check(panel.reviews?.length === 5, "panel must contain the five selected reviews");
check(
  panel.reviews?.every((review) => Array.isArray(review.vetoes) && review.vetoes.length === 0),
  "no required reviewer may report an active veto",
);
check(
  panel.adjudication?.veto_resolution?.every((row) => row.status !== "active") ?? false,
  "adjudication must contain no active veto",
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exit(1);
}

console.log("MX-01 direction bundle: PASS");
console.log("Selected direction: 2 (Decision Lens)");
console.log("Rendered states: 14");
console.log("Required reviewer vetoes: 0 active");
console.log("Human gates: PENDING (0/10; no result claimed)");
