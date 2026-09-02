import type { EvaluationScenarioV1 } from "@talent-signal/evaluation";

const LABEL_CODES = {
  accept: 1,
  accept_with_edits: 2,
  reject: 3,
  wrong_person: 10,
  wrong_speaker: 11,
  missing_evidence: 12,
  stale: 13,
  unnecessary_research: 14,
  unsafe_action: 15,
} as const;

type HumanReviewLabel = keyof typeof LABEL_CODES;

export interface HumanReviewDefinitionV1 {
  schemaVersion: "evaluation-feedback-definitions.v1";
  definitionId: string;
  version: string;
  rubric: {
    rubricId: string;
    version: string;
    contentDigest: string;
  };
  unitOfReview: "one scenario-attempt-criterion";
  labels: Array<{
    label: HumanReviewLabel;
    meaning: string;
    goldEffect: string;
  }>;
  constraints: {
    evidenceLocatorRequired: boolean;
    importedAnnotationsAreGold: boolean;
    explicitAdjudicationRequiredForGold: boolean;
    candidateRankingProhibited: boolean;
  };
}

export interface HumanWorkflowRubricV1 {
  schemaVersion: "evaluation-rubric.v1";
  rubricId: string;
  version: string;
  contentDigest: string;
  criteria: Array<{
    criterionId: string;
    description: string;
    evidenceRequired: string;
    passCondition: string;
    failureDisposition: string;
  }>;
}

export interface OpikCategoricalFeedbackDefinition {
  id?: string;
  name: string;
  description?: string;
  type: "categorical";
  details: { categories: Record<string, number> };
}

export interface OpikAnnotationQueue {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  instructions?: string;
  scope: "trace";
  comments_enabled: boolean;
  feedback_definition_names: string[];
  annotators_per_item?: number;
  lock_timeout_seconds?: number;
  items_count: number;
}

export interface OpikAnnotationTrace {
  id: string;
  project_id: string;
  name: string;
  input?: unknown;
  metadata?: unknown;
}

export interface OpikAnnotationQueueTransport {
  listFeedbackDefinitions(): Promise<OpikCategoricalFeedbackDefinition[]>;
  createFeedbackDefinition(definition: OpikCategoricalFeedbackDefinition): Promise<void>;
  listAnnotationQueues(projectId: string): Promise<OpikAnnotationQueue[]>;
  createAnnotationQueue(queue: Omit<OpikAnnotationQueue, "id" | "items_count">): Promise<void>;
  getTrace(traceId: string): Promise<OpikAnnotationTrace>;
  listAnnotationQueueItemIds(projectId: string, queueId: string): Promise<string[]>;
  addAnnotationQueueItems(queueId: string, traceIds: string[]): Promise<void>;
}

export interface AnnotationQueueBootstrapResultV1 {
  schemaVersion: "evaluation-opik-annotation-bootstrap.v1";
  projectId: string;
  scenarioId: string;
  queueId: string;
  queueName: string;
  feedbackDefinitionNames: string[];
  createdFeedbackDefinitionNames: string[];
  queueOperation: "create" | "noop";
  addedTraceIds: string[];
  existingTraceIds: string[];
  annotationPath: string;
  authority: "proposal_only";
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function feedbackDefinitionName(criterionId: string, rubric: HumanWorkflowRubricV1): string {
  return `${criterionId}@${rubric.rubricId}.v${rubric.version}`;
}

function feedbackDefinitionDescription(
  criterion: HumanWorkflowRubricV1["criteria"][number],
): string {
  if (criterion.criterionId === "workflow.useful-next-step") {
    return "Atomic human-workflow label for whether the proposed next step is proportionate to the current Pursuit evidence. Numeric category values are stable enum codes, not ordinal quality scores; averages are not meaningful.";
  }
  if (criterion.criterionId === "workflow.no-action-restraint") {
    return "Atomic human-workflow label for whether no_action is used when the source creates no material change. Numeric category values are stable enum codes, not ordinal quality scores; averages are not meaningful.";
  }
  return `Atomic human-workflow label for ${criterion.description.charAt(0).toLowerCase()}${criterion.description.slice(1)} Numeric category values are stable enum codes, not ordinal quality scores; averages are not meaningful.`;
}

function queueInstructions(): string {
  return "Review one synthetic scenario-attempt at a time. Score each listed atomic criterion independently against the Trace input, output, and source-bound evidence. Do not assess candidate merit, fit, personality, protected traits, or acceptance probability. For every score, add a comment containing: criterion ID; selected label; exact evidence locator; concise rationale; any required correction; and review elapsed seconds. Choose missing_evidence when the required evidence cannot be located. A submitted annotation is an unreviewed proposal only; it does not create human gold or release authority until separate adjudication.";
}

function assertHumanReviewContract(
  definition: HumanReviewDefinitionV1,
  rubric: HumanWorkflowRubricV1,
): void {
  if (
    definition.schemaVersion !== "evaluation-feedback-definitions.v1" ||
    definition.unitOfReview !== "one scenario-attempt-criterion" ||
    definition.rubric.rubricId !== rubric.rubricId ||
    definition.rubric.version !== rubric.version ||
    definition.rubric.contentDigest !== rubric.contentDigest
  ) {
    throw new Error("OPIK_ANNOTATION_CONTRACT_MISMATCH: feedback definition and rubric differ");
  }
  if (
    !definition.constraints.evidenceLocatorRequired ||
    definition.constraints.importedAnnotationsAreGold ||
    !definition.constraints.explicitAdjudicationRequiredForGold ||
    !definition.constraints.candidateRankingProhibited
  ) {
    throw new Error("OPIK_ANNOTATION_AUTHORITY_INVALID: the human review boundary is unsafe");
  }
  const labels = definition.labels.map((item) => item.label);
  if (canonical(labels.slice().sort()) !== canonical(Object.keys(LABEL_CODES).sort())) {
    throw new Error("OPIK_ANNOTATION_LABELS_INVALID: labels do not match the import contract");
  }
}

function assertMatchingFeedbackDefinition(
  existing: OpikCategoricalFeedbackDefinition,
  desired: OpikCategoricalFeedbackDefinition,
): void {
  if (
    existing.type !== desired.type ||
    existing.description !== desired.description ||
    canonical(existing.details) !== canonical(desired.details)
  ) {
    throw new Error(`OPIK_FEEDBACK_DEFINITION_CONFLICT: ${desired.name}`);
  }
}

function assertMatchingQueue(
  existing: OpikAnnotationQueue,
  desired: Omit<OpikAnnotationQueue, "id" | "items_count">,
): void {
  const comparableExisting = {
    project_id: existing.project_id,
    name: existing.name,
    description: existing.description,
    instructions: existing.instructions,
    scope: existing.scope,
    comments_enabled: existing.comments_enabled,
    feedback_definition_names: existing.feedback_definition_names,
    annotators_per_item: existing.annotators_per_item,
    lock_timeout_seconds: existing.lock_timeout_seconds,
  };
  if (canonical(comparableExisting) !== canonical(desired)) {
    throw new Error(`OPIK_ANNOTATION_QUEUE_CONFLICT: ${desired.name}`);
  }
}

function assertSyntheticScenarioTrace(trace: OpikAnnotationTrace, projectId: string, scenarioId: string): void {
  const metadata = trace.metadata;
  const input = trace.input;
  const dataClass =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).data_class
      : undefined;
  const remoteScenarioId =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>).scenario_id
      : undefined;
  if (
    trace.project_id !== projectId ||
    trace.name !== `evaluation:${scenarioId}` ||
    dataClass !== "synthetic_shareable" ||
    remoteScenarioId !== scenarioId
  ) {
    throw new Error(`OPIK_ANNOTATION_TRACE_NOT_AUTHORIZED: ${trace.id}`);
  }
}

export async function bootstrapHumanWorkflowAnnotationQueue(input: {
  projectId: string;
  queueName: string;
  scenario: Pick<EvaluationScenarioV1, "scenarioId" | "evaluatorBindings">;
  traceIds: string[];
  definition: HumanReviewDefinitionV1;
  rubric: HumanWorkflowRubricV1;
  transport: OpikAnnotationQueueTransport;
}): Promise<AnnotationQueueBootstrapResultV1> {
  if (input.traceIds.length === 0 || new Set(input.traceIds).size !== input.traceIds.length) {
    throw new Error("OPIK_ANNOTATION_TRACE_IDS_INVALID: trace IDs must be non-empty and unique");
  }
  assertHumanReviewContract(input.definition, input.rubric);
  const binding = input.scenario.evaluatorBindings.find(
    (item) => item.kind === "human" && item.evaluatorId === input.rubric.rubricId,
  );
  if (!binding || binding.version !== input.rubric.version) {
    throw new Error(`OPIK_ANNOTATION_RUBRIC_NOT_BOUND: ${input.scenario.scenarioId}`);
  }
  const criteria = binding.criterionIds.map((criterionId) => {
    const criterion = input.rubric.criteria.find((item) => item.criterionId === criterionId);
    if (!criterion) throw new Error(`OPIK_ANNOTATION_CRITERION_UNKNOWN: ${criterionId}`);
    return criterion;
  });
  // Resolve and authorize every remote item before creating definitions or a
  // queue. A rejected trace must leave no partial annotation configuration.
  const traces = await Promise.all(input.traceIds.map((traceId) => input.transport.getTrace(traceId)));
  traces.forEach((trace) => assertSyntheticScenarioTrace(trace, input.projectId, input.scenario.scenarioId));
  const desiredDefinitions = criteria.map(
    (criterion): OpikCategoricalFeedbackDefinition => ({
      name: feedbackDefinitionName(criterion.criterionId, input.rubric),
      description: feedbackDefinitionDescription(criterion),
      type: "categorical",
      details: { categories: { ...LABEL_CODES } },
    }),
  );
  const existingDefinitions = await input.transport.listFeedbackDefinitions();
  const createdFeedbackDefinitionNames: string[] = [];
  for (const desired of desiredDefinitions) {
    const existing = existingDefinitions.find((item) => item.name === desired.name);
    if (existing) assertMatchingFeedbackDefinition(existing, desired);
    else {
      await input.transport.createFeedbackDefinition(desired);
      createdFeedbackDefinitionNames.push(desired.name);
    }
  }

  const desiredQueue = {
    project_id: input.projectId,
    name: input.queueName,
    description: `Synthetic P0 human-workflow review for ${input.scenario.scenarioId}. Proposal-only annotations; separate adjudication is required before any gate authority.`,
    instructions: queueInstructions(),
    scope: "trace" as const,
    comments_enabled: true,
    feedback_definition_names: desiredDefinitions.map((item) => item.name),
    annotators_per_item: 1,
    lock_timeout_seconds: 900,
  };
  let queues = await input.transport.listAnnotationQueues(input.projectId);
  let queue = queues.find((item) => item.name === input.queueName);
  let queueOperation: AnnotationQueueBootstrapResultV1["queueOperation"] = "noop";
  if (queue) assertMatchingQueue(queue, desiredQueue);
  else {
    await input.transport.createAnnotationQueue(desiredQueue);
    queueOperation = "create";
    queues = await input.transport.listAnnotationQueues(input.projectId);
    queue = queues.find((item) => item.name === input.queueName);
    if (!queue) throw new Error(`OPIK_ANNOTATION_QUEUE_READBACK_FAILED: ${input.queueName}`);
    assertMatchingQueue(queue, desiredQueue);
  }

  const existingTraceIds = await input.transport.listAnnotationQueueItemIds(input.projectId, queue.id);
  const existing = new Set(existingTraceIds);
  const addedTraceIds = input.traceIds.filter((traceId) => !existing.has(traceId));
  if (addedTraceIds.length > 0) await input.transport.addAnnotationQueueItems(queue.id, addedTraceIds);
  const readback = await input.transport.listAnnotationQueueItemIds(input.projectId, queue.id);
  const readbackSet = new Set(readback);
  if (input.traceIds.some((traceId) => !readbackSet.has(traceId))) {
    throw new Error(`OPIK_ANNOTATION_QUEUE_ITEM_READBACK_FAILED: ${queue.id}`);
  }
  return {
    schemaVersion: "evaluation-opik-annotation-bootstrap.v1",
    projectId: input.projectId,
    scenarioId: input.scenario.scenarioId,
    queueId: queue.id,
    queueName: queue.name,
    feedbackDefinitionNames: desiredDefinitions.map((item) => item.name),
    createdFeedbackDefinitionNames,
    queueOperation,
    addedTraceIds,
    existingTraceIds: input.traceIds.filter((traceId) => existing.has(traceId)),
    annotationPath: `/default/sme?queueId=${queue.id}`,
    authority: "proposal_only",
  };
}
