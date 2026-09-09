import { Type, type Static } from "@sinclair/typebox";
import { CONTRACT_VERSION } from "./constants.js";

export const AgentResponseStyleSchema = Type.Union([Type.Literal("default"), Type.Literal("conclusion_first")]);
export const AgentPreferenceMutationSchema = Type.Object({
  idempotency_key: Type.String({ format: "uuid" }),
  expected_revision: Type.Integer({ minimum: 0 }),
  response_style: AgentResponseStyleSchema,
}, { additionalProperties: false });
export const AgentPreferenceResponseSchema = Type.Object({
  contract_version: Type.Literal(CONTRACT_VERSION),
  preference: Type.Object({
    response_style: AgentResponseStyleSchema,
    revision: Type.Integer({ minimum: 0 }),
    updated_at: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    provenance: Type.Union([Type.Object({
      kind: Type.Literal("user_setting"),
      user_id: Type.String({ format: "uuid" }),
      source_id: Type.String(),
    }, { additionalProperties: false }), Type.Null()]),
  }, { additionalProperties: false }),
}, { additionalProperties: false });
export type AgentPreferenceMutation = Static<typeof AgentPreferenceMutationSchema>;
export type AgentPreferenceResponse = Static<typeof AgentPreferenceResponseSchema>;
