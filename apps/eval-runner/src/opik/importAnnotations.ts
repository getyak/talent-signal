import {
  digestCanonicalJson,
  digestContentDocument,
  type CriterionAdjudicationV1,
  type Sha256Digest,
} from "@talent-signal/evaluation";

import type { AnnotationImportProposalV1 } from "../contracts.js";

const LABELS = new Set<AnnotationImportProposalV1["label"]>([
  "accept",
  "accept_with_edits",
  "reject",
  "wrong_person",
  "wrong_speaker",
  "missing_evidence",
  "stale",
  "unnecessary_research",
  "unsafe_action",
]);

export interface AnnotationImportBatchV1 {
  schemaVersion: "evaluation-annotation-import-batch.v1";
  importedAt: string;
  proposals: AnnotationImportProposalV1[];
  conflicts: Array<{
    scenarioId: string;
    attemptId: string;
    criterionId: string;
    proposalIds: string[];
    labels: AnnotationImportProposalV1["label"][];
  }>;
}

export interface AnnotationAdjudicationDecisionV1 {
  decisionId: string;
  scenarioId: string;
  attemptId: string;
  criterionId: string;
  proposalIds: string[];
  adjudicatorRef: string;
  outcome: "confirmed" | "disputed" | "rejected";
  selectedLabel?: AnnotationImportProposalV1["label"];
  evidenceLocators: string[];
  rationale: string;
  decidedAt: string;
}

export interface HumanGoldRecordV1 {
  schemaVersion: "evaluation-human-gold.v1";
  goldId: string;
  scenarioId: string;
  attemptId: string;
  criterionId: string;
  rubricId: string;
  rubricVersion: string;
  label: AnnotationImportProposalV1["label"];
  proposalIds: string[];
  adjudicationDecisionId: string;
  adjudicatorRef: string;
  evidenceLocators: string[];
  createdAt: string;
  contentDigest: Sha256Digest;
}

export interface AnnotationAdjudicationBatchV1 {
  schemaVersion: "evaluation-annotation-adjudication-batch.v1";
  sourceBatchDigest: Sha256Digest;
  sourceConflicts: AnnotationImportBatchV1["conflicts"];
  decisions: Array<AnnotationAdjudicationDecisionV1 & { contentDigest: Sha256Digest }>;
  goldRecords: HumanGoldRecordV1[];
  unresolvedConflictCount: number;
  contentDigest: Sha256Digest;
}

interface RawAnnotation {
  annotationId: string;
  scenarioId: string;
  attemptId: string;
  criterionId: string;
  rubricId: string;
  rubricVersion: string;
  reviewerRef: string;
  label: AnnotationImportProposalV1["label"];
  evidenceLocators: string[];
  comment?: string;
}

function parseAnnotation(value: unknown, expectedRubricVersion?: string): RawAnnotation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Annotation must be an object");
  }
  const record = value as Record<string, unknown>;
  const requiredStrings = [
    "annotationId",
    "scenarioId",
    "attemptId",
    "criterionId",
    "rubricId",
    "rubricVersion",
    "reviewerRef",
    "label",
  ] as const;
  for (const key of requiredStrings) {
    if (typeof record[key] !== "string" || record[key].length === 0) {
      throw new Error(`Annotation field ${key} must be a non-empty string`);
    }
  }
  if (!LABELS.has(record.label as AnnotationImportProposalV1["label"])) {
    throw new Error(`Unsupported annotation label: ${String(record.label)}`);
  }
  if (
    !Array.isArray(record.evidenceLocators) ||
    record.evidenceLocators.length === 0 ||
    record.evidenceLocators.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    throw new Error("Annotation must cite at least one evidence locator");
  }
  if (expectedRubricVersion && record.rubricVersion !== expectedRubricVersion) {
    throw new Error(
      `Rubric version mismatch: expected ${expectedRubricVersion}, received ${String(record.rubricVersion)}`,
    );
  }
  if (record.comment !== undefined && (typeof record.comment !== "string" || record.comment.length > 2_000)) {
    throw new Error("Annotation comment must be a string no longer than 2000 characters");
  }
  return {
    annotationId: record.annotationId as string,
    scenarioId: record.scenarioId as string,
    attemptId: record.attemptId as string,
    criterionId: record.criterionId as string,
    rubricId: record.rubricId as string,
    rubricVersion: record.rubricVersion as string,
    reviewerRef: record.reviewerRef as string,
    label: record.label as AnnotationImportProposalV1["label"],
    evidenceLocators: record.evidenceLocators as string[],
    ...(record.comment === undefined ? {} : { comment: record.comment as string }),
  };
}

export function importAnnotationProposals(input: {
  annotations: unknown;
  importedAt: string;
  expectedRubricVersion?: string;
}): AnnotationImportBatchV1 {
  if (!Array.isArray(input.annotations)) throw new Error("Annotation export must be an array");
  const seen = new Set<string>();
  const proposals = input.annotations.map((value) => {
    const annotation = parseAnnotation(value, input.expectedRubricVersion);
    if (seen.has(annotation.annotationId)) {
      throw new Error(`Duplicate annotation ID: ${annotation.annotationId}`);
    }
    seen.add(annotation.annotationId);
    const sourceDigest = digestCanonicalJson(annotation);
    return {
      schemaVersion: "evaluation-annotation-import-proposal.v1" as const,
      proposalId: `annotation-proposal:${annotation.annotationId}`,
      source: "opik_annotation_export" as const,
      importedAt: input.importedAt,
      rubricId: annotation.rubricId,
      rubricVersion: annotation.rubricVersion,
      scenarioId: annotation.scenarioId,
      attemptId: annotation.attemptId,
      criterionId: annotation.criterionId,
      reviewerRef: annotation.reviewerRef,
      label: annotation.label,
      evidenceLocators: annotation.evidenceLocators,
      ...(annotation.comment === undefined ? {} : { comment: annotation.comment }),
      adjudication: "unreviewed" as const,
      sourceDigest,
    } satisfies AnnotationImportProposalV1;
  });
  const groups = new Map<string, AnnotationImportProposalV1[]>();
  for (const proposal of proposals) {
    const key = `${proposal.scenarioId}\u0000${proposal.attemptId}\u0000${proposal.criterionId}`;
    groups.set(key, [...(groups.get(key) ?? []), proposal]);
  }
  const conflicts = [...groups.values()]
    .filter((group) => new Set(group.map((item) => item.label)).size > 1)
    .map((group) => ({
      scenarioId: group[0]!.scenarioId,
      attemptId: group[0]!.attemptId,
      criterionId: group[0]!.criterionId,
      proposalIds: group.map((item) => item.proposalId),
      labels: group.map((item) => item.label),
    }));
  return {
    schemaVersion: "evaluation-annotation-import-batch.v1",
    importedAt: input.importedAt,
    proposals,
    conflicts,
  };
}

export function adjudicateAnnotationProposals(input: {
  batch: AnnotationImportBatchV1;
  decisions: readonly AnnotationAdjudicationDecisionV1[];
}): AnnotationAdjudicationBatchV1 {
  if (input.batch.schemaVersion !== "evaluation-annotation-import-batch.v1") {
    throw new Error("Unsupported annotation import batch");
  }
  const proposals = new Map(input.batch.proposals.map((item) => [item.proposalId, item]));
  const seen = new Set<string>();
  const decisions = input.decisions.map((decision) => {
    if (!decision.decisionId || seen.has(decision.decisionId)) {
      throw new Error(`Duplicate or missing adjudication decision ID: ${decision.decisionId}`);
    }
    seen.add(decision.decisionId);
    if (!decision.adjudicatorRef || !decision.rationale || !decision.decidedAt) {
      throw new Error(`Adjudication ${decision.decisionId} is missing owner, rationale, or time`);
    }
    if (decision.proposalIds.length === 0 || decision.evidenceLocators.length === 0) {
      throw new Error(`Adjudication ${decision.decisionId} requires proposals and evidence`);
    }
    const selected = decision.proposalIds.map((id) => {
      const proposal = proposals.get(id);
      if (!proposal) throw new Error(`Unknown annotation proposal: ${id}`);
      return proposal;
    });
    if (
      selected.some(
        (proposal) =>
          proposal.scenarioId !== decision.scenarioId ||
          proposal.attemptId !== decision.attemptId ||
          proposal.criterionId !== decision.criterionId,
      )
    ) {
      throw new Error(`Adjudication ${decision.decisionId} crosses an atomic criterion boundary`);
    }
    if (decision.outcome === "confirmed") {
      if (!decision.selectedLabel || !LABELS.has(decision.selectedLabel)) {
        throw new Error(`Confirmed adjudication ${decision.decisionId} requires a supported label`);
      }
      const conflicting = input.batch.conflicts.find(
        (conflict) =>
          conflict.scenarioId === decision.scenarioId &&
          conflict.attemptId === decision.attemptId &&
          conflict.criterionId === decision.criterionId,
      );
      if (conflicting && conflicting.proposalIds.some((id) => !decision.proposalIds.includes(id))) {
        throw new Error(`Confirmed adjudication ${decision.decisionId} must address every conflicting label`);
      }
    } else if (decision.selectedLabel !== undefined) {
      throw new Error(`Only a confirmed adjudication may select a gold label`);
    }
    return { ...decision, contentDigest: digestContentDocument(decision) };
  });

  const goldRecords = decisions.flatMap((decision) => {
    if (decision.outcome !== "confirmed" || !decision.selectedLabel) return [];
    const proposal = proposals.get(decision.proposalIds[0]!)!;
    const partial = {
      schemaVersion: "evaluation-human-gold.v1" as const,
      goldId: `human-gold:${decision.decisionId}`,
      scenarioId: decision.scenarioId,
      attemptId: decision.attemptId,
      criterionId: decision.criterionId,
      rubricId: proposal.rubricId,
      rubricVersion: proposal.rubricVersion,
      label: decision.selectedLabel,
      proposalIds: [...decision.proposalIds],
      adjudicationDecisionId: decision.decisionId,
      adjudicatorRef: decision.adjudicatorRef,
      evidenceLocators: [...decision.evidenceLocators],
      createdAt: decision.decidedAt,
    };
    return [{ ...partial, contentDigest: digestContentDocument(partial) }];
  });
  const decidedConflictKeys = new Set(
    decisions
      .filter((item) => item.outcome === "confirmed" || item.outcome === "rejected")
      .map((item) => `${item.scenarioId}\u0000${item.attemptId}\u0000${item.criterionId}`),
  );
  const partial = {
    schemaVersion: "evaluation-annotation-adjudication-batch.v1" as const,
    sourceBatchDigest: digestCanonicalJson(input.batch),
    sourceConflicts: input.batch.conflicts,
    decisions,
    goldRecords,
    unresolvedConflictCount: input.batch.conflicts.filter(
      (item) => !decidedConflictKeys.has(`${item.scenarioId}\u0000${item.attemptId}\u0000${item.criterionId}`),
    ).length,
  };
  return { ...partial, contentDigest: digestContentDocument(partial) };
}

/**
 * Converts a named, content-addressed human-gold record into the core atomic
 * adjudication contract. It does not create a score or grant release
 * authority; callers must still bind it to the matching scenario and attempt.
 */
export function humanGoldToCriterionAdjudication(
  gold: HumanGoldRecordV1,
): CriterionAdjudicationV1 {
  const { contentDigest, ...content } = gold;
  if (gold.schemaVersion !== "evaluation-human-gold.v1") {
    throw new Error(`Unsupported human-gold schema: ${String(gold.schemaVersion)}`);
  }
  if (digestContentDocument(content) !== contentDigest) {
    throw new Error(`Human-gold content digest mismatch: ${gold.goldId}`);
  }
  if (
    !gold.criterionId ||
    !gold.adjudicationDecisionId ||
    !gold.adjudicatorRef ||
    !gold.createdAt ||
    gold.evidenceLocators.length === 0
  ) {
    throw new Error(`Human-gold record lacks atomic human authority: ${gold.goldId}`);
  }
  return {
    criterionId: gold.criterionId,
    status: "human_gold",
    evidence: gold.evidenceLocators.map((artifactId) => ({ artifactId })),
    reviewerId: gold.adjudicatorRef,
    decisionId: gold.adjudicationDecisionId,
    decidedAt: gold.createdAt,
  };
}
