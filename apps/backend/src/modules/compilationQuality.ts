import type {
  CompilationQuality,
  KnowledgeBlock,
  KnowledgeSnapshot,
} from "@talent-signal/contracts";
import { PROHIBITED_INFERENCE_TERMS } from "@talent-signal/contracts";

export const GOLD_COMPILATION_MINIMUM = 95;

export type CompilationPublicationIssue = {
  code: string;
  message: string;
  blockId?: string;
};

export type CompilationPublicationAssessment = {
  eligible: boolean;
  issues: CompilationPublicationIssue[];
};

export type CompilationQualityEvidence = {
  blocks: KnowledgeBlock[];
  expectedAuthorizationScope: string;
  expectedConfirmedStateCount: number;
  expectedReviewClaimCount: number;
  reviewClaimsMissingEvidence: number;
  identityBound: boolean;
};

function pass(value: boolean): "pass" | "fail" {
  return value ? "pass" : "fail";
}

function containsProhibitedInference(blocks: KnowledgeBlock[]): boolean {
  const content = JSON.stringify(
    blocks.map((block) => block.content),
  ).toLowerCase();
  return PROHIBITED_INFERENCE_TERMS.some((term) => {
    const variants = [
      term,
      term.replaceAll("_", " "),
      term.replaceAll("_", "-"),
    ];
    return variants.some((variant) => content.includes(variant));
  });
}

export function deriveCompilationQuality(
  evidence: CompilationQualityEvidence,
): CompilationQuality {
  const activeBlocks = evidence.blocks.filter(
    (block) => block.status !== "deleted",
  );
  const identityBlocks = activeBlocks.filter(
    (block) => block.type === "identity_context",
  );
  const stateBlocks = activeBlocks.filter((block) =>
    block.block_key.startsWith("fact."),
  );
  const reviewBlocks = activeBlocks.filter((block) =>
    ["conflict", "open_question"].includes(block.type) &&
    !block.block_key.startsWith("research.stale."),
  );
  const attentionBlocks = activeBlocks.filter((block) =>
    ["next_action", "no_action"].includes(block.type),
  );
  const dependenciesComplete = activeBlocks.every(
    (block) => block.dependencies.length > 0,
  );
  const sourceBacked = activeBlocks.every((block) => {
    if (
      block.type === "identity_context" ||
      block.type === "no_action"
    ) {
      return true;
    }
    return block.dependencies.some((dependency) =>
      [
        "evidence_fragment",
        "fact_version",
        "source_resource",
        "research_snapshot",
      ].includes(dependency.type),
    );
  });
  const scopeAuthorized = activeBlocks.every((block) =>
    block.dependencies.some(
      (dependency) =>
        dependency.authorization_scope ===
        evidence.expectedAuthorizationScope,
    ),
  );
  const stateProvenanceComplete =
    stateBlocks.length === evidence.expectedConfirmedStateCount &&
    stateBlocks.every(
      (block) =>
        block.dependencies.some(
          (dependency) => dependency.type === "fact_version",
        ) &&
        block.dependencies.some(
          (dependency) => dependency.type === "evidence_fragment",
        ),
    );
  const reviewCoverageComplete =
    evidence.reviewClaimsMissingEvidence === 0 &&
    reviewBlocks.length === evidence.expectedReviewClaimCount &&
    reviewBlocks.every((block) =>
      block.dependencies.some(
        (dependency) => dependency.type === "evidence_fragment",
      ),
    );
  const contentBounded =
    activeBlocks.length <= 100 &&
    activeBlocks.every(
      (block) =>
        block.content.headline.length <= 2_000 &&
        (block.content.summary?.length ?? 0) <= 8_000 &&
        block.content.items.length <= 20 &&
        block.content.items.every((item) => item.length <= 2_000),
    );
  const reviewable = activeBlocks
    .filter((block) =>
      ["proposed", "contested"].includes(block.status),
    )
    .every((block) =>
      block.dependencies.some((dependency) =>
        [
          "evidence_fragment",
          "source_resource",
          "research_snapshot",
        ].includes(dependency.type),
      ),
    );
  const deletionLinked = activeBlocks.every((block) =>
    block.dependencies.every(
      (dependency) =>
        dependency.id.length > 0 &&
        dependency.authorization_scope.length > 0,
    ),
  );

  const gates: CompilationQuality["gates"] = {
    identity_binding: pass(
      evidence.identityBound && identityBlocks.length === 1,
    ),
    provenance: pass(
      dependenciesComplete &&
        sourceBacked &&
        stateProvenanceComplete &&
        reviewCoverageComplete,
    ),
    scope_authorization: pass(scopeAuthorized),
    temporal_integrity: pass(
      stateProvenanceComplete && reviewCoverageComplete,
    ),
    prohibited_inference: pass(
      !containsProhibitedInference(activeBlocks),
    ),
    deletion_lineage: pass(deletionLinked),
  };
  const measures: CompilationQuality["measures"] = {
    task_relevance:
      identityBlocks.length === 1 && attentionBlocks.length === 1
        ? 100
        : 0,
    compression: contentBounded ? 100 : 0,
    conflict_visibility: reviewCoverageComplete ? 100 : 0,
    recruiter_reviewability: reviewable ? 100 : 0,
  };
  const failedGates = Object.entries(gates)
    .filter(([, result]) => result === "fail")
    .map(([name]) => name);
  const failedMeasures = Object.entries(measures)
    .filter(([, score]) => score < GOLD_COMPILATION_MINIMUM)
    .map(([name]) => name);
  const gold =
    failedGates.length === 0 && failedMeasures.length === 0;
  return {
    verdict: gold ? "gold" : "abstain",
    gates,
    measures,
    reasons: gold
      ? [
          `Observed ${activeBlocks.length} bounded blocks with complete governed dependencies.`,
          `Represented ${stateBlocks.length} temporal fact versions and ${reviewBlocks.length} reviewable claims without unsupported promotion.`,
          "Identity, scope, provenance, conflict visibility, prohibited-inference, and deletion-link checks passed.",
        ]
      : [
          `Compilation abstained; failed gates: ${
            failedGates.join(", ") || "none"
          }.`,
          `Measures below ${GOLD_COMPILATION_MINIMUM}: ${
            failedMeasures.join(", ") || "none"
          }.`,
        ],
  };
}

function time(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function assessGoldQuality(
  quality: CompilationQuality,
  issues: CompilationPublicationIssue[],
): void {
  for (const [gate, result] of Object.entries(quality.gates)) {
    if (result !== "pass") {
      issues.push({
        code: "COMPILATION_GATE_FAILED",
        message: `Gold compilation requires the ${gate} gate to pass.`,
      });
    }
  }
  for (const [measure, score] of Object.entries(quality.measures)) {
    if (score < GOLD_COMPILATION_MINIMUM) {
      issues.push({
        code: "COMPILATION_MEASURE_BELOW_GOLD",
        message: `${measure} must be at least ${GOLD_COMPILATION_MINIMUM} for gold compilation.`,
      });
    }
  }
}

function assessBlockTime(
  block: KnowledgeBlock,
  compiledAt: number,
  issues: CompilationPublicationIssue[],
): void {
  const validFrom = time(block.valid_from);
  const validUntil = time(block.valid_until);
  if (
    validFrom !== null &&
    validUntil !== null &&
    validUntil < validFrom
  ) {
    issues.push({
      blockId: block.id,
      code: "BLOCK_VALIDITY_INVERTED",
      message: "A knowledge block cannot expire before it becomes valid.",
    });
  }

  const freshnessUntil = time(block.freshness_until);
  if (
    block.type === "sourced_research" &&
    (freshnessUntil === null || freshnessUntil < compiledAt)
  ) {
    issues.push({
      blockId: block.id,
      code: "RESEARCH_BLOCK_STALE",
      message:
        "Published sourced research requires a freshness deadline that remains current at compilation.",
    });
  }
}

function countBlocks(
  blocks: KnowledgeBlock[],
  type: KnowledgeBlock["type"],
): number {
  return blocks.filter(
    (block) => block.type === type && block.status !== "deleted",
  ).length;
}

export function assessCompilationPublication(
  snapshot: KnowledgeSnapshot,
): CompilationPublicationAssessment {
  const issues: CompilationPublicationIssue[] = [];
  const compiledAt = Date.parse(snapshot.compiled_at);

  if (snapshot.status !== "published") {
    issues.push({
      code: "SNAPSHOT_NOT_PUBLISHED",
      message: "Only an explicitly published snapshot can serve active Wiki reads.",
    });
  }
  if (snapshot.quality.verdict !== "gold") {
    issues.push({
      code: "SNAPSHOT_NOT_GOLD",
      message:
        "An active Wiki snapshot must meet the gold compilation contract.",
    });
  } else {
    assessGoldQuality(snapshot.quality, issues);
  }

  const activeBlocks = snapshot.blocks.filter(
    (block) => block.status !== "deleted",
  );
  if (activeBlocks.length === 0) {
    issues.push({
      code: "SNAPSHOT_EMPTY",
      message: "A published Wiki snapshot must contain at least one active block.",
    });
  }

  const identityBlocks = countBlocks(activeBlocks, "identity_context");
  if (identityBlocks !== 1) {
    issues.push({
      code: "IDENTITY_CONTEXT_CARDINALITY",
      message:
        "A published person Wiki must contain exactly one active identity-context block.",
    });
  }

  if (snapshot.relationship_context_id !== null) {
    const dependencyBlocks = countBlocks(
      activeBlocks,
      "current_dependency",
    );
    const actionBlocks = countBlocks(activeBlocks, "next_action");
    const noActionBlocks = countBlocks(activeBlocks, "no_action");

    if (actionBlocks > 0 && dependencyBlocks !== 1) {
      issues.push({
        code: "ACTION_WITHOUT_ONE_DEPENDENCY",
        message:
          "A context-scoped next action requires exactly one current dependency.",
      });
    }
    if (actionBlocks + noActionBlocks !== 1) {
      issues.push({
        code: "ATTENTION_DECISION_CARDINALITY",
        message:
          "A context-scoped Wiki must contain exactly one next action or one intentional no-action block.",
      });
    }
  }

  for (const block of activeBlocks) {
    if (block.dependencies.length === 0) {
      issues.push({
        blockId: block.id,
        code: "BLOCK_WITHOUT_DEPENDENCY",
        message: "Every active knowledge block requires a governed dependency.",
      });
    }
    assessBlockTime(block, compiledAt, issues);
  }

  return {
    eligible: issues.length === 0,
    issues,
  };
}
