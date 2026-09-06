import { z } from "zod";

export const CONTACT_RESEARCH_CONTRACT = "contact-research-tools.v1";
export const ContactResearchChannelSchema = z.enum(["linkedin", "web", "douyin", "tiktok", "weibo", "threads"]);

export const ContactPublicSourceSchema = z.strictObject({
  source_id: z.string().regex(/^[a-f0-9]{64}$/u),
  url: z.url({ protocol: /^https$/u }).max(2_000),
  title: z.string().min(1).max(500),
  text: z.string().max(16_000),
  channel: ContactResearchChannelSchema,
  provider_id: z.enum(["exa", "tikhub"]),
  provider_request_id: z.string().max(500).nullable(),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/u),
  retrieved_at: z.iso.datetime(),
  stage: z.enum(["discovered", "fetched", "profile_observation"]),
});

export const ContactResearchToolRequestSchema = z.strictObject({
  contract_version: z.literal(CONTACT_RESEARCH_CONTRACT),
  task_id: z.uuid(),
  call_id: z.uuid(),
  // Only public identity clues cross to search providers; never the IM body.
  anchors: z.array(z.string().trim().min(2).max(200)).min(1).max(5),
  input: z.discriminatedUnion("operation", [
    z.strictObject({ operation: z.literal("search"), channel: ContactResearchChannelSchema,
      query: z.string().trim().min(2).max(400), maximum_results: z.number().int().min(1).max(5) }),
    z.strictObject({ operation: z.literal("fetch"), source: ContactPublicSourceSchema }),
  ]),
});

export const ContactResearchToolResponseSchema = z.strictObject({
  contract_version: z.literal(CONTACT_RESEARCH_CONTRACT),
  task_id: z.uuid(),
  call_id: z.uuid(),
  sources: z.array(ContactPublicSourceSchema).max(5),
  external_effects: z.array(z.never()).max(0),
});

export type ContactPublicSource = z.infer<typeof ContactPublicSourceSchema>;
export type ContactResearchToolRequest = z.infer<typeof ContactResearchToolRequestSchema>;
export type ContactResearchToolResponse = z.infer<typeof ContactResearchToolResponseSchema>;
