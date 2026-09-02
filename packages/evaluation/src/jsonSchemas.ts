const DIGEST_PATTERN = "^sha256:[a-f0-9]{64}$";
const NON_EMPTY_STRING = { type: "string", minLength: 1 } as const;
const DIGEST = { type: "string", pattern: DIGEST_PATTERN } as const;

const CONTENT_IDENTITY = {
  type: "object",
  additionalProperties: false,
  required: ["identityId", "version", "contentDigest"],
  properties: {
    identityId: NON_EMPTY_STRING,
    version: NON_EMPTY_STRING,
    contentDigest: DIGEST,
  },
} as const;

const FIXTURE_REFERENCE = {
  type: "object",
  additionalProperties: false,
  required: ["fixtureId", "path", "contentDigest"],
  properties: {
    fixtureId: NON_EMPTY_STRING,
    path: NON_EMPTY_STRING,
    contentDigest: DIGEST,
  },
} as const;

const COMPONENT = {
  enum: [
    "capture",
    "perception",
    "identity",
    "memory",
    "agent_policy",
    "model",
    "search",
    "effect_adapter",
  ],
} as const;

const FROZEN_DEPENDENCY = {
  type: "object",
  additionalProperties: false,
  required: ["bindingId", "component", "fixture", "reason"],
  properties: {
    bindingId: NON_EMPTY_STRING,
    component: COMPONENT,
    fixture: FIXTURE_REFERENCE,
    reason: NON_EMPTY_STRING,
  },
} as const;

const LIVE_DEPENDENCY = {
  type: "object",
  additionalProperties: false,
  required: ["bindingId", "component", "implementation", "reason"],
  properties: {
    bindingId: NON_EMPTY_STRING,
    component: COMPONENT,
    implementation: CONTENT_IDENTITY,
    reason: NON_EMPTY_STRING,
  },
} as const;

const VERSIONED_BINDING = {
  type: "object",
  additionalProperties: false,
  required: ["bindingId", "mode", "version", "contentDigest"],
  properties: {
    bindingId: NON_EMPTY_STRING,
    mode: NON_EMPTY_STRING,
    version: NON_EMPTY_STRING,
    contentDigest: DIGEST,
  },
} as const;

export const evaluationScenarioDocumentSchemaV1 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://talent-signal.local/schemas/evaluation-scenario.v1.json",
  title: "EvaluationScenarioDocumentV1",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "scenarioId",
    "revision",
    "contentDigest",
    "title",
    "purpose",
    "suiteIds",
    "riskTier",
    "lifecycle",
    "adjudication",
    "partition",
    "compatibleProfileIds",
    "criterionAdjudications",
    "dataPolicy",
    "modelInputRef",
    "initialStateRef",
    "oracleRef",
    "evaluatorBindings",
    "slices",
    "lineage",
  ],
  properties: {
    schemaVersion: { const: "evaluation-scenario.v1" },
    scenarioId: NON_EMPTY_STRING,
    revision: NON_EMPTY_STRING,
    contentDigest: DIGEST,
    title: NON_EMPTY_STRING,
    purpose: NON_EMPTY_STRING,
    suiteIds: { type: "array", minItems: 1, uniqueItems: true, items: NON_EMPTY_STRING },
    riskTier: { enum: ["p0_blocker", "p1_core", "p2_quality"] },
    lifecycle: { enum: ["draft", "active", "retired"] },
    adjudication: { enum: ["unreviewed", "human_gold", "disputed"] },
    partition: { enum: ["p0", "dev", "held_out", "red_team"] },
    compatibleProfileIds: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: NON_EMPTY_STRING,
    },
    criterionAdjudications: {
      type: "array",
      uniqueItems: true,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["criterionId", "status", "evidence"],
        properties: {
          criterionId: NON_EMPTY_STRING,
          status: { enum: ["unreviewed", "human_gold", "disputed"] },
          evidence: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["artifactId"],
              properties: {
                artifactId: NON_EMPTY_STRING,
                jsonPointer: NON_EMPTY_STRING,
                sourceRef: NON_EMPTY_STRING,
              },
            },
          },
          reviewerId: NON_EMPTY_STRING,
          decisionId: NON_EMPTY_STRING,
          decidedAt: { type: "string", format: "date-time" },
        },
      },
    },
    dataPolicy: {
      type: "object",
      additionalProperties: false,
      required: ["dataClass", "containsRealCandidateData", "projection"],
      properties: {
        dataClass: {
          enum: [
            "synthetic_shareable",
            "synthetic_restricted",
            "deidentified_governed",
            "private_reference_only",
            "prohibited_export",
          ],
        },
        containsRealCandidateData: { type: "boolean" },
        projection: { enum: ["synthetic_content_opt_in", "metadata_only", "prohibited"] },
      },
    },
    modelInputRef: FIXTURE_REFERENCE,
    initialStateRef: FIXTURE_REFERENCE,
    oracleRef: FIXTURE_REFERENCE,
    evaluatorBindings: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "evaluatorId",
          "version",
          "contentDigest",
          "kind",
          "criterionIds",
          "requiredForGate",
        ],
        properties: {
          evaluatorId: NON_EMPTY_STRING,
          version: NON_EMPTY_STRING,
          contentDigest: DIGEST,
          kind: { enum: ["deterministic", "human", "model", "outcome"] },
          criterionIds: {
            type: "array",
            minItems: 1,
            uniqueItems: true,
            items: NON_EMPTY_STRING,
          },
          requiredForGate: { type: "boolean" },
        },
      },
    },
    slices: { type: "object", additionalProperties: { type: "string" } },
    lineage: {
      type: "object",
      additionalProperties: false,
      required: ["sourceKind", "sourceIds"],
      properties: {
        sourceKind: { enum: ["native", "legacy_adapter", "governed_case_proposal"] },
        sourceIds: { type: "array", minItems: 1, uniqueItems: true, items: NON_EMPTY_STRING },
        previousRevision: NON_EMPTY_STRING,
        previousDigest: DIGEST,
        authorizationRef: NON_EMPTY_STRING,
      },
    },
  },
} as const;

export const evaluationExecutionProfileSchemaV1 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://talent-signal.local/schemas/evaluation-profile.v1.json",
  title: "EvaluationExecutionProfileV1",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "profileId",
    "version",
    "contentDigest",
    "mode",
    "systemUnderTest",
    "frozenDependencies",
    "liveDependencies",
    "clock",
    "idGenerator",
    "timer",
    "budgets",
    "reporters",
  ],
  properties: {
    schemaVersion: { const: "evaluation-profile.v1" },
    profileId: NON_EMPTY_STRING,
    version: NON_EMPTY_STRING,
    contentDigest: DIGEST,
    mode: { enum: ["control_plane_replay", "model_replay", "integration_probe"] },
    systemUnderTest: { type: "array", minItems: 1, uniqueItems: true, items: COMPONENT },
    frozenDependencies: { type: "array", items: FROZEN_DEPENDENCY },
    liveDependencies: { type: "array", items: LIVE_DEPENDENCY },
    clock: {
      ...VERSIONED_BINDING,
      properties: { ...VERSIONED_BINDING.properties, mode: { enum: ["system", "frozen", "controlled"] } },
    },
    idGenerator: {
      ...VERSIONED_BINDING,
      properties: { ...VERSIONED_BINDING.properties, mode: { enum: ["system", "deterministic"] } },
    },
    timer: {
      ...VERSIONED_BINDING,
      properties: { ...VERSIONED_BINDING.properties, mode: { enum: ["system", "controlled"] } },
    },
    budgets: {
      type: "object",
      additionalProperties: false,
      required: ["maximumSteps", "maximumToolCalls", "maximumDurationMs", "maximumRetries"],
      properties: {
        maximumSteps: { type: "integer", minimum: 1 },
        maximumToolCalls: { type: "integer", minimum: 0 },
        maximumDurationMs: { type: "integer", minimum: 1 },
        maximumRetries: { type: "integer", minimum: 0 },
      },
    },
    reporters: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["reporterId", "version", "destination", "contentDigest", "required"],
        properties: {
          reporterId: NON_EMPTY_STRING,
          version: NON_EMPTY_STRING,
          destination: { enum: ["local", "opik", "other"] },
          contentDigest: DIGEST,
          required: { type: "boolean" },
        },
      },
    },
  },
} as const;

export const evaluationAttemptSchemaV1 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://talent-signal.local/schemas/evaluation-attempt.v1.json",
  title: "EvaluationAttemptV1",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "attemptId",
    "contentDigest",
    "scenario",
    "profile",
    "agentDefinition",
    "trialNumber",
    "gitSha",
    "systemUnderTest",
    "frozenDependencies",
    "fingerprints",
    "startedAt",
  ],
  properties: {
    schemaVersion: { const: "evaluation-attempt.v1" },
    attemptId: NON_EMPTY_STRING,
    contentDigest: DIGEST,
    scenario: CONTENT_IDENTITY,
    profile: CONTENT_IDENTITY,
    agentDefinition: {
      type: "object",
      additionalProperties: false,
      required: ["definitionId", "version", "contentDigest"],
      properties: {
        definitionId: NON_EMPTY_STRING,
        version: NON_EMPTY_STRING,
        contentDigest: DIGEST,
      },
    },
    trialNumber: { type: "integer", minimum: 1 },
    gitSha: { type: "string", pattern: "^[a-f0-9]{7,64}$" },
    systemUnderTest: { type: "array", minItems: 1, uniqueItems: true, items: COMPONENT },
    frozenDependencies: { type: "array", items: FROZEN_DEPENDENCY },
    fingerprints: {
      type: "object",
      additionalProperties: false,
      required: [
        "provider",
        "model",
        "prompt",
        "policy",
        "toolManifest",
        "sdk",
        "rubric",
        "exportPolicy",
        "context",
      ],
      properties: {
        provider: CONTENT_IDENTITY,
        model: CONTENT_IDENTITY,
        prompt: CONTENT_IDENTITY,
        policy: CONTENT_IDENTITY,
        toolManifest: CONTENT_IDENTITY,
        sdk: CONTENT_IDENTITY,
        rubric: CONTENT_IDENTITY,
        exportPolicy: CONTENT_IDENTITY,
        context: CONTENT_IDENTITY,
      },
    },
    startedAt: { type: "string", format: "date-time" },
  },
} as const;

export const evaluationSuiteSchemaV1 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://talent-signal.local/schemas/evaluation-suite.v1.json",
  title: "EvaluationSuiteV1",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "suiteId", "version", "contentDigest", "title", "purpose", "scenarios", "lineage"],
  properties: {
    schemaVersion: { const: "evaluation-suite.v1" },
    suiteId: NON_EMPTY_STRING,
    version: NON_EMPTY_STRING,
    contentDigest: DIGEST,
    title: NON_EMPTY_STRING,
    purpose: NON_EMPTY_STRING,
    scenarios: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["scenarioId", "revision", "contentDigest", "lifecycle", "adjudication", "criterionAdjudicationDigest", "partition", "dataClass"],
        properties: {
          scenarioId: NON_EMPTY_STRING,
          revision: NON_EMPTY_STRING,
          contentDigest: DIGEST,
          lifecycle: { enum: ["draft", "active", "retired"] },
          adjudication: { enum: ["unreviewed", "human_gold", "disputed"] },
          criterionAdjudicationDigest: DIGEST,
          partition: { enum: ["p0", "dev", "held_out", "red_team"] },
          dataClass: {
            enum: [
              "synthetic_shareable",
              "synthetic_restricted",
              "deidentified_governed",
              "private_reference_only",
              "prohibited_export",
            ],
          },
        },
      },
    },
    lineage: evaluationScenarioDocumentSchemaV1.properties.lineage,
  },
} as const;

export const evaluationJsonSchemasV1 = {
  scenario: evaluationScenarioDocumentSchemaV1,
  profile: evaluationExecutionProfileSchemaV1,
  attempt: evaluationAttemptSchemaV1,
  suite: evaluationSuiteSchemaV1,
} as const;
