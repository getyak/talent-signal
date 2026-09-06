import { createHash } from "node:crypto";
import { PROMPT_DEFINITIONS, type ProductPromptName } from "./prompts.js";

export interface PromptSnapshot {
  name: string;
  text: string;
  revision: string;
  source: "opik" | "cache" | "bundled";
  versionId: string | null;
  commit: string | null;
  environment: string | null;
}
export type PromptReference = Omit<PromptSnapshot, "text">;
export function promptReference({ text: _text, ...reference }: PromptSnapshot): PromptReference { return reference; }

export const promptRevision = (text: string): string => createHash("sha256").update(text).digest("hex");

// Eagerly capture the compiled catalogue once. No environment or network lookup.
const snapshots = new Map<ProductPromptName, PromptSnapshot>(
  (Object.keys(PROMPT_DEFINITIONS) as ProductPromptName[]).map(name => {
    const text = PROMPT_DEFINITIONS[name].text;
    return [name, Object.freeze({ name, text, revision: promptRevision(text),
      source: "bundled" as const, versionId: null, commit: null, environment: null })];
  }),
);

export function bundledPrompt(name: ProductPromptName): PromptSnapshot {
  const snapshot = snapshots.get(name);
  if (!snapshot) throw new Error("UNKNOWN_PRODUCT_PROMPT");
  return snapshot;
}

/** Async boundary retained for callers; every new task uses the compiled local prompt. */
export const resolveProductPrompt = async (name: ProductPromptName): Promise<PromptSnapshot> => bundledPrompt(name);
