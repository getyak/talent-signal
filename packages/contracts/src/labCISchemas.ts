import { Type, type Static } from "@sinclair/typebox";

const ID = Type.String({ format: "uuid" });
const Hash = Type.String({ pattern: "^[a-f0-9]{64}$" });
export const LabCIRequestSchema = Type.Object({
  id: ID, regression_content_hash: Hash, job_id: ID, github_run_id: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
}, { additionalProperties: false });
export const LabCIReceiptSchema = Type.Object({
  id: ID, regression_id: ID, regression_content_hash: Hash, job_id: ID,
  state: Type.Union([Type.Literal("verified"), Type.Literal("not_verified")]),
  reason_code: Type.String(), checked_at: Type.String(), valid_until: Type.String(),
  repository: Type.String(), trust_digest: Type.String({ pattern: "^sha256:[a-f0-9]{64}$" }), github_run_id: Type.Integer(), github_run_attempt: Type.Union([Type.Integer(), Type.Null()]),
  github_job_id: Type.Union([Type.Integer(), Type.Null()]), artifact_id: Type.Union([Type.Integer(), Type.Null()]),
  artifact_digest: Type.Union([Type.String(), Type.Null()]), report_digest: Type.Union([Type.String(), Type.Null()]),
  source_revision: Type.Union([Type.String(), Type.Null()]),
  backend_revision: Type.Union([Type.String(), Type.Null()]),
  workflow_conclusion: Type.Union([Type.String(), Type.Null()]), job_conclusion: Type.Union([Type.String(), Type.Null()]),
  integrity: Type.Union([Type.Literal("pass"), Type.Literal("fail"), Type.Literal("not_run"), Type.Null()]),
  quality: Type.Literal("needs_review"), release_enforcement: Type.Literal("not_verified"),
}, { additionalProperties: false });
export const LabCIStateSchema = Type.Object({ available: Type.Boolean(), repository: Type.Union([Type.String(), Type.Null()]), latest: Type.Union([LabCIReceiptSchema, Type.Null()]) }, { additionalProperties: false });
export const LabReleaseCheckSchema = Type.Union([Type.Literal("not_connected"), Type.Literal("ci_verified"), Type.Literal("ci_needs_refresh")]);
export type LabCIRequest = Static<typeof LabCIRequestSchema>;
export type LabCIReceipt = Static<typeof LabCIReceiptSchema>;
export type LabCIState = Static<typeof LabCIStateSchema>;
