import { z } from "zod";

export const CONTACT_RESEARCH_CONTRACT = "contact-research-tools.v2";

/**
 * One ordered channel catalog. LinkedIn and Web remain Exa capabilities; every
 * social surface stays pinned to TikHub. Adding a channel here is a provider
 * decision, not a runtime fallback.
 */
export const ContactResearchChannelSchema = z.enum([
  "linkedin",
  "web",
  "xiaohongshu",
  "reddit",
  "douyin",
  "tiktok",
  "weibo",
  "threads",
  "instagram",
]);

export type ContactResearchChannel = z.infer<typeof ContactResearchChannelSchema>;

/** Exa owns exactly these two channels and no TikHub social surface. */
export const CONTACT_RESEARCH_EXA_CHANNELS = ["linkedin", "web"] as const satisfies readonly ContactResearchChannel[];
/** TikHub owns exactly these profile surfaces and never the Exa channels. */
export const CONTACT_RESEARCH_TIKHUB_CHANNELS = [
  "xiaohongshu",
  "reddit",
  "douyin",
  "tiktok",
  "weibo",
  "threads",
  "instagram",
] as const satisfies readonly ContactResearchChannel[];
/** The first authorized search is broad by default instead of one channel. */
export const CONTACT_RESEARCH_DEFAULT_CHANNELS = [
  "linkedin",
  "web",
  "xiaohongshu",
  "reddit",
] as const satisfies readonly ContactResearchChannel[];
export const CONTACT_RESEARCH_MAX_CHANNELS = 9;
export const CONTACT_RESEARCH_MAX_RESULTS_PER_CHANNEL = 5;
/** Combined normalized sources across every channel in one call. */
export const CONTACT_RESEARCH_MAX_RESULTS = 25;

export const ContactResearchFailureCodeSchema = z.enum([
  "AUTH_FAILED",
  "RATE_LIMITED",
  "UNAVAILABLE",
  "REJECTED",
  "RESPONSE_INVALID",
  "LIMIT_INVALID",
  "QUERY_REJECTED",
  "FAILED",
]);
export type ContactResearchFailureCode = z.infer<typeof ContactResearchFailureCodeSchema>;

export const ContactPublicSourceSchema = z.strictObject({
  source_id: z.string().regex(/^[a-f0-9]{64}$/u),
  url: z.url({ protocol: /^https$/u }).max(2_000),
  title: z.string().min(1).max(500),
  text: z.string().max(16_000),
  channel: ContactResearchChannelSchema,
  provider_id: z.enum(["exa", "tikhub", "browser"]),
  provider_request_id: z.string().max(500).nullable(),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/u),
  retrieved_at: z.iso.datetime(),
  stage: z.enum(["discovered", "fetched", "profile_observation"]),
  browser_observation: z.strictObject({
    engine: z.literal("chromium"), engine_version: z.string().min(1).max(100),
    initial_url: z.url({ protocol: /^https$/u }).max(2_000),
    final_url: z.url({ protocol: /^https$/u }).max(2_000),
    requests: z.number().int().min(1).max(40),
    blocked_requests: z.number().int().min(0).max(40),
    http_requests: z.number().int().min(1).max(80),
    response_bytes: z.number().int().min(1).max(8_000_000),
    discovered_source_id: z.string().regex(/^[a-f0-9]{64}$/u),
  }).optional(),
});

/**
 * Bounded per-channel disposition. A failed channel names one allowlisted
 * failure code and never carries provider text, payload fragments, or secrets.
 */
const ContactResearchChannelOutcomeBase = {
  channel: ContactResearchChannelSchema,
  provider: z.enum(["exa", "tikhub"]),
};

export const ContactResearchChannelOutcomeSchema = z.discriminatedUnion("status", [
  z.strictObject({
    ...ContactResearchChannelOutcomeBase,
    status: z.literal("ok"),
    result_count: z.number().int().min(0).max(CONTACT_RESEARCH_MAX_RESULTS_PER_CHANNEL),
    truncated: z.boolean(),
    error_code: z.null(),
  }),
  z.strictObject({
    ...ContactResearchChannelOutcomeBase,
    status: z.literal("failed"),
    result_count: z.literal(0),
    truncated: z.literal(false),
    error_code: ContactResearchFailureCodeSchema,
  }),
]).superRefine((outcome, context) => {
  const expected = CONTACT_RESEARCH_EXA_CHANNELS.includes(outcome.channel as "linkedin" | "web")
    ? "exa"
    : "tikhub";
  if (outcome.provider !== expected) {
    context.addIssue({ code: "custom", path: ["provider"], message: `${outcome.channel} must use ${expected}.` });
  }
});

export const ContactResearchToolRequestSchema = z.strictObject({
  contract_version: z.literal(CONTACT_RESEARCH_CONTRACT),
  task_id: z.uuid(),
  call_id: z.uuid(),
  // Only public identity clues cross to search providers; never the IM body.
  anchors: z.array(z.string().trim().min(2).max(200)).min(1).max(5),
  input: z.discriminatedUnion("operation", [
    z.strictObject({
      operation: z.literal("search"),
      channels: z.array(ContactResearchChannelSchema)
        .min(1)
        .max(CONTACT_RESEARCH_MAX_CHANNELS)
        .refine((channels) => new Set(channels).size === channels.length, "Channels must be unique."),
      query: z.string().trim().min(2).max(400),
      maximum_results_per_channel: z.number().int().min(1).max(CONTACT_RESEARCH_MAX_RESULTS_PER_CHANNEL),
    }),
    z.strictObject({ operation: z.literal("fetch"), source: ContactPublicSourceSchema }),
    z.strictObject({ operation: z.literal("browse"), source: ContactPublicSourceSchema }),
  ]),
});

export const ContactResearchToolResponseSchema = z.strictObject({
  contract_version: z.literal(CONTACT_RESEARCH_CONTRACT),
  task_id: z.uuid(),
  call_id: z.uuid(),
  sources: z.array(ContactPublicSourceSchema).max(CONTACT_RESEARCH_MAX_RESULTS),
  channels: z.array(ContactResearchChannelOutcomeSchema).max(CONTACT_RESEARCH_MAX_CHANNELS).default([]),
  external_effects: z.array(z.never()).max(0),
});

export type ContactPublicSource = z.infer<typeof ContactPublicSourceSchema>;
export type ContactResearchChannelOutcome = z.infer<typeof ContactResearchChannelOutcomeSchema>;
export type ContactResearchToolRequest = z.infer<typeof ContactResearchToolRequestSchema>;
export type ContactResearchToolResponse = z.infer<typeof ContactResearchToolResponseSchema>;
