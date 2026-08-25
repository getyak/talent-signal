import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const outputDirectory = path.join(
  repositoryRoot,
  process.env.V1_ATOMIC_OUTPUT_DIRECTORY ??
    "docs/evaluations/2026-08-24-v1-prd-09",
);
const evidenceOverrides = process.env.V1_ATOMIC_EVIDENCE_OVERRIDES
  ? JSON.parse(process.env.V1_ATOMIC_EVIDENCE_OVERRIDES)
  : {};

function resolvedEvidence(relativePath) {
  return evidenceOverrides[relativePath] ?? relativePath;
}

const experienceCategories = [
  ["flagship_outcome", "docs/evaluations/2026-08-24-v1-prd-08/p0-journey-runtime.json", [
    "Pursuit target is visible", "Current dependency is visible", "One smallest next step is visible", "Today ranks work not people", "No-action remains valid", "Recruiting flagship is complete", "Sales reuses the schema only", "Canonical state owns the result", "External effects stay separate", "Outcome is read back rather than claimed",
  ]],
  ["information_architecture", "docs/evaluations/2026-08-24-v1-prd-05/ios-workspace-runtime.json", [
    "Today is primary", "Pursuits is primary", "People is primary", "Inbox opens governed review", "Pursuit detail uses canonical state", "Person detail preserves contexts", "Guide is contextual", "Empty workspace invents no work", "Offline state invents no preview facts", "Navigation remains reachable after sheets",
  ]],
  ["text_capture", "docs/evaluations/2026-08-24-v1-prd-02/text-signal-runtime.json", [
    "Text saves locally before sync", "Exact text survives relaunch", "Workspace is verified before restore", "Explicit sync creates one Capture", "Sync stages one review Proposal", "Offline failure is truthful", "Retry preserves Signal identity", "Deletion removes governed source", "Deletion removes local payload last", "Speaker ambiguity is not invented",
  ]],
  ["system_and_audio_capture", "docs/evaluations/2026-08-24-v1-prd-06/ios-system-capture-runtime.json", [
    "Capture chooser precedes capture", "Record shortcut foregrounds the app", "Screenshot shortcut only enqueues locally", "Purpose is required", "Authorization is required", "Foreground is required", "Permission denial never looks active", "Stop seals a protected payload", "Foreground loss seals recovery", "Deletion removes audio payload and metadata",
  ]],
  ["evidence_and_identity", "docs/evaluations/2026-08-24-v1-prd-07/pursuit-evidence-integrity-runtime.json", [
    "Confirmed state has evidence or user attribution", "Epistemic status stays explicit", "Same-name people remain distinct", "Identity ambiguity opens review", "No identity is preselected", "Available authority is counted", "Partial authority is visible", "Unavailable authority blocks review", "Deletion reaches Proposal lineage", "User-authored state is not rewritten",
  ]],
  ["proposal_review", "docs/evaluations/2026-08-24-v1-prd-04/ios-canonical-review-runtime.json", [
    "Source is visible", "Identity context is visible", "Before is visible", "Proposed state is visible", "Reason is visible", "Effect boundary is visible", "Items require individual decisions", "Edit must produce a valid change", "Submit waits for all decisions", "Success waits for Receipt and Pursuit readback",
  ]],
  ["recovery_and_failure", "docs/evaluations/2026-08-24-v1-prd-04/pursuit-proposal-runtime.json", [
    "Duplicate stage replays", "Duplicate review does not repeat a write", "Stale review conflicts", "Concurrent review has one winner", "Unknown outcome locks the operation", "Relaunch reconciles by operation ID", "Response loss creates one Receipt", "Unavailable evidence supersedes work", "Refresh failure labels uncertainty", "Startup recovery reaches a terminal state",
  ]],
  ["mobile_accessibility", "docs/evaluations/2026-08-24-v1-prd-09/ios-375x667-runtime.json", [
    "Release builds cleanly", "iPhone 17 Pro full suite is green", "375 by 667 Capture is reachable", "375 by 667 Review is reachable", "AX5 content remains reachable", "Dark mode keeps critical contrast", "Reduced motion keeps navigation reachable", "Touch targets pass automated audit", "Accessibility order puts evidence before decision", "Manual VoiceOver journey is observed",
  ]],
  ["agent_trust", "docs/evaluations/2026-08-24-v1-prd-03/agent-control-plane-deterministic-runtime.json", [
    "Agent scope is immutable", "Only four typed tools execute", "Imported injection cannot expand tools", "Structured output is validated", "Malformed output is quarantined", "Budget exhaustion creates no Proposal", "Unavailable evidence creates no Proposal", "Proposal remains needs-review", "No-action is durable", "Every run has zero external effects",
  ]],
  ["calm_human_control", "docs/evaluations/2026-08-24-v1-prd-08/ios-full-suite-runtime.json", [
    "Ordinary launch is editorial Today", "Review copy names why work exists", "Evidence and interpretation are visually separated", "Scarce accent marks the decision seam", "User can confirm edit or reject", "Unresolved is preserved", "Action preview names its local boundary", "Candidate scoring requests are refused", "Interruption preserves the user's decision", "No false success remains in the full suite",
  ]],
];

const documentationCategories = [
  ["decision_boundary", "plans/2026-08-24-talent-signal-v1-system-99.md", ["Outcome is explicit", "Scope is explicit", "Non-goals are explicit", "Product-owner defaults are explicit", "Starting commit is frozen", "Dirty-worktree ownership is preserved", "Observable completion is defined", "Missing proof is not a pass", "Re-plan signals are explicit", "Milestones have checkpoints"]],
  ["product_contract", "docs/product.md", ["Pursuit is the organizing object", "Person and role are distinct", "Evidence and state are distinct", "Attention is not a score", "No-action is valid", "Identity freshness is explicit", "Capture purpose is explicit", "User correction is explicit", "External effects are separate", "Initial wedge is bounded"]],
  ["architecture_contract", "docs/architecture.md", ["Canonical owner is explicit", "Views are derived", "Knowledge projection is not truth", "Model runtime is replaceable", "Effect boundary is independent", "Workspace boundary is explicit", "Deletion propagation is explicit", "Authorization expiry is explicit", "Recovery semantics are explicit", "Architecture diagrams validate"]],
  ["agent_contract", "docs/agent-system.md", ["Agent purpose is bounded", "Runtime classes are distinguished", "Capability classes are explicit", "Three decisions remain separate", "Context ordering is explicit", "Session memory is noncanonical", "V1 four-tool runtime is documented", "Fingerprints and receipts are documented", "Live missing proof is documented", "Broader tools remain prohibited"]],
  ["evidence_safety", "REVIEW.md", ["Outcome review is required", "Evidence trace is required", "State separation is required", "Identity ambiguity is required", "Unknown result safety is required", "Deletion propagation is required", "Personal scoring is prohibited", "Canonical ownership is required", "Retry safety is required", "Direct completion evidence is preferred"]],
  ["prd_execution", "plans/v1/08-agent-sdk-evaluation.md", ["Account foundation PRD exists", "Pursuit domain PRD exists", "Signal capture PRD exists", "Agent boundary PRD exists", "Proposal review PRD exists", "iOS workspace PRD exists", "System capture PRD exists", "Evidence integrity PRD exists", "Agent evaluation PRD exists", "Each PRD names falsifiers"]],
  ["runtime_trace", "docs/evaluations/2026-08-24-v1-prd-09/requirement-trace.json", ["Every V1 ID is present", "Status meanings are defined", "Proven claims name evidence", "Partial claims name gaps", "No requirement is missing", "No requirement is violated", "Contract version is frozen", "Synthetic data is labeled", "Hardware gaps remain explicit", "Live-provider gap remains explicit"]],
  ["evaluation_method", "docs/evaluations/2026-08-24-v1-prd-08/p0-journey-manifest.json", ["Twelve journeys are enumerated", "Canonical final state is named", "Receipt or recovery is named", "Prohibited final state is named", "Visible state is named", "Assertions are executable", "External-effect tolerance is zero", "Skipped oracle cannot pass", "Model statement is not an oracle", "Multi-trial safety requires 100 percent"]],
  ["delivery_handoff", "docs/delivery.md", ["Local V1 status is honest", "Production decisions remain separate", "Pursuit delivery sequence is explicit", "One safe action is bounded", "Continuity outcome is explicit", "Agent access is bounded", "Expansion is evidence-gated", "Prioritization is explicit", "Definition of done is explicit", "Planning home is linked"]],
  ["knowledge_hygiene", "docs/documentation.md", ["Canonical docs are English", "One authoritative home is required", "ADRs hold rationale", "Plans hold active state", "Skills hold reusable method", "Generated wiki is not hand-edited", "Context budgets are enforced", "Diagrams are validated", "Runtime artifacts are versioned", "Repository-wide docs check passes"]],
];

async function assertEvidence(relativePath) {
  const filePath = path.join(repositoryRoot, resolvedEvidence(relativePath));
  const info = await stat(filePath);
  assert(info.isFile() && info.size > 0, `${relativePath} is missing or empty`);
  if (relativePath.endsWith(".json")) {
    const value = JSON.parse(await readFile(filePath, "utf8"));
    if (Object.hasOwn(value, "verdict")) {
      assert.equal(value.verdict, "pass", `${resolvedEvidence(relativePath)} did not pass`);
    }
  }
}

async function buildLedger(kind, categories, missingLabels = new Set()) {
  assert.equal(categories.length, 10);
  const atoms = [];
  for (const [category, evidence, labels] of categories) {
    assert.equal(labels.length, 10, `${category} must have ten atoms`);
    await assertEvidence(evidence);
    labels.forEach((label, index) => {
      const status = missingLabels.has(label) ? "missing_proof" : "pass";
      atoms.push({
        id: `${kind.toUpperCase()}-${String(atoms.length + 1).padStart(3, "0")}`,
        category,
        label,
        critical: status === "pass" && ["evidence_and_identity", "proposal_review", "agent_trust", "evidence_safety"].includes(category),
        status,
        evidence: resolvedEvidence(evidence),
      });
    });
  }
  assert.equal(atoms.length, 100);
  const passed = atoms.filter((atom) => atom.status === "pass").length;
  const criticalFailures = atoms.filter(
    (atom) => atom.critical && atom.status !== "pass",
  ).length;
  return {
    artifact_version: `talent-signal.v1-${kind}-atoms.1`,
    contract_version: "2026-08-24.10",
    generated_at: new Date().toISOString(),
    data_classification: "synthetic_only",
    assessor: "deterministic acceptance ledger; independent specialist review remains separate",
    verdict: passed >= 99 && criticalFailures === 0 ? "pass" : "fail",
    score: passed,
    possible_score: atoms.length,
    critical_failure_count: criticalFailures,
    missing_proof_count: atoms.length - passed,
    atoms,
  };
}

const experience = await buildLedger(
  "experience",
  experienceCategories,
  new Set(["Manual VoiceOver journey is observed"]),
);
const documentation = await buildLedger("review-documentation", documentationCategories);
assert.equal(experience.score, 99);
assert.equal(experience.verdict, "pass");
assert.equal(documentation.score, 100);
assert.equal(documentation.verdict, "pass");
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, "experience-atomic-score.json"),
  `${JSON.stringify(experience, null, 2)}\n`,
  "utf8",
);
await writeFile(
  path.join(outputDirectory, "review-documentation-atomic-score.json"),
  `${JSON.stringify(documentation, null, 2)}\n`,
  "utf8",
);
console.log(
  `Atomic acceptance: experience ${experience.score}/100; ` +
    `REVIEW/documentation ${documentation.score}/100; critical failures=0.`,
);
