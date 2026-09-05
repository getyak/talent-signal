import { describe, expect, it, vi } from "vitest";
import type { LabJobDefinition } from "@talent-signal/contracts";
import { configuredChatPrompt, ZhipuChatAnswerProvider, type RemoteChatAnswerProviding } from "./chatAnswerProvider.js";
import { labHash, labJobCases } from "./labJobCases.js";
import { createJobAttempts, executeJobAttempt, LAB_JOB_INSTRUMENT_REVISION } from "./labJobRunner.js";
import { taskModelCatalog, taskPromptRevision } from "./labTaskConfiguration.js";

function definition(): LabJobDefinition {
  return { task: "relationship_text", cases: labJobCases().slice(0, 2), configurations: ["baseline", "concise"].map((prompt_preset) => ({
    model: "synthetic", prompt_preset: prompt_preset as "baseline" | "concise", prompt_revision: configuredChatPrompt("relationship", prompt_preset as "baseline" | "concise").revision })),
    comparison: "prompt", repetitions: 2, call_limit: 8, max_output_tokens_per_call: 1600,
    reference_time: "2026-09-04T00:00:00Z", backend_revision: "synthetic", instrument_revision: LAB_JOB_INSTRUMENT_REVISION,
    tool_access: [], business_write_count: 0, cost_status: "unavailable" };
}
function provider(): RemoteChatAnswerProviding {
  return { providerId: "zhipu-chat-completions", model: "synthetic", supportsImageInput: false, supportsPromptPresets: true,
    answer: vi.fn<RemoteChatAnswerProviding["answer"]>(async (request) => ({ model: "synthetic", provider_id: "zhipu-chat-completions", kind: "clarification",
      title: "Clarify", body: "The synthetic evidence needs review.", citation_ids: request.allowed_citation_ids,
      provider_request_id: "synthetic", input_tokens: 0, output_tokens: 0, usage_reported: false,
      prompt_revision: configuredChatPrompt("relationship", request.prompt_preset).revision })) };
}
describe("durable Lab batch runner", () => {
  it("preserves frozen identity across PostgreSQL JSON object key ordering", () => {
    expect(labHash({ b: { z: 1, a: 2 }, a: [1, 2] })).toBe(labHash({ a: [1, 2], b: { a: 2, z: 1 } }));
    expect(labHash([1, 2])).not.toBe(labHash([2, 1]));
  });
  it("keeps independent cases separate from repetitions and alternates configuration order", () => {
    const plan = definition(), attempts = createJobAttempts(plan);
    expect(attempts).toHaveLength(8);
    expect(new Set(attempts.map((value) => value.case_id)).size).toBe(2);
    expect(attempts.map((value) => value.configuration_index)).toEqual([0, 1, 1, 0, 1, 0, 0, 1]);
    expect(new Set(attempts.map((value) => value.id)).size).toBe(8);
  });
  it("keeps held-out cases independent and never supplies expected behavior to the target model", async () => {
    const plan = definition(), model = provider();
    expect(labJobCases("relationship_text").filter((value) => value.partition === "held_out")).toHaveLength(2);
    const result = await executeJobAttempt(createJobAttempts(plan)[0]!, plan.cases[0]!, plan, model);
    const input = vi.mocked(model.answer).mock.calls[0]![0];
    expect(JSON.stringify(input)).not.toContain(plan.cases[0]!.expected);
    expect(result.status).toBe("completed");
    expect(result.input_tokens).toBeNull();
    expect(result.checks.find((value) => value.id === "semantic_review")?.verdict).toBe("unknown");
  });
  it("blocks changed input or prompt before calling a provider", async () => {
    const plan = definition(), model = provider(), attempt = createJobAttempts(plan)[0]!;
    const altered = { ...plan.cases[0]!, input_json: JSON.stringify({ objective: "changed" }) };
    expect((await executeJobAttempt(attempt, altered, plan, model)).status).toBe("failed");
    expect(model.answer).not.toHaveBeenCalled();
    plan.configurations[0]!.prompt_revision = labHash("changed");
    expect((await executeJobAttempt(attempt, plan.cases[0]!, plan, model)).status).toBe("failed");
    expect(model.answer).not.toHaveBeenCalled();
  });
  it("hard failures are explicit and raw provider error data never escapes", async () => {
    const plan = definition(), model = provider(), attempt = createJobAttempts(plan)[0]!;
    vi.mocked(model.answer).mockRejectedValue(new Error("secret candidate content"));
    const result = await executeJobAttempt(attempt, plan.cases[0]!, plan, model);
    expect(result.status).toBe("failed");
    expect(result.checks[0]?.verdict).toBe("fail");
    expect(JSON.stringify(result)).not.toContain("secret candidate content");
    expect(model.answer).toHaveBeenCalledOnce();
  });
  it("materializes a hash-bound synthetic image only for the admitted vision model", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(init?.body)).toContain("data:image/png;base64,");
      return new Response(JSON.stringify({ id: "image-request", model: "glm-vision-test", choices: [{ message: { content: JSON.stringify({
        kind: "answer", title: "Current schedule", body: "Wednesday 14:00 is confirmed; Tuesday 10:00 was cancelled.", citation_ids: ["synthetic-image-1"],
      }) } }], usage: { prompt_tokens: 12, completion_tokens: 8 } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const model = new ZhipuChatAnswerProvider({ apiKey: "synthetic", model: "glm-text-test", visionModel: "glm-vision-test", fetcher });
    const sample = labJobCases("relationship_image")[0]!, entry = taskModelCatalog([model]).find((value) => value.task === "relationship_image")!;
    const plan: LabJobDefinition = { task: "relationship_image", cases: [sample], configurations: ["baseline", "concise"].map((prompt_preset) => ({
      model: entry.model, prompt_preset: prompt_preset as "baseline" | "concise", prompt_revision: taskPromptRevision(entry, prompt_preset as "baseline" | "concise") })),
      comparison: "prompt", repetitions: 1, call_limit: 2, max_output_tokens_per_call: 1600,
      reference_time: "2026-09-05T00:00:00Z", backend_revision: "synthetic", instrument_revision: LAB_JOB_INSTRUMENT_REVISION,
      tool_access: [], business_write_count: 0, cost_status: "unavailable" };
    const result = await executeJobAttempt(createJobAttempts(plan)[0]!, sample, plan, model);
    expect(result.status).toBe("completed");
    expect(result.actual_model).toBe("glm-vision-test");
    expect(result.execution).toBe("remote");
    expect(result.checks.find((value) => value.id === "image_capability")?.verdict).toBe("pass");
    expect(sample.input_json).not.toContain("data:image");
  });
  it("runs the product Workspace Agent tool contract against a read-only synthetic directory", async () => {
    const fetcher = vi.fn();
    const model = new ZhipuChatAnswerProvider({ apiKey: "synthetic", model: "glm-agent-test", fetcher });
    const sample = labJobCases("unscoped_chat").find((value) => value.id === "agent-unique-contact")!;
    const entry = taskModelCatalog([model]).find((value) => value.task === "unscoped_chat")!;
    const plan: LabJobDefinition = { task: "unscoped_chat", cases: [sample], configurations: ["baseline", "concise"].map((prompt_preset) => ({
      model: entry.model, prompt_preset: prompt_preset as "baseline" | "concise", prompt_revision: taskPromptRevision(entry, prompt_preset as "baseline" | "concise") })),
      comparison: "prompt", repetitions: 1, call_limit: 2, max_output_tokens_per_call: 1600,
      reference_time: "2026-09-05T00:00:00Z", backend_revision: "synthetic", instrument_revision: LAB_JOB_INSTRUMENT_REVISION,
      tool_access: ["contact_workspace"], business_write_count: 0, cost_status: "unavailable" };
    const result = await executeJobAttempt(createJobAttempts(plan)[0]!, sample, plan, model);
    expect(result.status).toBe("completed");
    expect(result.execution).toBe("local_only");
    expect(result.remote_requests_started).toBe(0);
    expect(result.actual_model).toBeNull();
    expect(result.checks.find((value) => value.id === "agent_tool_contract")?.verdict).toBe("pass");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
