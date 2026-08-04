import { classifyReceiptResponse } from "./handoff-contract.js";

export const FIXTURE_SCENARIOS = [
  "received",
  "offline",
  "duplicate",
  "stale_session",
  "unknown_then_received",
];

function fixtureReceipt(requestId) {
  return `TS-FIXTURE-${requestId.slice(0, 8).toUpperCase()}`;
}

export async function fixtureSubmit({ envelope, scenario, attempt = 1 }) {
  const receiptId = fixtureReceipt(envelope.request_id);

  switch (scenario) {
    case "offline":
      if (attempt === 1) {
        throw new TypeError("Synthetic offline fixture");
      }
      return classifyReceiptResponse(202, {
        status: "received",
        receipt_id: receiptId,
      });
    case "duplicate":
      return classifyReceiptResponse(409, {
        status: "received",
        code: "duplicate",
        receipt_id: receiptId,
      });
    case "stale_session":
      return classifyReceiptResponse(409, {
        code: "session_stale",
      });
    case "unknown_then_received": {
      const error = new DOMException("Synthetic timeout", "AbortError");
      throw error;
    }
    case "received":
    default:
      return classifyReceiptResponse(202, {
        status: "received",
        receipt_id: receiptId,
      });
  }
}

export async function fixtureCheck({ requestId, scenario }) {
  if (scenario === "unknown_then_received") {
    return classifyReceiptResponse(200, {
      status: "received",
      receipt_id: fixtureReceipt(requestId),
    });
  }

  return classifyReceiptResponse(404, {
    code: "receipt_not_found",
    message: "The synthetic receipt is not available for this scenario.",
  });
}
