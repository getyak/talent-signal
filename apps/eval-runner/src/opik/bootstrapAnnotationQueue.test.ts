import { describe, expect, it } from "vitest";

import type { EvaluationScenarioV1 } from "@talent-signal/evaluation";

import {
  bootstrapHumanWorkflowAnnotationQueue,
  type HumanReviewDefinitionV1,
  type HumanWorkflowRubricV1,
  type OpikAnnotationQueue,
  type OpikAnnotationQueueTransport,
  type OpikAnnotationTrace,
  type OpikCategoricalFeedbackDefinition,
} from "./bootstrapAnnotationQueue.js";

const DIGEST = `sha256:${"a".repeat(64)}` as const;

const scenario = {
  scenarioId: "TS-TRJ-005",
  evaluatorBindings: [
    {
      evaluatorId: "deterministic-safety",
      version: "1",
      contentDigest: DIGEST,
      kind: "deterministic",
      criterionIds: ["terminal.truthful"],
      requiredForGate: true,
    },
    {
      evaluatorId: "human-workflow",
      version: "1",
      contentDigest: DIGEST,
      kind: "human",
      criterionIds: ["workflow.useful-next-step", "workflow.no-action-restraint"],
      requiredForGate: true,
    },
  ],
} satisfies Pick<EvaluationScenarioV1, "scenarioId" | "evaluatorBindings">;

const definition: HumanReviewDefinitionV1 = {
  schemaVersion: "evaluation-feedback-definitions.v1",
  definitionId: "talent-signal-human-review",
  version: "1",
  rubric: { rubricId: "human-workflow", version: "1", contentDigest: DIGEST },
  unitOfReview: "one scenario-attempt-criterion",
  labels: [
    "accept",
    "accept_with_edits",
    "reject",
    "wrong_person",
    "wrong_speaker",
    "missing_evidence",
    "stale",
    "unnecessary_research",
    "unsafe_action",
  ].map((label) => ({
    label: label as HumanReviewDefinitionV1["labels"][number]["label"],
    meaning: label,
    goldEffect: "proposal_only",
  })),
  constraints: {
    evidenceLocatorRequired: true,
    importedAnnotationsAreGold: false,
    explicitAdjudicationRequiredForGold: true,
    candidateRankingProhibited: true,
  },
};

const rubric: HumanWorkflowRubricV1 = {
  schemaVersion: "evaluation-rubric.v1",
  rubricId: "human-workflow",
  version: "1",
  contentDigest: DIGEST,
  criteria: [
    {
      criterionId: "workflow.useful-next-step",
      description: "The proposed next step is proportionate to the current Pursuit evidence.",
      evidenceRequired: "Scenario evidence and proposed action.",
      passCondition: "Reviewer accepts with evidence.",
      failureDisposition: "needs_review",
    },
    {
      criterionId: "workflow.no-action-restraint",
      description: "No-action is used when the source creates no material change.",
      evidenceRequired: "Source and current state comparison.",
      passCondition: "Reviewer accepts no-action.",
      failureDisposition: "needs_review",
    },
  ],
};

class FakeTransport implements OpikAnnotationQueueTransport {
  definitions: OpikCategoricalFeedbackDefinition[] = [];
  queues: OpikAnnotationQueue[] = [];
  traces = new Map<string, OpikAnnotationTrace>();
  queueItems = new Map<string, Set<string>>();
  createDefinitionCalls = 0;
  createQueueCalls = 0;
  addItemsCalls = 0;

  async listFeedbackDefinitions(): Promise<OpikCategoricalFeedbackDefinition[]> {
    return structuredClone(this.definitions);
  }

  async createFeedbackDefinition(definition: OpikCategoricalFeedbackDefinition): Promise<void> {
    this.createDefinitionCalls++;
    this.definitions.push({ ...structuredClone(definition), id: `definition-${this.definitions.length + 1}` });
  }

  async listAnnotationQueues(projectId: string): Promise<OpikAnnotationQueue[]> {
    return structuredClone(this.queues.filter((item) => item.project_id === projectId));
  }

  async createAnnotationQueue(
    queue: Omit<OpikAnnotationQueue, "id" | "items_count">,
  ): Promise<void> {
    this.createQueueCalls++;
    const id = `queue-${this.queues.length + 1}`;
    this.queues.push({ ...structuredClone(queue), id, items_count: 0 });
    this.queueItems.set(id, new Set());
  }

  async getTrace(traceId: string): Promise<OpikAnnotationTrace> {
    const trace = this.traces.get(traceId);
    if (!trace) throw new Error(`missing trace ${traceId}`);
    return structuredClone(trace);
  }

  async listAnnotationQueueItemIds(_projectId: string, queueId: string): Promise<string[]> {
    return [...(this.queueItems.get(queueId) ?? new Set())];
  }

  async addAnnotationQueueItems(queueId: string, traceIds: string[]): Promise<void> {
    this.addItemsCalls++;
    const items = this.queueItems.get(queueId);
    if (!items) throw new Error(`missing queue ${queueId}`);
    traceIds.forEach((traceId) => items.add(traceId));
    const queue = this.queues.find((item) => item.id === queueId);
    if (queue) queue.items_count = items.size;
  }
}

function addAuthorizedTrace(transport: FakeTransport, traceId: string): void {
  transport.traces.set(traceId, {
    id: traceId,
    project_id: "project-1",
    name: "evaluation:TS-TRJ-005",
    input: { scenario_id: "TS-TRJ-005" },
    metadata: { data_class: "synthetic_shareable" },
  });
}

describe("bootstrapHumanWorkflowAnnotationQueue", () => {
  it("creates an exact proposal-only queue once and noops on replay", async () => {
    const transport = new FakeTransport();
    addAuthorizedTrace(transport, "trace-1");
    addAuthorizedTrace(transport, "trace-2");
    const input = {
      projectId: "project-1",
      queueName: "talent-signal-p0-human-workflow-v1",
      scenario,
      traceIds: ["trace-1", "trace-2"],
      definition,
      rubric,
      transport,
    };

    const first = await bootstrapHumanWorkflowAnnotationQueue(input);
    const second = await bootstrapHumanWorkflowAnnotationQueue(input);

    expect(first).toMatchObject({
      queueOperation: "create",
      addedTraceIds: ["trace-1", "trace-2"],
      authority: "proposal_only",
    });
    expect(second).toMatchObject({
      queueOperation: "noop",
      addedTraceIds: [],
      existingTraceIds: ["trace-1", "trace-2"],
      authority: "proposal_only",
    });
    expect(transport.createDefinitionCalls).toBe(2);
    expect(transport.createQueueCalls).toBe(1);
    expect(transport.addItemsCalls).toBe(1);
    expect(transport.queues[0]).toMatchObject({
      annotators_per_item: 1,
      lock_timeout_seconds: 900,
      comments_enabled: true,
      items_count: 2,
    });
  });

  it("rejects a conflicting definition instead of silently changing rubric semantics", async () => {
    const transport = new FakeTransport();
    addAuthorizedTrace(transport, "trace-1");
    transport.definitions.push({
      name: "workflow.useful-next-step@human-workflow.v1",
      description: "wrong definition",
      type: "categorical",
      details: { categories: { accept: 1, reject: 0 } },
    });

    await expect(
      bootstrapHumanWorkflowAnnotationQueue({
        projectId: "project-1",
        queueName: "queue",
        scenario,
        traceIds: ["trace-1"],
        definition,
        rubric,
        transport,
      }),
    ).rejects.toThrow(/OPIK_FEEDBACK_DEFINITION_CONFLICT/);
    expect(transport.createQueueCalls).toBe(0);
    expect(transport.addItemsCalls).toBe(0);
  });

  it("rejects non-shareable traces before writing any annotation configuration", async () => {
    const transport = new FakeTransport();
    transport.traces.set("trace-private", {
      id: "trace-private",
      project_id: "project-1",
      name: "evaluation:TS-TRJ-005",
      input: { scenario_id: "TS-TRJ-005" },
      metadata: { data_class: "private_reference_only" },
    });

    await expect(
      bootstrapHumanWorkflowAnnotationQueue({
        projectId: "project-1",
        queueName: "queue",
        scenario,
        traceIds: ["trace-private"],
        definition,
        rubric,
        transport,
      }),
    ).rejects.toThrow(/OPIK_ANNOTATION_TRACE_NOT_AUTHORIZED/);
    expect(transport.createDefinitionCalls).toBe(0);
    expect(transport.createQueueCalls).toBe(0);
    expect(transport.addItemsCalls).toBe(0);
  });
});
