import { ApiError } from "./apiError.js";

/**
 * Server-side transactional email delivery for account verification.
 *
 * Boundary rules (ADR 0018):
 * - Only the server configures a transport; the test sink is injectable and
 *   never reachable from production configuration.
 * - Verification codes and secrets are never logged and never returned from a
 *   production endpoint. Delivery failures are sanitized: no API keys, no
 *   provider response bodies, no message content.
 * - An unconfigured transport is an honest failure (503), never a silent
 *   success, and never blocks existing sign-in or authenticated linking.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}

export interface MailDelivery {
  readonly kind: "resend" | "test-sink";
  send(message: MailMessage): Promise<{ providerMessageId: string }>;
}

export interface MemoryMailSink {
  readonly delivery: MailDelivery;
  readonly messages: MailMessage[];
  failNextSend(error: unknown): void;
}

/** Official reference: https://resend.com/docs/api-reference/emails/send-email */
export const RESEND_SEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";

export interface ResendMailDeliveryOptions {
  apiKey: string;
  fromEmail: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  endpoint?: string;
}

export function createResendMailDelivery(
  options: ResendMailDeliveryOptions,
): MailDelivery {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? RESEND_SEND_EMAIL_ENDPOINT;
  return {
    kind: "resend",
    async send(message) {
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
            // Resend de-duplicates sends by idempotency key, so a retried
            // verification start never produces two live codes.
            "Idempotency-Key": message.idempotencyKey,
          },
          body: JSON.stringify({
            from: options.fromEmail,
            to: [message.to],
            subject: message.subject,
            text: message.text,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        // Timeouts and network failures carry no provider detail outward.
        throw new ApiError(
          503,
          "EMAIL_DELIVERY_UNAVAILABLE",
          "Verification email delivery is temporarily unavailable. Try again shortly.",
        );
      }
      if (!response.ok) {
        // Status only: provider bodies may echo content or account details.
        // Transport-side failures are unavailable-and-retryable; client-side
        // rejections are a delivery failure that retrying the same request
        // cannot fix.
        const unavailable = response.status >= 500;
        throw new ApiError(
          unavailable ? 503 : 502,
          unavailable ? "EMAIL_DELIVERY_UNAVAILABLE" : "EMAIL_DELIVERY_FAILED",
          unavailable
            ? "Verification email delivery is temporarily unavailable. Try again shortly."
            : "Verification email could not be sent. Try again shortly.",
        );
      }
      const payload = (await response.json().catch(() => null)) as {
        id?: unknown;
      } | null;
      return {
        providerMessageId:
          typeof payload?.id === "string" ? payload.id : "resend-unreported",
      };
    },
  };
}

/** Isolated sink for tests. Never selectable through production configuration. */
export function createMemoryMailSink(): MemoryMailSink {
  const messages: MailMessage[] = [];
  let failure: unknown = null;
  return {
    messages,
    failNextSend(error: unknown) {
      failure = error;
    },
    delivery: {
      kind: "test-sink",
      async send(message) {
        if (failure) {
          const error = failure;
          failure = null;
          throw error;
        }
        messages.push(message);
        return { providerMessageId: `sink-${messages.length}` };
      },
    },
  };
}

export interface MailTransportConfig {
  apiKey: string;
  fromEmail: string;
}

/**
 * Build the configured production transport. `undefined` means delivery is not
 * configured; callers must fail honestly rather than pretend a message left.
 */
export function mailDeliveryFromConfig(
  transport: MailTransportConfig | undefined,
): MailDelivery | undefined {
  if (!transport) return undefined;
  return createResendMailDelivery(transport);
}
