import { Type, type Static } from "@sinclair/typebox";
import { CONTRACT_VERSION } from "./constants.js";
import { LabFailureCategorySchema, LabJobAttemptSchema, LabJobCaseSchema, LabJobDefinitionSchema, LabJobSummarySchema } from "./labJobSchemas.js";
import { LabCIStateSchema, LabReleaseCheckSchema } from "./labCISchemas.js";

const ID = Type.String({ format: "uuid" });
const Hash = Type.String({ pattern: "^[a-f0-9]{64}$" });
const Categories = Type.Array(LabFailureCategorySchema, { minItems: 1, maxItems: 9, uniqueItems: true });
export const LabRegressionRequestSchema = Type.Object({
  id: ID, source_job_id: ID, source_attempt_id: ID, source_definition_hash: Hash,
  failure_categories: Categories, expected_behavior: Type.String({ minLength: 1, maxLength: 2000 }),
  review_note: Type.String({ maxLength: 2000 }),
}, { additionalProperties: false });
export const LabRegressionSnapshotSchema = Type.Object({
  schema_version: Type.Literal("lab-regression.v1"), data_class: Type.Literal("registered_synthetic"),
  task: Type.Optional(LabJobDefinitionSchema.properties.task),
  source_job_id: ID, source_definition_hash: Hash, source_attempt: LabJobAttemptSchema,
  case: LabJobCaseSchema, configurations: LabJobDefinitionSchema.properties.configurations,
  reference_time: Type.String(), backend_revision: Type.Union([Type.String(), Type.Null()]), instrument_revision: Type.String(),
  failure_categories: Categories, expected_behavior: Type.String(), review_note: Type.String(),
  reviewer_id: ID, reviewed_at: Type.String(),
}, { additionalProperties: false });
export const LabRegressionSchema = Type.Object({
  id: ID, content_hash: Hash, snapshot: LabRegressionSnapshotSchema,
  created_at: Type.String(), expires_at: Type.String(),
  release_check: LabReleaseCheckSchema, ci: Type.Optional(LabCIStateSchema), reruns: Type.Array(LabJobSummarySchema),
}, { additionalProperties: false });
export const LabRegressionResponseSchema = Type.Object({ contract_version: Type.Literal(CONTRACT_VERSION), regression: LabRegressionSchema }, { additionalProperties: false });
export const LabRegressionSummarySchema = Type.Object({
  id: ID, content_hash: Hash, title: Type.String(), failure_categories: Categories,
  created_at: Type.String(), expires_at: Type.String(), release_check: LabReleaseCheckSchema,
}, { additionalProperties: false });
export const LabRegressionListSchema = Type.Object({ contract_version: Type.Literal(CONTRACT_VERSION), regressions: Type.Array(LabRegressionSummarySchema) }, { additionalProperties: false });
export const LabRegressionDeletionSchema = Type.Object({
  contract_version: Type.Literal(CONTRACT_VERSION), id: ID, content_hash: Hash,
  status: Type.Literal("deleted"), deleted_at: Type.String(), affected_job_ids: Type.Array(ID),
}, { additionalProperties: false });
export const LabRegressionExportSchema = Type.Object({
  schema_version: Type.Literal("lab-regression-bundle.v1"), execution_authority: Type.Literal("none"),
  id: ID, content_hash: Hash, snapshot: LabRegressionSnapshotSchema, created_at: Type.String(), expires_at: Type.String(),
}, { additionalProperties: false });
export type LabRegressionRequest = Static<typeof LabRegressionRequestSchema>;
export type LabRegressionSnapshot = Static<typeof LabRegressionSnapshotSchema>;
export type LabRegression = Static<typeof LabRegressionSchema>;
export type LabRegressionResponse = Static<typeof LabRegressionResponseSchema>;
export type LabRegressionSummary = Static<typeof LabRegressionSummarySchema>;
export type LabRegressionList = Static<typeof LabRegressionListSchema>;
export type LabRegressionDeletion = Static<typeof LabRegressionDeletionSchema>;
export type LabRegressionExport = Static<typeof LabRegressionExportSchema>;
