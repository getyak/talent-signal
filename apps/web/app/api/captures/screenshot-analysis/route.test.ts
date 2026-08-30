import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  analyzeScreenshotMock,
  authMock,
  classifyScreenshotAnalysisFailureMock,
  getScreenshotAnalysisAvailabilityMock,
  issueScreenshotAnalysisReceiptMock,
} = vi.hoisted(() => ({
  analyzeScreenshotMock: vi.fn(),
  authMock: vi.fn(),
  classifyScreenshotAnalysisFailureMock: vi.fn(),
  getScreenshotAnalysisAvailabilityMock: vi.fn(),
  issueScreenshotAnalysisReceiptMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/server/screenshot-analysis", () => ({
  analyzeScreenshot: analyzeScreenshotMock,
  classifyScreenshotAnalysisFailure:
    classifyScreenshotAnalysisFailureMock,
  getScreenshotAnalysisAvailability:
    getScreenshotAnalysisAvailabilityMock,
}));
vi.mock("@/lib/server/screenshot-analysis-receipt", () => ({
  issueScreenshotAnalysisReceipt: issueScreenshotAnalysisReceiptMock,
}));

import { POST } from "./route";

function buildRequest(options: {
  ip?: string;
  screenshotOwner?: string;
}) {
  const form = new FormData();
  form.set(
    "image",
    new File([new Uint8Array([1, 2, 3])], "capture.webp", {
      type: "image/webp",
    }),
  );
  form.set("screenshotOwner", options.screenshotOwner ?? "candidate");
  return new NextRequest(
    "http://127.0.0.1:3000/api/captures/screenshot-analysis",
    {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
        "x-forwarded-for": options.ip ?? "203.0.113.10",
      },
      body: form,
    },
  );
}

describe("screenshot analysis route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    authMock.mockResolvedValue({ user: { id: "recruiter" } });
    getScreenshotAnalysisAvailabilityMock.mockReturnValue({
      enabled: true,
      provider: "OpenRouter",
      screenshot_model: "qwen/qwen3-vl-30b-a3b-instruct",
      unavailable_reason: null,
    });
    analyzeScreenshotMock.mockResolvedValue({
      draft: {
        action: null,
        assertions: [],
        captured_at: null,
        disposition: "no_action",
        messages: [],
        platform: "line",
        schema_version: "screenshot-capture.v1",
        transcription_notes: [],
      },
      meta: {
        model: "qwen/qwen3-vl-30b-a3b-instruct",
        prompt_version: "screenshot-evidence.v1",
        provider: "OpenRouter",
        request_id: "provider-request-1",
        source_sha256: "a".repeat(64),
      },
    });
    issueScreenshotAnalysisReceiptMock.mockReturnValue("receipt-1");
  });

  it("returns exact non-secret admission codes when screenshot analysis is unavailable", async () => {
    const cases = [
      {
        reason: "ai_disabled",
        expectedMessage: /尚未启用/,
      },
      {
        reason: "sensitive_processing_disabled",
        expectedMessage: /私密截图处理尚未获准/,
      },
      {
        reason: "provider_credentials_missing",
        expectedMessage: /尚未配置凭据/,
      },
    ] as const;

    for (const [index, testCase] of cases.entries()) {
      getScreenshotAnalysisAvailabilityMock.mockReturnValueOnce({
        enabled: false,
        provider: "OpenRouter",
        screenshot_model: "qwen/qwen3-vl-30b-a3b-instruct",
        unavailable_reason: testCase.reason,
      });

      const result = await POST(
        buildRequest({ ip: `203.0.113.${10 + index}` }),
      );

      expect(result.status).toBe(503);
      await expect(result.json()).resolves.toMatchObject({
        code: testCase.reason,
        error: expect.stringMatching(testCase.expectedMessage),
      });
    }
    expect(analyzeScreenshotMock).not.toHaveBeenCalled();
  });

  it("maps provider timeouts to a distinct safe retry response", async () => {
    analyzeScreenshotMock.mockRejectedValueOnce(
      new DOMException("The operation timed out", "TimeoutError"),
    );
    classifyScreenshotAnalysisFailureMock.mockReturnValueOnce(
      "provider_timeout",
    );

    const result = await POST(
      buildRequest({ ip: "203.0.113.21" }),
    );

    expect(result.status).toBe(504);
    await expect(result.json()).resolves.toMatchObject({
      code: "provider_timeout",
      error: expect.stringMatching(/45 秒内未完成/),
    });
  });

  it("maps provider network failures to a distinct safe retry response", async () => {
    analyzeScreenshotMock.mockRejectedValueOnce(
      new TypeError("fetch failed"),
    );
    classifyScreenshotAnalysisFailureMock.mockReturnValueOnce(
      "provider_network_failed",
    );

    const result = await POST(
      buildRequest({ ip: "203.0.113.22" }),
    );

    expect(result.status).toBe(502);
    await expect(result.json()).resolves.toMatchObject({
      code: "provider_network_failed",
      error: expect.stringMatching(/无法连接所选截图分析 Provider/),
    });
  });
});
