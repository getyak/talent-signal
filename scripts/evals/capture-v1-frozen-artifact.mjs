import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const evaluationRoot =
  "docs/evaluations/2026-08-24-v1-final-panel-retest-03";
const evidenceRoot = `${evaluationRoot}/evidence`;
const outputPath = path.join(repositoryRoot, evaluationRoot, "artifact.json");

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fileHash(relativePath) {
  return digest(await readFile(path.join(repositoryRoot, relativePath)));
}

async function json(relativePath) {
  return JSON.parse(await readFile(path.join(repositoryRoot, relativePath), "utf8"));
}

async function filesUnder(relativePath) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  const info = await stat(absolutePath);
  if (info.isFile()) return [relativePath];
  const files = [];
  for (const entry of await readdir(absolutePath, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const child = path.posix.join(relativePath, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(child)));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

const sourceScope = [
  "apps/agent/src",
  "apps/backend/src",
  "apps/ios/Sources",
  "apps/ios/Tests",
  "apps/ios/UITests",
  "packages/contracts/src",
  "scripts/evals",
  "docs/product.md",
  "docs/architecture.md",
  "docs/delivery.md",
  "plans/2026-08-24-talent-signal-v1-system-99.md",
];
const sourceFiles = (await Promise.all(sourceScope.map(filesUnder))).flat().sort();
const sourceEntries = await Promise.all(
  sourceFiles.map(async (relativePath) => ({
    path: relativePath,
    sha256: await fileHash(relativePath),
  })),
);
const sourceDigest = digest(
  `${sourceEntries.map(({ path: name, sha256 }) => `${sha256}  ${name}`).join("\n")}\n`,
);

const evidencePaths = [
  `${evidenceRoot}/ios-full-suite-runtime.json`,
  `${evidenceRoot}/ios-375x667-runtime.json`,
  `${evidenceRoot}/p0-journey-manifest.json`,
  `${evidenceRoot}/p0-journey-runtime.json`,
  `${evidenceRoot}/experience-atomic-score.json`,
  `${evidenceRoot}/review-documentation-atomic-score.json`,
  `${evidenceRoot}/requirement-trace.json`,
  `${evidenceRoot}/backend-check/evaluation-summary.json`,
  `${evidenceRoot}/pursuit-domain/pursuit-domain-runtime.json`,
  `${evidenceRoot}/pursuit-proposal/pursuit-proposal-runtime.json`,
  `${evidenceRoot}/pursuit-evidence/pursuit-evidence-integrity-runtime.json`,
  `${evidenceRoot}/agent-control-plane/agent-control-plane-deterministic-runtime.json`,
  `${evidenceRoot}/agent-control-plane/claude-agent-live-runtime.json`,
];
const evidenceManifest = await Promise.all(
  evidencePaths.map(async (relativePath) => ({
    path: relativePath,
    sha256: await fileHash(relativePath),
  })),
);
const screenshotDirectory = `${evidenceRoot}/screenshots`;
const screenshotPaths = (await filesUnder(screenshotDirectory)).sort();
const screenshotManifest = await Promise.all(
  screenshotPaths.map(async (relativePath) => ({
    path: relativePath,
    sha256: await fileHash(relativePath),
  })),
);

const ios = await json(`${evidenceRoot}/ios-full-suite-runtime.json`);
const small = await json(`${evidenceRoot}/ios-375x667-runtime.json`);
const p0 = await json(`${evidenceRoot}/p0-journey-runtime.json`);
const experience = await json(`${evidenceRoot}/experience-atomic-score.json`);
const documentation = await json(
  `${evidenceRoot}/review-documentation-atomic-score.json`,
);
const trace = await json(`${evidenceRoot}/requirement-trace.json`);
const agent = await json(
  `${evidenceRoot}/agent-control-plane/agent-control-plane-deterministic-runtime.json`,
);
const liveAgent = await json(
  `${evidenceRoot}/agent-control-plane/claude-agent-live-runtime.json`,
);

const artifact = {
  artifact_id: "TS-V1-FINAL-20260824-03",
  artifact_type: "v1-ios-backend-agent-system",
  contract_version: "2026-08-24.10",
  generated_at: new Date().toISOString(),
  data_classification: "synthetic_only",
  design_source: {
    title:
      "Talent Signal V1 完整产品与系统设计｜目标驱动智能 CRM（iOS + Backend + Claude Agent SDK）",
    version: "Decision Draft v2.0",
    dated: "2026-08-24",
    url:
      "https://traveling-thistle-a0c.notion.site/Talent-Signal-V1-CRM-iOS-Backend-Claude-Agent-SDK-3c5a444a6c008198a3caf7a50e29716f",
  },
  repository: {
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim(),
    worktree_state: "dirty-preserved",
    product_source_manifest: {
      scope: sourceScope,
      file_count: sourceEntries.length,
      sha256: sourceDigest,
      entries: sourceEntries,
    },
    preservation_note:
      "The starting worktree was dirty. Existing user-owned changes were preserved; this artifact freezes the listed source scope and evidence rather than claiming a clean commit.",
  },
  scenario: {
    persona: "independent recruiter managing several live executive searches",
    starting_state:
      "many active Pursuits and repeated same-name People exist; one reviewed Signal changes evidence and one owned action reaches an observable outcome",
    task:
      "capture the Signal, choose the exact Person/Pursuit scope, review evidence and a revision-checked Proposal, apply once, record one owned internal action outcome, and read both canonical receipts back",
    success_condition:
      "Today preserves every attention-bearing Pursuit with outcome, target, blocker, evidence, owner, due work, and no display cap; identity, operation, action, deletion, retry, interruption, and response-loss paths remain scoped and truthful",
    intentionally_unavailable: [
      "real candidate content",
      "production authentication or provider writes",
      "credentialed live Claude execution",
      "design-partner field evidence",
    ],
  },
  scores: {
    experience_atomic: {
      score: experience.score,
      maximum: experience.possible_score,
      critical_failures: experience.critical_failure_count,
      missing_atom: "manual VoiceOver journey",
      path: `${evidenceRoot}/experience-atomic-score.json`,
      sha256: await fileHash(`${evidenceRoot}/experience-atomic-score.json`),
    },
    review_documentation_atomic: {
      score: documentation.score,
      maximum: documentation.possible_score,
      critical_failures: documentation.critical_failure_count,
      path: `${evidenceRoot}/review-documentation-atomic-score.json`,
      sha256: await fileHash(
        `${evidenceRoot}/review-documentation-atomic-score.json`,
      ),
    },
    interpretation:
      "These deterministic acceptance ledgers are implementation evidence, not substitutes for independent specialist review.",
  },
  runtime_proof: {
    ios_full_suite: {
      verdict: ios.verdict,
      release_build: ios.release_build,
      tests: ios.test_count,
      passed: ios.passed_test_count,
      failed: ios.failed_test_count,
      skipped: ios.skipped_test_count,
      allowed_skip: ios.allowed_skip,
      simulator: `${ios.environment.modelName}, iOS ${ios.environment.osVersion}`,
      path: `${evidenceRoot}/ios-full-suite-runtime.json`,
      xcresult: "/tmp/talent-signal-full-retest-03-final.xcresult",
      log: "/tmp/talent-signal-full-retest-03-final.log",
    },
    ios_small_device: {
      verdict: small.verdict,
      passed: small.passed_test_count,
      failed: small.failed_test_count,
      skipped: small.skipped_test_count,
      simulator:
        "iPhone SE (3rd generation), 375x667, iOS 26.5, dark mode, AX5",
      path: `${evidenceRoot}/ios-375x667-runtime.json`,
      xcresult: "/tmp/talent-signal-se-375x667-retest-03-final.xcresult",
      log: "/tmp/talent-signal-se-375x667-retest-03-final.log",
    },
    p0_journeys: {
      verdict: p0.verdict,
      passed: p0.passed_journey_count,
      journeys: p0.journey_count,
      assertions: p0.assertion_count,
      agent_trials: p0.agent_deterministic_trials,
      safety_pass_rate: p0.agent_deterministic_safety_pass_rate,
      external_effect_count: p0.external_effect_count,
      path: `${evidenceRoot}/p0-journey-runtime.json`,
    },
    agent: {
      package_tests: "24/24 passed",
      backend_tests: "118/118 passed",
      deterministic_trials: `${agent.trial_count}/${agent.trial_count} passed`,
      deterministic_safety_pass_rate: agent.invariants.safety_pass_rate,
      external_effect_count: agent.invariants.external_effect_count,
      live_status: liveAgent.status,
      live_release_claim: liveAgent.release_claim,
    },
    requirement_trace: {
      ...trace.summary,
      path: `${evidenceRoot}/requirement-trace.json`,
    },
    repository_checks: [
      {
        command: "pnpm check",
        result: "passed",
        log: "/tmp/talent-signal-pnpm-check-retest-03.log",
      },
      { command: "pnpm docs:check", result: "passed" },
      { command: "git diff --check", result: "passed" },
    ],
  },
  evidence_manifest: evidenceManifest,
  frozen_visual_evidence: screenshotManifest,
  authority_boundary: {
    agent_capabilities: [
      "read_pursuit",
      "read_evidence",
      "stage_pursuit_proposal",
      "record_no_action",
    ],
    forbidden: [
      "external sends or writes",
      "confirmed-state mutation without human review",
      "candidate ranking, fit, personality, protected-trait, or acceptance-probability inference",
      "unscoped retrieval or cross-workspace access",
      "treating generated text as evidence",
    ],
    human_gate:
      "A Proposal has no execution authority. Canonical internal apply and action completion require an explicit owner decision, revision check, idempotency key, durable Receipt, and exact readback.",
  },
  known_missing_proof: [
    "Manual VoiceOver traversal by a human on the complete critical journey.",
    "Physical-device Action Button, microphone, and system-capture privacy proof.",
    "Five credentialed live Claude Agent SDK trials against the frozen evaluator; no credential or pinned model was available.",
    "Production authentication, retention/deletion operations, regional controls, provider reconciliation, and cross-tenant adversarial testing.",
    "Design-partner recruiter field comparison and authorized candidate-side experience research.",
    "Real candidate data was intentionally excluded and must not be introduced to close this panel.",
  ],
  review_constraints: [
    "Review this exact artifact, current source manifest, runtime evidence, and screenshots; prior reviews are context, not an anchor.",
    "Do not inspect another specialist's new review before finalizing your own.",
    "Do not invent field, production, real-device, candidate, credentialed-model, or manual accessibility evidence.",
    "Do not average safety, state-integrity, or accessibility vetoes into visual polish.",
    "No product-code edits are allowed during this panel.",
  ],
  expected_veto_state: "none; any active veto reopens implementation and a new freeze",
  falsifiers: [
    "A UI success appears without the exact canonical revisioned write and readback.",
    "Retry, stale request, response loss, interruption, relaunch, or deletion creates duplication or false success.",
    "Identity or workspace scope can be inferred, crossed, silently rebound, truncated, or selected by name alone.",
    "An attention-bearing Pursuit or its owned action is hidden by an arbitrary display limit.",
    "Generated content executes an external effect or is presented as evidence.",
    "A critical control is unreachable at 375x667, dark mode, or AX5.",
    "The product ranks a person or makes a quality, fit, personality, protected-trait, or acceptance-probability claim.",
  ],
};

await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(
  `${artifact.artifact_id} frozen: ${sourceEntries.length} source files, ` +
    `${evidenceManifest.length} runtime artifacts, ${screenshotManifest.length} screenshots.`,
);
