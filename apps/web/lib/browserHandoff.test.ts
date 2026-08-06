import { describe, expect, it } from "vitest";

import {
  createSyntheticBrowserHandoff,
  FROZEN_SYNTHETIC_SOURCE,
  reuseSyntheticBrowserHandoff,
} from "./browserHandoff";

describe("synthetic browser handoff", () => {
  it("keeps the idempotency header, body, and active localhost origin aligned", () => {
    const request = createSyntheticBrowserHandoff({
      approvedAt: "2026-08-05T03:45:00.000Z",
      origin: "http://127.0.0.1:3400/workspace",
      requestId: "web-local-test-request",
    });

    expect(request.headers["idempotency-key"]).toBe(
      request.body.idempotency_key,
    );
    expect(request.body.handoff_target).toBe(
      "http://127.0.0.1:3400/api/browser-extension/captures",
    );
    expect(request.body.source.url).toBe("http://127.0.0.1:3400/");
    expect(request.body.review.text).toBe(FROZEN_SYNTHETIC_SOURCE);
    expect(request.body.retention_mode).toBe("evidence_crop");
  });

  it("reuses the exact reviewed packet when the same-page submit is retried", () => {
    const first = createSyntheticBrowserHandoff({
      approvedAt: "2026-08-05T03:45:00.000Z",
      origin: "http://127.0.0.1:3400/workspace",
      requestId: "web-local-first-request",
    });
    const retry = reuseSyntheticBrowserHandoff(first, {
      approvedAt: "2026-08-05T03:46:00.000Z",
      origin: "http://127.0.0.1:3400/workspace",
      requestId: "web-local-different-request",
    });

    expect(retry).toBe(first);
    expect(retry.body.request_id).toBe("web-local-first-request");
    expect(retry.body.authorization.approved_at).toBe(
      "2026-08-05T03:45:00.000Z",
    );
  });
});
