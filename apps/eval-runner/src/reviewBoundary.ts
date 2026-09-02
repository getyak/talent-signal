export interface ReviewBoundaryEvidenceV1 {
  evidenceRef: string;
  sourceRef?: string;
}

export interface ReviewBoundaryStateV1 {
  stateRef: string;
  evidenceRefs: string[];
}

export interface ReviewBoundaryInterpretationV1 {
  interpretationRef: string;
  evidenceRefs: string[];
}

export interface ReviewBoundaryActionV1 {
  actionRef: string;
  evidenceRefs: string[];
  requiresHumanReview: boolean;
}

export interface ReviewBoundaryOutcomeV1 {
  outcomeRef: string;
  evidenceRefs: string[];
  status: "observed" | "unknown";
}

export interface ReviewBoundaryV1 {
  schemaVersion: "evaluation-review-boundary.v1";
  evidence: ReviewBoundaryEvidenceV1[];
  confirmedState: ReviewBoundaryStateV1[];
  interpretations: ReviewBoundaryInterpretationV1[];
  proposedActions: ReviewBoundaryActionV1[];
  observedOutcomes: ReviewBoundaryOutcomeV1[];
}

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/;

export function emptyReviewBoundary(evidenceRef?: string): ReviewBoundaryV1 {
  return {
    schemaVersion: "evaluation-review-boundary.v1",
    evidence: evidenceRef ? [{ evidenceRef }] : [],
    confirmedState: [],
    interpretations: [],
    proposedActions: [],
    observedOutcomes: [],
  };
}

export function validateReviewBoundary(value: unknown): ReviewBoundaryV1 {
  const record = exactRecord(value, [
    "schemaVersion",
    "evidence",
    "confirmedState",
    "interpretations",
    "proposedActions",
    "observedOutcomes",
  ], "$reviewBoundary");
  if (record.schemaVersion !== "evaluation-review-boundary.v1") {
    throw new Error("REVIEW_BOUNDARY_SCHEMA_INVALID");
  }
  const evidence = exactArray(record.evidence, "$reviewBoundary/evidence").map((item, index) => {
    const entry = exactRecord(item, ["evidenceRef"], `$reviewBoundary/evidence/${index}`, ["sourceRef"]);
    return {
      evidenceRef: token(entry.evidenceRef, `$reviewBoundary/evidence/${index}/evidenceRef`),
      ...(entry.sourceRef === undefined
        ? {}
        : { sourceRef: token(entry.sourceRef, `$reviewBoundary/evidence/${index}/sourceRef`) }),
    };
  });
  const confirmedState = exactArray(record.confirmedState, "$reviewBoundary/confirmedState").map(
    (item, index) => {
      const entry = exactRecord(item, ["stateRef", "evidenceRefs"], `$reviewBoundary/confirmedState/${index}`);
      return {
        stateRef: token(entry.stateRef, `$reviewBoundary/confirmedState/${index}/stateRef`),
        evidenceRefs: tokenArray(entry.evidenceRefs, `$reviewBoundary/confirmedState/${index}/evidenceRefs`),
      };
    },
  );
  const interpretations = exactArray(record.interpretations, "$reviewBoundary/interpretations").map(
    (item, index) => {
      const entry = exactRecord(item, ["interpretationRef", "evidenceRefs"], `$reviewBoundary/interpretations/${index}`);
      return {
        interpretationRef: token(entry.interpretationRef, `$reviewBoundary/interpretations/${index}/interpretationRef`),
        evidenceRefs: tokenArray(entry.evidenceRefs, `$reviewBoundary/interpretations/${index}/evidenceRefs`),
      };
    },
  );
  const proposedActions = exactArray(record.proposedActions, "$reviewBoundary/proposedActions").map(
    (item, index) => {
      const entry = exactRecord(
        item,
        ["actionRef", "evidenceRefs", "requiresHumanReview"],
        `$reviewBoundary/proposedActions/${index}`,
      );
      if (typeof entry.requiresHumanReview !== "boolean") {
        throw new Error(`REVIEW_BOUNDARY_BOOLEAN_INVALID:$reviewBoundary/proposedActions/${index}`);
      }
      if (!entry.requiresHumanReview) {
        throw new Error(`REVIEW_BOUNDARY_PROPOSAL_REQUIRES_HUMAN_REVIEW:$reviewBoundary/proposedActions/${index}`);
      }
      return {
        actionRef: token(entry.actionRef, `$reviewBoundary/proposedActions/${index}/actionRef`),
        evidenceRefs: tokenArray(entry.evidenceRefs, `$reviewBoundary/proposedActions/${index}/evidenceRefs`),
        requiresHumanReview: entry.requiresHumanReview,
      };
    },
  );
  const observedOutcomes = exactArray(record.observedOutcomes, "$reviewBoundary/observedOutcomes").map(
    (item, index) => {
      const entry = exactRecord(item, ["outcomeRef", "evidenceRefs", "status"], `$reviewBoundary/observedOutcomes/${index}`);
      if (entry.status !== "observed" && entry.status !== "unknown") {
        throw new Error(`REVIEW_BOUNDARY_OUTCOME_STATUS_INVALID:$reviewBoundary/observedOutcomes/${index}`);
      }
      return {
        outcomeRef: token(entry.outcomeRef, `$reviewBoundary/observedOutcomes/${index}/outcomeRef`),
        evidenceRefs: tokenArray(entry.evidenceRefs, `$reviewBoundary/observedOutcomes/${index}/evidenceRefs`),
        status: entry.status as "observed" | "unknown",
      };
    },
  );
  const evidenceRefSet = new Set<string>();
  const allRefSet = new Set<string>();
  for (const item of evidence) {
    if (evidenceRefSet.has(item.evidenceRef)) throw new Error(`REVIEW_BOUNDARY_DUPLICATE_REF:${item.evidenceRef}`);
    evidenceRefSet.add(item.evidenceRef);
    allRefSet.add(item.evidenceRef);
  }
  const assertUnique = (ref: string): void => {
    if (allRefSet.has(ref)) throw new Error(`REVIEW_BOUNDARY_DUPLICATE_REF:${ref}`);
    allRefSet.add(ref);
  };
  const assertEvidenceRefs = (refs: string[], path: string, allowEmpty: boolean): void => {
    if (!allowEmpty && refs.length === 0) throw new Error(`REVIEW_BOUNDARY_EVIDENCE_REQUIRED:${path}`);
    for (const ref of refs) {
      if (!evidenceRefSet.has(ref)) throw new Error(`REVIEW_BOUNDARY_EVIDENCE_UNRESOLVED:${path}:${ref}`);
    }
  };
  confirmedState.forEach((item, index) => {
    assertUnique(item.stateRef);
    assertEvidenceRefs(item.evidenceRefs, `$reviewBoundary/confirmedState/${index}`, false);
  });
  interpretations.forEach((item, index) => {
    assertUnique(item.interpretationRef);
    assertEvidenceRefs(item.evidenceRefs, `$reviewBoundary/interpretations/${index}`, false);
  });
  proposedActions.forEach((item, index) => {
    assertUnique(item.actionRef);
    assertEvidenceRefs(item.evidenceRefs, `$reviewBoundary/proposedActions/${index}`, false);
  });
  observedOutcomes.forEach((item, index) => {
    assertUnique(item.outcomeRef);
    assertEvidenceRefs(
      item.evidenceRefs,
      `$reviewBoundary/observedOutcomes/${index}`,
      item.status === "unknown",
    );
  });
  return {
    schemaVersion: "evaluation-review-boundary.v1",
    evidence,
    confirmedState,
    interpretations,
    proposedActions,
    observedOutcomes,
  };
}

function exactRecord(
  value: unknown,
  requiredKeys: string[],
  path: string,
  optionalKeys: string[] = [],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`REVIEW_BOUNDARY_OBJECT_REQUIRED:${path}`);
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  if (requiredKeys.some((key) => !(key in record)) || Object.keys(record).some((key) => !allowed.has(key))) {
    throw new Error(`REVIEW_BOUNDARY_EXACT_KEYS_REQUIRED:${path}`);
  }
  return record;
}

function exactArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`REVIEW_BOUNDARY_ARRAY_REQUIRED:${path}`);
  return value;
}

function token(value: unknown, path: string): string {
  if (typeof value !== "string" || !TOKEN.test(value)) {
    throw new Error(`REVIEW_BOUNDARY_TOKEN_INVALID:${path}`);
  }
  return value;
}

function tokenArray(value: unknown, path: string): string[] {
  return exactArray(value, path).map((item, index) => token(item, `${path}/${index}`));
}
