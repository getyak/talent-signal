import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ClaudeContactAgentModel } from "./claudeContactProvider.js";
import { claudeHarnessConfiguration } from "./claudeHarnessConfiguration.js";
import type { ClaudeHarnessRequest } from "./claudeHarness.js";

describe("multimodal contact SDK adapter", () => {
  it("starts with the original image and lets the Agent request understanding when useful", async () => {
    const bytes = Buffer.from("synthetic-image");
    const config = claudeHarnessConfiguration({ ANTHROPIC_API_KEY: "synthetic", TALENT_SIGNAL_AGENT_MODEL: "synthetic" });
    const record = vi.fn(async () => ({ status: "unconfirmed" }));
    const execute = vi.fn(async (_configuration, request: ClaudeHarnessRequest) => {
      expect(request.images?.[0]?.contentHash).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(request.images?.[0]?.kind === "image" && request.images[0].dataBase64).toBe(bytes.toString("base64"));
      expect(record).not.toHaveBeenCalled();
      expect(request.tools.map((tool) => tool.name)).toContain("record_screenshot_understanding");
      expect(request.skills?.map((skill) => skill.name)).toEqual(["relationship-evidence"]);
      expect(request.outputSchema).toBeUndefined();
      const finish = request.tools.find((tool) => tool.name === "finish_contact_task")!;
      const schema = z.toJSONSchema(finish.schema) as any;
      expect(schema.properties.findings.description).toContain("Return []");
      expect(schema.properties.findings.items.properties.text.description).toContain("supported entirely by the cited original chat messages");
      expect(schema.properties.findings.items.properties.message_refs.description).toContain("All actual message_id");
      expect(schema.properties.findings.items.properties.source_excerpt.description).toContain("One contiguous exact substring");
      return { text: "Synthetic", structuredOutput: null, sessionID: "synthetic-run", inputTokens: 10, outputTokens: 10,
        estimatedUsd: 0, turns: 1, toolCalls: 0, terminalReason: "completed", permissionDenials: [], reportedModels: ["synthetic"] };
    });
    const model = new ClaudeContactAgentModel(config, execute);
    await model.run({ objective: "Read the profile", systemPrompt: "Synthetic", state: {}, assertCurrent: async () => {},
      images: [{ media_type: "image/png", byte_size: bytes.length, content_hash: createHash("sha256").update(bytes).digest("hex"), data_base64: bytes.toString("base64") }],
      recordUnderstanding: record, invoke: vi.fn(async () => ({})) }, new AbortController().signal);
    expect(execute).toHaveBeenCalledOnce();
    expect(record).not.toHaveBeenCalled();
    await expect(model.extract()).rejects.toThrow("USE_MULTIMODAL_RUN");
    await expect(model.next()).rejects.toThrow("USE_SDK_TOOL_LOOP");
  });
});
