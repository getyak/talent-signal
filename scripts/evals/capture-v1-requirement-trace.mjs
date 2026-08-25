import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const baseline = JSON.parse(
  await readFile(
    path.join(
      repositoryRoot,
      "docs/evaluations/2026-08-24-v1-baseline/requirement-trace.json",
    ),
    "utf8",
  ),
);
const retestRoot = process.env.V1_RETEST_EVIDENCE_ROOT ?? "";
const retestPath = (relativePath, fallback) =>
  retestRoot ? path.posix.join(retestRoot, relativePath) : fallback;

const evidence = {
  "V1-CAP-001": ["proven", ["PRD-02 text-signal runtime: durable local save, relaunch, offline retry, canonical sync"], ""],
  "V1-CAP-002": ["proven", ["PRD-02 governed deletion Receipt", "PRD-07 source hash, authority, lineage, and idempotent deletion runtime"], ""],
  "V1-CAP-003": ["partial", ["PRD-06 Release App Intent metadata and foreground/background behavior"], "Physical Action button invocation and its system feedback remain unobserved."],
  "V1-CAP-004": ["proven", ["PRD-06 audio state-machine 8/8 and Simulator lifecycle/AX5 journeys"], ""],
  "V1-CRM-001": ["proven", ["PRD-01 canonical Pursuit rows and revision/Receipt readback"], ""],
  "V1-CRM-002": ["proven", ["PRD-01 same Person with different contextual Pursuit roles"], ""],
  "V1-CRM-003": ["proven", ["PRD-01 evidence-aware Gap basis and close-condition rejection/readback"], ""],
  "V1-CRM-004": ["proven", ["PRD-01 owned internal Action with owner-only outcome, persisted client operation ID, response-loss relaunch reconciliation, one POST, idempotent Receipt, canonical readback, and empty effects"], ""],
  "V1-CRM-005": ["proven", ["PRD-01 recruiting and sales fixtures share the same Pursuit contract"], ""],
  "V1-EVI-001": ["proven", ["PRD-07 confirmed role/gap requires reviewed evidence or attributed user-authored basis"], ""],
  "V1-EVI-002": ["proven", ["PRD-04 epistemic Proposal items", "PRD-07 available, partial, unavailable, superseded, and user-authored projections"], ""],
  "V1-EVI-003": ["proven", ["PRD-07 same-name identity case preserves two Person IDs and requires review"], ""],
  "V1-EVI-004": ["proven", ["PRD-07 source deletion supersedes pending work, redacts source-derived narratives and raw canaries, and preserves applied milestone value while explicit authority becomes unavailable"], ""],
  "V1-AGT-001": ["proven", ["PRD-03 immutable four-tool manifest across 30 database-backed trials"], ""],
  "V1-AGT-002": ["proven", ["PRD-03 malformed structured output quarantined 5/5 with no Proposal"], ""],
  "V1-AGT-003": ["proven", ["PRD-03 fresh-snapshot recovery and provider-session-independent durable run state"], ""],
  "V1-AGT-004": ["proven", ["PRD-03 eight fingerprints, pinned budget, usage, and terminal Receipt on every trial"], ""],
  "V1-AGT-005": ["proven", ["PRD-03 model-visible/executed manifest and database rows contain zero external effects", "PRD-06/Release boundary"], ""],
  "V1-REV-001": ["proven", ["PRD-04 canonical iOS review displays source, identity, before, proposed, reason, and effect"], ""],
  "V1-REV-002": ["proven", ["PRD-04 item-level confirm/edit/reject and unresolved revision-preservation checks"], ""],
  "V1-REV-003": ["proven", ["PRD-04 stale and concurrent revision conflicts persist without overwrite"], ""],
  "V1-REV-004": ["proven", ["PRD-04 response-loss relaunch reconciles one operation without resubmit"], ""],
  "V1-REV-005": ["proven", ["PRD-04 structured item Receipt binds workspace, operation, actor, outcome, Proposal status, and exact Pursuit readback"], ""],
  "V1-SEC-001": ["proven", ["PRD-05/07 Pursuit, People, lineage, and outbox isolation", "PRD-03 cross-workspace Agent run hidden"], ""],
  "V1-SEC-002": ["proven", ["PRD-03 prompt-injection Bash request denied 5/5 without manifest expansion"], ""],
  "V1-TST-001": ["proven", ["PRD-08 versioned 12-journey manifest and deterministic oracle runtime"], ""],
  "V1-TST-002": ["implemented_unverified", ["PRD-03 exact Claude Agent SDK adapter and 30 deterministic same-protocol trials", "Machine-readable live-provider artifact"], "Five credentialed, pinned-model Claude trials remain missing proof."],
  "V1-TST-003": ["proven", ["PRD-06 Release-compiled boundary test and clean Release build"], ""],
  "V1-TST-004": ["partial", ["PRD-05/08 AX5 dark, reduced-motion, accessibility-audit, and interruption journeys", "PRD-09 iPhone SE 375x667 AX5 dark Capture and Review journeys"], "Manual VoiceOver completion remains missing proof."],
};

const artifactByMarker = {
  "PRD-01": retestPath("pursuit-domain/pursuit-domain-runtime.json", "docs/evaluations/2026-08-24-v1-prd-01/pursuit-domain-runtime.json"),
  "PRD-02": retestPath("ios-full-suite-runtime.json", "docs/evaluations/2026-08-24-v1-prd-02/text-signal-runtime.json"),
  "PRD-03": retestPath("agent-control-plane/agent-control-plane-deterministic-runtime.json", "docs/evaluations/2026-08-24-v1-prd-03/agent-control-plane-deterministic-runtime.json"),
  "PRD-04": retestPath("pursuit-proposal/pursuit-proposal-runtime.json", "docs/evaluations/2026-08-24-v1-prd-04/pursuit-proposal-runtime.json"),
  "PRD-05": retestPath("ios-full-suite-runtime.json", "docs/evaluations/2026-08-24-v1-prd-05/ios-workspace-runtime.json"),
  "PRD-06": retestPath("ios-full-suite-runtime.json", "docs/evaluations/2026-08-24-v1-prd-06/ios-system-capture-runtime.json"),
  "PRD-07": retestPath("pursuit-evidence/pursuit-evidence-integrity-runtime.json", "docs/evaluations/2026-08-24-v1-prd-07/pursuit-evidence-integrity-runtime.json"),
  "PRD-08": retestPath("p0-journey-runtime.json", "docs/evaluations/2026-08-24-v1-prd-08/p0-journey-runtime.json"),
  "PRD-09": retestPath("ios-375x667-runtime.json", "docs/evaluations/2026-08-24-v1-prd-09/ios-375x667-runtime.json"),
};

function withArtifactPaths(locators) {
  const paths = Object.entries(artifactByMarker)
    .filter(([marker]) => locators.some((locator) => locator.includes(marker)))
    .map(([, artifact]) => artifact);
  return [...new Set([...paths, ...locators])];
}

assert.equal(baseline.requirements.length, 29);
assert.equal(Object.keys(evidence).length, baseline.requirements.length);
const requirements = baseline.requirements.map((requirement) => {
  const update = evidence[requirement.id];
  assert(update, `Missing final trace entry for ${requirement.id}`);
  const [status, locators, gap] = update;
  return {
    id: requirement.id,
    requirement: requirement.requirement,
    status,
    evidence: withArtifactPaths(locators),
    gap,
  };
});
const statuses = ["proven", "implemented_unverified", "partial", "missing", "violated"];
const summary = Object.fromEntries(
  statuses.map((status) => [
    status,
    requirements.filter((requirement) => requirement.status === status).length,
  ]),
);
const trace = {
  trace_id: process.env.V1_REQUIREMENT_TRACE_ID ?? "TS-V1-REQUIREMENTS-FINAL-20260824-03",
  artifact_id: process.env.V1_ARTIFACT_ID ?? "TS-V1-FINAL-20260824-03",
  as_of: "2026-08-24",
  contract_version: "2026-08-24.10",
  data_classification: "synthetic_only",
  status_contract: baseline.status_contract,
  summary: { total: requirements.length, ...summary },
  requirements,
};
assert.equal(trace.summary.proven, 26);
assert.equal(trace.summary.implemented_unverified, 1);
assert.equal(trace.summary.partial, 2);
assert.equal(trace.summary.missing, 0);
assert.equal(trace.summary.violated, 0);
const outputDirectory = path.join(
  repositoryRoot,
  process.env.V1_REQUIREMENT_TRACE_OUTPUT_DIRECTORY ??
    "docs/evaluations/2026-08-24-v1-prd-09",
);
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, "requirement-trace.json"),
  `${JSON.stringify(trace, null, 2)}\n`,
  "utf8",
);
console.log(
  `V1 requirement trace: ${trace.summary.proven}/${trace.summary.total} proven, ` +
    `${trace.summary.implemented_unverified} implemented-unverified, ` +
    `${trace.summary.partial} partial, 0 missing, 0 violated.`,
);
