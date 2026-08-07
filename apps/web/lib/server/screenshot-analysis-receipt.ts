import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type {
  ScreenshotAnalysisMeta,
  ScreenshotCaptureDraft,
} from "../screenshot-capture";

const RECEIPT_VERSION = "screenshot-analysis-receipt.v1";
const RECEIPT_LIFETIME_MS = 15 * 60 * 1000;

type ReceiptInput = {
  draft: ScreenshotCaptureDraft;
  meta: ScreenshotAnalysisMeta;
};

function secret() {
  const value =
    process.env.TALENT_SIGNAL_ANALYSIS_RECEIPT_SECRET ??
    process.env.AUTH_SECRET ??
    (process.env.NODE_ENV !== "production"
      ? "talent-signal-local-analysis-receipt-secret"
      : "");
  if (!value) {
    throw new Error("Screenshot analysis receipts are not configured.");
  }
  return value;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(input: ReceiptInput) {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function issueScreenshotAnalysisReceipt(input: ReceiptInput) {
  const payload = Buffer.from(
    JSON.stringify({
      version: RECEIPT_VERSION,
      digest: digest(input),
      expires_at: Date.now() + RECEIPT_LIFETIME_MS,
    }),
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyScreenshotAnalysisReceipt(
  receipt: string,
  input: ReceiptInput,
) {
  const [payload, suppliedSignature, ...rest] = receipt.split(".");
  if (!payload || !suppliedSignature || rest.length > 0) {
    return false;
  }
  const expectedSignature = signature(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return false;
  }
  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as {
      version?: string;
      digest?: string;
      expires_at?: number;
    };
    return (
      decoded.version === RECEIPT_VERSION &&
      decoded.digest === digest(input) &&
      typeof decoded.expires_at === "number" &&
      decoded.expires_at >= Date.now()
    );
  } catch {
    return false;
  }
}
