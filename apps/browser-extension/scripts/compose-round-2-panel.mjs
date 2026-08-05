import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, "../../..");
const evidenceRoot = path.join(
  repositoryRoot,
  "docs/evaluations/round-2/browser-extension",
);

async function json(filename) {
  return JSON.parse(await readFile(path.join(evidenceRoot, filename), "utf8"));
}

const reviewObject = await json("review-object.json");
const reviews = await Promise.all([
  json("review-mobile-ux.json"),
  json("review-candidate-experience.json"),
  json("review-recruiter-workflow.json"),
  json("review-evidence-safety.json"),
]);

const activeVeto =
  "XS-CAPTURE-01: the user Google Chrome intentional capture and pre-Submit source boundary remains unproven.";

const panel = {
  panel_id: "TS-2026-08-05-browser-extension-round-2",
  artifact: {
    id: reviewObject.artifact_id,
    type: reviewObject.artifact_type,
    version: `${reviewObject.source_commit}:${reviewObject.build.aggregate_sha256}`,
  },
  scenario: reviewObject.scenario,
  frozen_evidence: reviewObject.evidence_bundle.map(
    (item) => `${item.path} sha256:${item.sha256}`,
  ),
  review_plan: reviewObject.review_plan.map(({ reviewer, status, reason }) => ({
    reviewer,
    status,
    reason,
  })),
  reviews,
  adjudication: {
    verdict: "fail",
    release_gate: "block",
    top_findings: [
      {
        reviewer: "evidence-safety-reviewer",
        criterion: "Intentional least-privilege capture",
        severity: "blocker",
        reason:
          "The exact package is directly executable in Playwright Chromium, but no user Google Chrome chrome://extensions/toolbar trace proves the positive temporary activeTab grant and real source-to-Submit silence boundary.",
        next_step:
          "Run the same package digest in a policy-authorized user Google Chrome profile with a synthetic source, toolbar or shortcut gesture, network trace, and one localhost receipt.",
        verification:
          "The trace shows one explicit gesture, source-only temporary access, the exact reviewed asset, no capture POST before Submit, one scoped receipt, and no background tab, history, cookie, or external effect access.",
      },
      {
        reviewer: "mobile-ux-reviewer",
        criterion: "Human first-use and assistive comprehension",
        severity: "medium",
        reason:
          "Keyboard focus, AX tree, ARIA live regions, 200% reflow, contrast, reduced motion, and axe checks pass directly, but automated semantics do not prove spoken screen-reader timing or uncoached human understanding.",
        next_step:
          "Run one uncoached recruiter walkthrough and one supported screen-reader traversal on the frozen package.",
        verification:
          "Both users complete the path and correctly distinguish evidence, proposal, approval, pending or unknown, receipt, and local versus backend deletion without coaching.",
      },
      {
        reviewer: "evidence-safety-reviewer",
        criterion: "Destination receipt and evidence lifecycle",
        severity: "medium",
        reason:
          "The extension truthfully requests retention and clears private content locally after receipt, but the owning backend has not proven a real receipt, duplicate readback, retention, or source-plus-derivative deletion.",
        next_step:
          "Have the localhost backend owner run the frozen extension request through a scoped synthetic session and lifecycle trace.",
        verification:
          "One request ID resolves to one receipt, duplicate reconciliation, the chosen retention result, and observable raw plus registered-derivative deletion.",
      },
    ],
    agreements: [
      "Observed source, exact reviewed asset, synthetic proposal, explicit Submit authority, receipt outcome, and deletion state remain distinct.",
      "The extension does not confirm candidate facts or execute contact, calendar, message, ATS, CRM, or other external writes.",
      "Candidate scoring, ranking, personality, tone, protected traits, culture fit, and acceptance probability remain outside the product boundary.",
      "The keyboard-only synthetic path completes in logical order with visible focus, exact-message links, no capture API request before Submit, and truthful receipt language.",
      "Loading, no-action, ambiguity, blocked inference, permission denial, offline, unknown, retry, stale session, recovery, and local deletion preserve the reviewed context without false success.",
      "Long mixed-script content reflows at 320, 390, and the 195 CSS-pixel layout created by 200% tab zoom; reviewed axe output has zero violations and zero incomplete checks.",
      "Playwright Chromium evidence improves direct package proof but is not user Google Chrome toolbar evidence and cannot resolve XS-CAPTURE-01.",
    ],
    disagreements: [],
    veto_resolution: [
      {
        reviewer: "evidence-safety-reviewer",
        veto: activeVeto,
        status: "active",
        evidence:
          "docs/evaluations/round-2/browser-extension/review-evidence-safety.json; docs/evaluations/round-2/browser-extension/loaded-package-evidence.json caveat",
      },
    ],
    rationale:
      "Executable evidence materially improves the extension craft and establishes a trustworthy bounded synthetic review surface. Mobile UX, candidate experience, and recruiter workflow each pass with bounded changes at score 3 under their own rubrics. Evidence safety owns the intentional-capture jurisdiction and retains one blocker: the allowed Chromium load-unpacked harness cannot prove the user's Google Chrome installation, toolbar gesture, or positive activeTab grant. Scores are not averaged, so the active veto keeps the release gate blocked. Real backend receipt and deletion also remain external evidence gaps rather than extension success claims.",
  },
  next_tests: [
    {
      owner: "Browser extension manual release evidence",
      test:
        "Run the exact build digest in a policy-authorized user Google Chrome profile from toolbar or shortcut gesture through one synthetic receipt.",
      evidence_required:
        "chrome://extensions package identity, toolbar or shortcut recording, positive activeTab scope, exact preview, capture-network trace, Submit, and account-scoped receipt.",
      pass_condition:
        "XS-CAPTURE-01 resolves with no background access, no capture POST before Submit, one reviewed packet, and no external effect.",
    },
    {
      owner: "Product research and accessibility",
      test:
        "Run an uncoached recruiter walkthrough and supported screen-reader traversal of the frozen package.",
      evidence_required:
        "Task recording, spoken order, comprehension account, seeded-scope-error correction, hesitations, and completion time versus manual copy or note.",
      pass_condition:
        "Users finish without coaching, catch the seeded scope error, and accurately explain evidence, proposal, approval, receipt, and deletion limits.",
    },
    {
      owner: "Owning localhost backend",
      test:
        "Run one scoped synthetic extension receipt, duplicate, retention, and deletion lifecycle.",
      evidence_required:
        "Request ID, idempotency key, session version, receipt readback, duplicate reconciliation, selected retention, and source plus derivative deletion readback.",
      pass_condition:
        "Exactly one receipt exists and every registered private derivative follows the disclosed retention or deletion result.",
    },
  ],
};

const target = path.join(evidenceRoot, "panel.json");
await writeFile(target, `${JSON.stringify(panel, null, 2)}\n`);
process.stdout.write(`${target}\n`);
