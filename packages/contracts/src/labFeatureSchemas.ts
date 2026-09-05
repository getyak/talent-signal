import { Type, type Static } from "@sinclair/typebox";
import { CONTRACT_VERSION } from "./constants.js";

export const LabFeatureIdSchema = Type.Literal("relationship_evidence_preview");
export const LabFeatureValueSchema = Type.Union([
  Type.Literal("source_only"),
  Type.Literal("inline_excerpt"),
]);
const NullableText = Type.Union([Type.String(), Type.Null()]);

export const LabFeatureCatalogEntrySchema = Type.Object({
  id: LabFeatureIdSchema,
  name: Type.String(),
  summary: Type.String(),
  definition_revision: Type.String(),
  server_value: LabFeatureValueSchema,
  allowed_values: Type.Array(LabFeatureValueSchema, { minItems: 2 }),
  dependency: Type.Literal("relationship_text_citations"),
  safety_boundary: Type.String(),
}, { additionalProperties: false });

export const LabFeatureOverrideRequestSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  feature_id: LabFeatureIdSchema,
  value: LabFeatureValueSchema,
  duration_minutes: Type.Union([
    Type.Literal(5), Type.Literal(15), Type.Literal(30), Type.Literal(60),
  ]),
  replaces_override_id: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
}, { additionalProperties: false });

export const LabFeatureOverrideSchema = Type.Object({
  session_scope_id: Type.String(),
  id: Type.String({ format: "uuid" }),
  feature_id: LabFeatureIdSchema,
  server_value: LabFeatureValueSchema,
  override_value: LabFeatureValueSchema,
  effective_value: LabFeatureValueSchema,
  catalog_revision: Type.String(),
  definition_revision: Type.String(),
  backend_revision: NullableText,
  status: Type.Union([
    Type.Literal("active"), Type.Literal("stopped"), Type.Literal("expired"),
  ]),
  created_at: Type.String(),
  expires_at: Type.String(),
  scope: Type.Literal("this_authenticated_session"),
  stop_reason: Type.Union([
    Type.Literal("manual"), Type.Literal("replaced"), Type.Literal("expired"),
    Type.Literal("configuration_changed"), Type.Null(),
  ]),
}, { additionalProperties: false });

export const LabFeatureAdoptionReceiptSchema = Type.Object({
  override_id: Type.String({ format: "uuid" }),
  feature_id: LabFeatureIdSchema,
  server_value: LabFeatureValueSchema,
  override_value: LabFeatureValueSchema,
  effective_value: LabFeatureValueSchema,
  catalog_revision: Type.String(),
  definition_revision: Type.String(),
  backend_revision: NullableText,
  scope: Type.Literal("this_authenticated_session"),
  observed_at: Type.String(),
}, { additionalProperties: false });

export const LabFeatureConfigurationSchema = Type.Object({
  contract_version: Type.Literal(CONTRACT_VERSION),
  session_scope_id: Type.String(),
  enabled: Type.Boolean(),
  backend_revision: NullableText,
  catalog_revision: Type.String(),
  features: Type.Array(LabFeatureCatalogEntrySchema),
  overrides: Type.Array(LabFeatureOverrideSchema),
}, { additionalProperties: false });

export const LabFeatureOverrideResponseSchema = Type.Object({
  contract_version: Type.Literal(CONTRACT_VERSION),
  override: LabFeatureOverrideSchema,
}, { additionalProperties: false });

export type LabFeatureId = Static<typeof LabFeatureIdSchema>;
export type LabFeatureValue = Static<typeof LabFeatureValueSchema>;
export type LabFeatureCatalogEntry = Static<typeof LabFeatureCatalogEntrySchema>;
export type LabFeatureOverrideRequest = Static<typeof LabFeatureOverrideRequestSchema>;
export type LabFeatureOverride = Static<typeof LabFeatureOverrideSchema>;
export type LabFeatureAdoptionReceipt = Static<typeof LabFeatureAdoptionReceiptSchema>;
export type LabFeatureConfiguration = Static<typeof LabFeatureConfigurationSchema>;
