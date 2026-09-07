import { LabRegressionExportSchema, type LabRegressionExport } from "@talent-signal/contracts";
import { Value } from "@sinclair/typebox/value";
import { digestCanonicalJson } from "@talent-signal/evaluation";
import { labReadbackURL } from "../labRegressionReadback.js";
import { validateOptimizationRelationshipInput, type OptimizationRelationshipInput } from "./productTask.js";

export interface OptimizationFeedbackBinding {
  target: "case" | "example";
  targetId: string;
  regressionId: string;
  contentHash: string;
  feedbackId: string;
  feedbackRevision: number;
  executionId: string;
  expiresAt: string;
  expectationAuthority: "proposal";
}
export interface OptimizationFeedbackProposal {
  caseId: string;
  feedbackId: string;
  feedbackRevision: number;
  expectationAuthority: "proposal";
  text: string;
}
const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function isOptimizationFeedbackSourceInvalidated(error: unknown): boolean {
  return error instanceof Error && ["OPTIMIZATION_FEEDBACK_READBACK_404", "OPTIMIZATION_FEEDBACK_READBACK_410",
    "OPTIMIZATION_FEEDBACK_SOURCE_UNAVAILABLE", "OPTIMIZATION_FEEDBACK_SOURCE_CHANGED", "OPTIMIZATION_FEEDBACK_INPUT_CHANGED",
    "OPTIMIZATION_FEEDBACK_INPUT_DIGEST_MISMATCH", "OPTIMIZATION_FEEDBACK_REFERENCE_MISMATCH"].includes(error.message);
}
export function validateOptimizationFeedbackBinding(value: OptimizationFeedbackBinding): void {
  const keys = ["target", "targetId", "regressionId", "contentHash", "feedbackId", "feedbackRevision", "executionId", "expiresAt", "expectationAuthority"];
  if (!value || Object.keys(value).sort().join(",") !== keys.sort().join(",")
    || !["case", "example"].includes(value.target) || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(value.targetId)
    || ![value.regressionId, value.feedbackId, value.executionId].every(id => uuid.test(id))
    || !/^[a-f0-9]{64}$/.test(value.contentHash) || !Number.isSafeInteger(value.feedbackRevision) || value.feedbackRevision < 1
    || !Number.isFinite(Date.parse(value.expiresAt)) || value.expectationAuthority !== "proposal") throw new Error("OPTIMIZATION_FEEDBACK_BINDING_INVALID");
}
export async function readOptimizationFeedbackSource(input: {
  baseURL: string; token: string; regressionId: string; signal?: AbortSignal;
}, fetcher: typeof fetch = fetch): Promise<LabRegressionExport> {
  const base = labReadbackURL(input.baseURL);
  if (!uuid.test(input.regressionId) || !input.token.trim() || /[\r\n]/.test(input.token)) throw new Error("OPTIMIZATION_FEEDBACK_CREDENTIAL_OR_ID_INVALID");
  const response = await fetcher(new URL("/v1/lab/regressions/" + input.regressionId + "/export", base), {
    headers: { authorization: "Bearer " + input.token }, redirect: "error", cache: "no-store",
    signal: AbortSignal.any([AbortSignal.timeout(15000), ...(input.signal ? [input.signal] : [])]),
  });
  if (!response.ok) throw new Error("OPTIMIZATION_FEEDBACK_READBACK_" + response.status);
  if (!response.body) throw new Error("OPTIMIZATION_FEEDBACK_READBACK_EMPTY");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength; if (size > 512000) throw new Error("OPTIMIZATION_FEEDBACK_READBACK_TOO_LARGE");
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!Value.Check(LabRegressionExportSchema, value)) throw new Error("OPTIMIZATION_FEEDBACK_BUNDLE_INVALID");
  const bundle = value as LabRegressionExport;
  if (bundle.id !== input.regressionId || bundle.snapshot.data_class !== "private_business" || bundle.snapshot.task !== "relationship_text"
    || !bundle.snapshot.feedback_source || bundle.snapshot.feedback_source.expectation_authority !== "proposal"
    || digestCanonicalJson(bundle.snapshot).slice(7) !== bundle.content_hash || !Number.isFinite(Date.parse(bundle.expires_at))
    || Date.parse(bundle.expires_at) <= Date.now()) throw new Error("OPTIMIZATION_FEEDBACK_SOURCE_UNAVAILABLE");
  const raw: unknown = JSON.parse(bundle.snapshot.case.input_json);
  if (digestCanonicalJson(raw).slice(7) !== bundle.snapshot.case.input_hash) throw new Error("OPTIMIZATION_FEEDBACK_INPUT_DIGEST_MISMATCH");
  return bundle;
}
export function optimizationInputFromFeedback(bundle: LabRegressionExport): OptimizationRelationshipInput {
  const raw = JSON.parse(bundle.snapshot.case.input_json) as Record<string, unknown>;
  const { reference_time, mode, ...input } = raw;
  if ((reference_time !== undefined && reference_time !== bundle.snapshot.reference_time) || (mode !== undefined && mode !== "relationship")) throw new Error("OPTIMIZATION_FEEDBACK_REFERENCE_MISMATCH");
  return validateOptimizationRelationshipInput({ ...input, schemaVersion: "optimization-relationship-input.v1", dataClass: "private_business" });
}
export function optimizationDemonstrationFromFeedback(bundle: LabRegressionExport): string {
  return JSON.stringify({ input: optimizationInputFromFeedback(bundle), expectedBehaviorProposal: bundle.snapshot.expected_behavior, expectationAuthority: "proposal" });
}
export function feedbackBindingFromBundle(bundle: LabRegressionExport, targetId: string, target: "case" | "example" = "case"): OptimizationFeedbackBinding {
  const source = bundle.snapshot.feedback_source!;
  const binding: OptimizationFeedbackBinding = { target, targetId, regressionId: bundle.id, contentHash: bundle.content_hash,
    feedbackId: source.feedback_id, feedbackRevision: source.feedback_revision, executionId: source.execution_id,
    expiresAt: bundle.expires_at, expectationAuthority: "proposal" };
  validateOptimizationFeedbackBinding(binding); return binding;
}
export function assertFeedbackBindingCurrent(binding: OptimizationFeedbackBinding, bundle: LabRegressionExport): void {
  validateOptimizationFeedbackBinding(binding);
  if (digestCanonicalJson(feedbackBindingFromBundle(bundle, binding.targetId, binding.target)) !== digestCanonicalJson(binding)) throw new Error("OPTIMIZATION_FEEDBACK_SOURCE_CHANGED");
}
