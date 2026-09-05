import { describe, expect, it, vi } from "vitest";
import { executeLabModel, experimentCases, experimentInput, labModelProviders } from "./labExperiments.js";
import type { RemoteChatAnswerProviding } from "./chatAnswerProvider.js";

function provider(overrides = {}): RemoteChatAnswerProviding {
  return { providerId: "zhipu-chat-completions", model: "glm-test", supportsImageInput: false,
    answer: vi.fn().mockResolvedValue({ model: "glm-test", kind: "clarification", title: "Clarify",
      body: "The travel statements conflict.", citation_ids: ["conflict-message-01"],
      provider_request_id: "provider-test", input_tokens: 0, output_tokens: 0, ...overrides }) };
}

describe("real Lab experiment boundary", () => {
  it("uses synthetic cases without providing the expected answer to the model", () => {
    expect(experimentCases()).toHaveLength(3);
    const input = experimentInput("conflicting-evidence");
    expect(input.allowed_citation_ids).toHaveLength(2);
    expect(input.context_blocks).toHaveLength(2);
    expect(JSON.stringify(input)).not.toContain(experimentCases()[0]!.expected);
    expect(() => experimentInput("user-authored-private-evidence")).toThrow();
  });
  it("does not grant a revoked source citation authority", () => {
    const input = experimentInput("source-authorization-revoked");
    expect(input.allowed_citation_ids).not.toContain("revoked-source-01");
  });
  it("records actual execution while keeping unreported usage unknown", async () => {
    const model = provider();
    const result = await executeLabModel(model, experimentInput("conflicting-evidence"));
    expect(model.answer).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ status: "completed", input_tokens: null, output_tokens: null,
      provider_request_id: "provider-test" });
  });
  it("rejects model substitution and invented citations", async () => {
    for (const overrides of [{ model: "glm-other" }, { citation_ids: ["private-person"] }]) {
      expect(await executeLabModel(provider(overrides), experimentInput("conflicting-evidence")))
        .toMatchObject({ status: "failed", answer: null, input_tokens: null });
    }
  });
  it("does not expose raw provider error content", async () => {
    const model = provider();
    model.answer = vi.fn().mockRejectedValue(new Error("secret-and-candidate-content"));
    const result = await executeLabModel(model, experimentInput("conflicting-evidence"));
    expect(JSON.stringify(result)).not.toContain("secret-and-candidate-content");
    expect(result.status).toBe("failed");
  });
  it("does not add unapproved alternatives when the internal capability is off", () => {
    expect([...labModelProviders(provider(), { TALENT_SIGNAL_LAB_CHAT_MODELS: "glm-other" }).keys()])
      .toEqual(["glm-test"]);
  });
});
