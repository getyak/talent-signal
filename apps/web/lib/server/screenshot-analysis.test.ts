import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeScreenshot } from "./screenshot-analysis";

const sourceSha256 = "a".repeat(64);

function modelPayload(text = "周五上午可以聊，时间还需要确认。") {
  return JSON.stringify({
    platform: "whatsapp",
    captured_at: null,
    transcription_notes: ["The screenshot owner was not specified."],
    messages: [
      {
        source_message_id: "m1",
        visual_direction: "unknown",
        speaker: "unknown",
        text,
      },
    ],
    assertions: [
      {
        field: "availability",
        status: "ambiguous",
        value: "周五上午",
        evidence_message_id: "m1",
        evidence_quote: "周五上午可以聊",
        ambiguity: "Speaker ownership is not confirmed.",
      },
    ],
    action: null,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("private screenshot analysis provider", () => {
  it("sends the supplied image bytes to OpenRouter and validates the structured draft", async () => {
    vi.stubEnv("TALENT_SIGNAL_AI_ENABLED", "true");
    vi.stubEnv("TALENT_SIGNAL_ALLOW_SENSITIVE_AI_PROCESSING", "true");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("ARK_API_KEY", "");
    vi.stubEnv(
      "TALENT_SIGNAL_OPENROUTER_SCREENSHOT_MODEL",
      "openai/gpt-5.4-mini",
    );
    let requestBody: Record<string, unknown> | null = null;
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          id: "generation-test-1",
          model: "openai/gpt-5.4-mini",
          choices: [{ message: { content: modelPayload() } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await analyzeScreenshot({
      bytes: new Uint8Array([1, 2, 3, 4]),
      mimeType: "image/webp",
      contactName: "Synthetic Candidate",
      assignmentLabel: "Synthetic search",
      screenshotOwner: "unknown",
      sourceSha256,
      preProviderMinimization: {
        crop_bottom_percent: 90,
        crop_top_percent: 10,
        prepared_in_browser: true,
        redaction_count: 2,
      },
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result.draft.platform).toBe("whatsapp");
    expect(result.draft.disposition).toBe("clarify");
    expect(result.draft.action).toBeNull();
    expect(result.meta).toMatchObject({
      provider: "OpenRouter",
      model: "openai/gpt-5.4-mini",
      request_id: "generation-test-1",
      pre_provider_minimization: {
        crop_bottom_percent: 90,
        crop_top_percent: 10,
        prepared_in_browser: true,
        redaction_count: 2,
      },
      source_sha256: sourceSha256,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(JSON.stringify(requestBody)).toContain(
      "data:image/webp;base64,AQIDBA==",
    );
    expect(requestBody).toMatchObject({
      model: "openai/gpt-5.4-mini",
      provider: {
        data_collection: "deny",
        require_parameters: true,
        zdr: true,
      },
      response_format: {
        type: "json_object",
      },
    });
  });

  it("does not enable image processing without the explicit sensitive-data gate", async () => {
    vi.stubEnv("TALENT_SIGNAL_AI_ENABLED", "true");
    vi.stubEnv("TALENT_SIGNAL_ALLOW_SENSITIVE_AI_PROCESSING", "false");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("ARK_API_KEY", "");

    await expect(
      analyzeScreenshot({
        bytes: new Uint8Array([1]),
        mimeType: "image/webp",
        contactName: "Synthetic Candidate",
        assignmentLabel: "Synthetic search",
        screenshotOwner: "unknown",
        sourceSha256,
      }),
    ).rejects.toThrow(/not configured/i);
  });

  it("uses BigModel only when it is selected explicitly", async () => {
    vi.stubEnv("TALENT_SIGNAL_AI_ENABLED", "true");
    vi.stubEnv("TALENT_SIGNAL_ALLOW_SENSITIVE_AI_PROCESSING", "true");
    vi.stubEnv("TALENT_SIGNAL_SCREENSHOT_PROVIDER", "zhipu");
    vi.stubEnv("ZHIPU_API_KEY", "test-key");
    vi.stubEnv("ARK_API_KEY", "an-ark-key-that-must-not-win");
    vi.stubEnv("OPENROUTER_API_KEY", "an-openrouter-key-that-must-not-win");
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "bigmodel-request-2",
          model: "glm-5.3-flash",
          choices: [{ message: { content: modelPayload() } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await analyzeScreenshot({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
      contactName: "Synthetic Candidate",
      assignmentLabel: "Synthetic search",
      screenshotOwner: "unknown",
      sourceSha256,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result.meta.provider).toBe("Zhipu BigModel");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("propagates caller cancellation to the configured vision provider", async () => {
    vi.stubEnv("TALENT_SIGNAL_AI_ENABLED", "true");
    vi.stubEnv("TALENT_SIGNAL_ALLOW_SENSITIVE_AI_PROCESSING", "true");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("ARK_API_KEY", "");
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const providerSignal = init?.signal;
        return await new Promise<Response>((_resolve, reject) => {
          providerSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Canceled", "AbortError")),
            { once: true },
          );
        });
      },
    );

    const pending = analyzeScreenshot({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/webp",
      contactName: "Synthetic Candidate",
      assignmentLabel: "Synthetic search",
      screenshotOwner: "unknown",
      signal: controller.signal,
      sourceSha256,
      fetchImpl: fetchImpl as typeof fetch,
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(
      (fetchImpl.mock.calls[0]?.[1]?.signal as AbortSignal).aborted,
    ).toBe(true);
  });
});
