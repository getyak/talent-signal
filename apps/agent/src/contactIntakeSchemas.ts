import { z } from "zod";
import { ContactPublicSourceSchema, ContactResearchChannelSchema } from "./contactResearchSchemas.js";

const Text = z.string().trim().min(1);
const ID = z.uuid();
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);

export const ContactChatExtractionSchema = z.strictObject({
  platform: Text.max(80),
  conversation_kind: z.enum(["direct", "group", "forwarded", "unknown", "not_chat"]),
  contact_name: Text.max(200).nullable(),
  identity_clues: z.array(z.strictObject({
    kind: z.enum(["name", "handle", "profile_url", "company", "job_title"]),
    value: Text.max(300),
    source_excerpt: Text.max(600),
  })).max(12),
  messages: z.array(z.strictObject({
    message_id: Text.max(80), sequence: z.number().int().min(0), text: Text.max(4_000),
    speaker_side: z.enum(["left", "right", "unknown"]),
    speaker_label: Text.max(120).nullable(),
    time_text: Text.max(120).nullable(),
  })).max(100),
  uncertainties: z.array(Text.max(500)).max(15),
});

export const ContactProfileFieldSchema = z.strictObject({
  field: z.enum(["headline", "company", "job_title", "location", "professional_background", "professional_topics", "public_profile"]),
  value: Text.max(1_500),
  source_refs: z.array(Text.max(160)).min(1).max(5),
  source_excerpt: Text.max(2_000),
  epistemic_status: z.enum(["source_statement", "inference"]),
});

export const ContactFindingSchema = z.strictObject({
  kind: z.enum(["change", "commitment", "constraint", "open_question", "next_step", "no_action"]),
  text: Text.max(1_000),
  message_refs: z.array(Text.max(80)).min(1).max(10),
  source_excerpt: Text.max(2_000),
  epistemic_status: z.enum(["source_statement", "inference"]),
});

export const CONTACT_INTAKE_TOOLS = {
  search_contacts: {
    description: "Search the authenticated contact directory with a specific identity clue from the screenshot or current user request. Call before creating a contact. Results contain only minimal identity and relationship labels.",
    schema: z.strictObject({ query: Text.max(200) }),
  },
  read_contact: {
    description: "Read one uniquely resolved same-task contact and relationship, including existing sourced profile fields. An ambiguous search cannot authorize reading.",
    schema: z.strictObject({ person_id: ID, relationship_context_id: ID }),
  },
  create_contact: {
    description: "Create one internal contact from the visible screenshot name and save this task's IM messages. The intentional import authorizes reversible filing; this does not confirm extracted facts. Requires an empty exact name/identity search; duplicates or group-chat ambiguity stop for clarification.",
    schema: z.strictObject({ display_name: Text.max(200) }),
  },
  save_contact_chat: {
    description: "Attach this task's exact extracted messages to its one resolved contact. Reuses stable source identity, preserves speaker/time uncertainty, and returns actual storage identifiers. No invented or substituted message payload is accepted.",
    schema: z.strictObject({ person_id: ID, relationship_context_id: ID }),
  },
  search_contact_public: {
    description: "Optionally discover public professional information about the resolved contact. Select LinkedIn via Exa, general web via Exa, or Douyin/TikTok/Weibo/Threads via TikHub based on visible identity clues. Never send private IM text, contact details, or sensitive attributes as search queries. Results remain possible matches.",
    schema: z.strictObject({ channel: ContactResearchChannelSchema, query: Text.min(2).max(400) }),
  },
  fetch_contact_source: {
    description: "Fetch readable content for a source discovered in this task. Supply its exact source_id or governed public1/public2 source_ref. Search snippets alone cannot justify a sourced profile update.",
    schema: z.strictObject({ source_id: z.union([Hash,z.string().regex(/^public[1-9][0-9]*$/u)]) }),
  },
  update_contact: {
    description: "Save cited professional observations to the resolved contact's profile. Every field needs an exact excerpt from a fetched public source (public1/public2 source_ref or exact source_id), stored chat message m1/m2/etc, or extracted screenshot identity clue clue1/clue2/etc shown in governed state. Public-profile URL values must match the cited source URL. Preserve conflicting values and user-confirmed fields. No identity merge, candidate rating, or external write.",
    schema: z.strictObject({ person_id: ID, fields: z.array(ContactProfileFieldSchema).min(1).max(10) }),
  },
  delete_contact: {
    description: "Archive a contact only when the current authenticated task has an exact user-issued deletion grant for that same target and revision. Screenshot imports never grant deletion. The resulting receipt supports reversal.",
    schema: z.strictObject({ person_id: ID, expected_revision: z.number().int().min(1) }),
  },
  finish_contact_task: {
    description: "Finish after actual contact and IM readback. Return a concise user-language summary, evidence-cited analysis, and one next step or no_action. Network failures may leave useful stored work with explicit limitations. Never claim an external message was sent.",
    schema: z.strictObject({ summary: Text.max(2_000), findings: z.array(ContactFindingSchema).max(10), limitations: z.array(Text.max(500)).max(10) }),
  },
  ask_contact_clarification: {
    description: "Pause this same durable task for one necessary identity or source clarification. Preserve completed work and ask about the ambiguity without guessing. The user can choose one returned contact or explain the screenshot.",
    schema: z.strictObject({ question: Text.max(800) }),
  },
} as const;

export type ContactIntakeToolName = keyof typeof CONTACT_INTAKE_TOOLS;
export type ContactChatExtraction = z.infer<typeof ContactChatExtractionSchema>;
export type ContactProfileField = z.infer<typeof ContactProfileFieldSchema>;
export type ContactFinding = z.infer<typeof ContactFindingSchema>;

export const ScreenshotContactTaskRequestSchema = z.strictObject({
  idempotency_key: Text.max(128),
  objective: Text.max(4_000),
  image: z.strictObject({
    media_type: z.enum(["image/png", "image/jpeg", "image/webp"]),
    byte_size: z.number().int().min(1).max(10_000_000),
    content_hash: Hash,
    data_base64: Text.max(13_400_000),
  }),
  selected_person_id: ID.optional(),
  selected_relationship_context_id: ID.optional(),
  allow_public_research: z.boolean().default(true),
  captured_at: z.iso.datetime(),
});

export const ContactTaskCandidateSchema = z.strictObject({
  person_id: ID, display_name: Text.max(200),
  relationship_context_id: ID, relationship_label: Text.max(200),
});

export const ScreenshotContactTaskResponseSchema = z.strictObject({
  task_id: ID,
  revision: z.number().int().min(1),
  status: z.enum(["running", "waiting_for_user", "completed", "partial", "failed", "cancelled", "deleted"]),
  contact: z.strictObject({
    person_id: ID, relationship_context_id: ID, display_name: Text.max(200),
    disposition: z.enum(["created", "reused"]),
  }).nullable(),
  capture_id: ID.nullable(),
  source_resource_id: ID.nullable(),
  message_count: z.number().int().nonnegative(),
  extraction: ContactChatExtractionSchema.nullable(),
  summary: z.string().max(2_000),
  findings: z.array(ContactFindingSchema).max(10),
  profile_fields: z.array(ContactProfileFieldSchema).max(50),
  public_sources: z.array(ContactPublicSourceSchema).max(30),
  question: z.string().max(800).nullable(),
  candidates: z.array(ContactTaskCandidateSchema).max(10),
  limitations: z.array(Text.max(500)).max(20),
  events: z.array(z.strictObject({
    sequence: z.number().int().positive(), tool: Text.max(100),
    status: z.enum(["completed", "failed", "denied"]),
    occurred_at: z.iso.datetime(),
  })).max(100),
  external_effects: z.array(z.never()).max(0),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

export type ScreenshotContactTaskRequest = z.infer<typeof ScreenshotContactTaskRequestSchema>;
export type ScreenshotContactTaskResponse = z.infer<typeof ScreenshotContactTaskResponseSchema>;
