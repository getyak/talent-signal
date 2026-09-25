import { describe, expect, it } from "vitest";

import { ApiError } from "../lib/apiError.js";
import {
  RESEND_SEND_EMAIL_ENDPOINT,
  createMemoryMailSink,
  createResendMailDelivery,
  mailDeliveryFromConfig,
  type MailMessage,
} from "../lib/mail.js";

const message: MailMessage = {
  to: "recruiter@example.test",
  subject: "Verify your email",
  text: "Synthetic verification message.",
  idempotencyKey: "registration-11111111-1111-4111-8111-111111111111",
};

describe("account verification mail delivery", () => {
  it("posts to the official Resend endpoint with a bearer key and idempotency key", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const delivery = createResendMailDelivery({
      apiKey: "re_synthetic_key",
      fromEmail: "Talent Signal <no-reply@example.test>",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify({ id: "synthetic-id" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });
    const receipt = await delivery.send(message);
    expect(receipt.providerMessageId).toBe("synthetic-id");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(RESEND_SEND_EMAIL_ENDPOINT);
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toEqual({
      from: "Talent Signal <no-reply@example.test>",
      to: ["recruiter@example.test"],
      subject: "Verify your email",
      text: "Synthetic verification message.",
    });
    expect(calls[0]!.init.headers).toMatchObject({
      Authorization: "Bearer re_synthetic_key",
      "Idempotency-Key": message.idempotencyKey,
    });
  });

  it("reports transport failures without provider bodies, keys, or message content", async () => {
    const delivery = createResendMailDelivery({
      apiKey: "re_synthetic_key",
      fromEmail: "no-reply@example.test",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ message: "secret provider detail re_synthetic_key" }),
          { status: 422 },
        ),
    });
    await expect(delivery.send(message)).rejects.toMatchObject({
      statusCode: 502,
      code: "EMAIL_DELIVERY_FAILED",
    });
    try {
      await delivery.send(message);
    } catch (error) {
      const rendered = error instanceof ApiError ? error.message : "";
      expect(rendered).not.toContain("re_synthetic_key");
      expect(rendered).not.toContain("provider detail");
      expect(rendered).not.toContain("Synthetic verification message");
    }
  });

  it("treats network failure and 5xx as unavailable, never as sent", async () => {
    for (const response of [
      null,
      new Response("upstream", { status: 500 }),
    ] as const) {
      const delivery = createResendMailDelivery({
        apiKey: "re_synthetic_key",
        fromEmail: "no-reply@example.test",
        fetchImpl: async () => {
          if (!response) throw new Error("socket hang up");
          return response;
        },
      });
      await expect(delivery.send(message)).rejects.toMatchObject({
        code: "EMAIL_DELIVERY_UNAVAILABLE",
      });
    }
  });

  it("keeps the test sink isolated and observable for tests only", async () => {
    const sink = createMemoryMailSink();
    expect(sink.messages).toHaveLength(0);
    await sink.delivery.send(message);
    expect(sink.messages).toEqual([message]);
    sink.failNextSend(new Error("synthetic failure"));
    await expect(sink.delivery.send(message)).rejects.toThrow(
      "synthetic failure",
    );
    await sink.delivery.send(message);
    expect(sink.messages).toHaveLength(2);
  });

  it("returns no transport when delivery is unconfigured so callers fail honestly", () => {
    expect(mailDeliveryFromConfig(undefined)).toBeUndefined();
    expect(mailDeliveryFromConfig({ apiKey: "k", fromEmail: "a@b.test" })).toBeDefined();
  });
});
