import { describe, expect, it, vi } from "vitest";
import { createMemoryProposalRegenerator } from "./memoryRegenerationAgent.js";
import type { MemoryRegenerationInput } from "./memoryReviewStage.js";

const input: MemoryRegenerationInput = {
  workspaceID: "synthetic", sessionId: null, messageId: null,
  sourceText: "We met at the reading group.", images: [],
  targetPersonId: null, targetContextId: null, targetDisplayLabel: "Chen",
  relationshipDisplayLabel: "Reading group", existingMemoryTexts: [],
};

describe("memory regeneration output contract", () => {
  it("requests internal JSON and permits an explicit empty delta", async () => {
    const run = vi.fn(async (_request: unknown) => ({ structuredOutput: { items: [] } }));
    const regenerate = createMemoryProposalRegenerator({ run })!;
    expect(await regenerate(input)).toEqual([]);
    expect(run.mock.calls[0]?.[0]).toMatchObject({ outputMode: "json", toolManifest: [] });
  });

  it.each([{}, { items: "bad" }, { items: [{}] }, { body: "I prepared a card" }])(
    "rejects malformed candidates instead of interpreting them as deletion: %j", async structuredOutput => {
      const regenerate = createMemoryProposalRegenerator({ run: async () => ({ structuredOutput }) })!;
      await expect(regenerate(input)).rejects.toMatchObject({ code: "MEMORY_REGENERATION_OUTPUT_INVALID" });
    },
  );
});
