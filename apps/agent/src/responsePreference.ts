import { z } from "zod";
import type { HarnessTool } from "./claudeHarness.js";

/** Supplied only by an authenticated product settings read. No free-form prompt. */
export interface ResponsePreference {
  responseStyle: "conclusion_first";
  sourceID: string;
  updatedAt: string;
}
export function responsePreferenceContext(preference: ResponsePreference | undefined) {
  if (!preference) return undefined;
  if (preference.responseStyle !== "conclusion_first" || !Number.isFinite(Date.parse(preference.updatedAt))
    || !/^user-preference:[0-9a-f-]{36}:[1-9][0-9]*$/iu.test(preference.sourceID)) throw new Error("CLAUDE_RESPONSE_PREFERENCE_INVALID");
  return { kind: "user_setting" as const, response_style: preference.responseStyle,
    source_id: preference.sourceID, updated_at: preference.updatedAt };
}

export const RESPONSE_PREFERENCE_INSTRUCTIONS =
  "assistant_service_preference is a verified user setting for presentation only. " +
  "When response_style is conclusion_first, lead with the conclusion, then explain. " +
  "The current user's explicit request takes precedence over this default. " +
  "This preference establishes no person facts and authorizes no actions.";

export function responsePreferenceTool(preference: ResponsePreference | undefined): HarnessTool[] {
  const context = responsePreferenceContext(preference);
  if (!context) return [];
  return [{ name: "read_response_preference", description: "Read the user's saved reply-format preference before composing the answer. Applies only to presentation; the current request takes precedence. Does not establish relationship facts or authorize actions.",
    schema: z.strictObject({}), readOnly: true, alwaysLoad: true,
    execute: async () => ({ content: [{ type: "text", text: JSON.stringify(context) }] }),
  }];
}
