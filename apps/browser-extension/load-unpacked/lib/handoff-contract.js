export const HANDOFF_SCHEMA_VERSION = "browser-capture-handoff.v1";
export const DEFAULT_LOCAL_ORIGIN = "http://localhost:3000";
export const MAX_HANDOFF_BYTES = 8_000_000;

const LOCAL_ORIGINS = new Set(["localhost", "127.0.0.1"]);

export function normalizeLocalOrigin(value) {
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Enter a valid local service URL.");
  }

  if (parsed.protocol !== "http:" || !LOCAL_ORIGINS.has(parsed.hostname)) {
    throw new Error("The development handoff must use http://localhost or http://127.0.0.1.");
  }

  return parsed.origin;
}

export function createRequestIdentity(draftId, randomUUID = () =>
  globalThis.crypto?.randomUUID?.() ?? `request-${Date.now()}`) {
  const requestId = randomUUID();
  return {
    request_id: requestId,
    idempotency_key: `browser-capture:${draftId}:${requestId}`,
  };
}

export function buildHandoffEnvelope({
  draft,
  reviewedAsset,
  retentionMode,
  requestIdentity,
  handoffTarget,
  sessionVersion = null,
  approvedAt = new Date().toISOString(),
}) {
  if (!draft || !reviewedAsset || !requestIdentity || !handoffTarget) {
    throw new Error("A reviewed draft, target, and request identity are required.");
  }

  return {
    schema_version: HANDOFF_SCHEMA_VERSION,
    request_id: requestIdentity.request_id,
    idempotency_key: requestIdentity.idempotency_key,
    purpose: "candidate_conversation_evidence_review",
    retention_mode: retentionMode,
    handoff_target: handoffTarget,
    session: {
      version: sessionVersion,
      credential_transport: "browser_managed",
    },
    source: {
      capture_kind: draft.kind,
      title: draft.source.title,
      url: draft.source.url,
      captured_at: draft.source.captured_at,
    },
    review: reviewedAsset,
    authorization: {
      decision: "submit_reviewed_capture",
      approved_at: approvedAt,
      statement:
        "The user explicitly submitted the exact reviewed payload shown in the extension.",
    },
  };
}

export function classifyReceiptResponse(status, body = {}) {
  const receiptId =
    typeof body.receipt_id === "string" ? body.receipt_id : null;

  if (
    status === 409 &&
    (body.code === "duplicate" || body.status === "received") &&
    receiptId
  ) {
    return {
      state: "received",
      receipt_id: receiptId,
      duplicate: true,
      message: "This exact review packet was already received. No duplicate was created.",
    };
  }

  if ([401, 403, 419].includes(status) || body.code === "session_stale") {
    return {
      state: "failed",
      code: "session_stale",
      message:
        "The local sign-in session is missing or changed. Reconnect before retrying this same packet.",
    };
  }

  if (status >= 200 && status < 300 && body.status === "pending") {
    return {
      state: "pending",
      receipt_id: receiptId,
      message:
        "The local service accepted the upload but has not confirmed receipt yet.",
    };
  }

  if (
    status >= 200 &&
    status < 300 &&
    body.status === "received" &&
    receiptId
  ) {
    return {
      state: "received",
      receipt_id: receiptId,
      duplicate: Boolean(body.duplicate),
      message: "The local service confirmed receipt of this review packet.",
    };
  }

  if (status >= 200 && status < 300) {
    return {
      state: "unknown",
      code: "receipt_unknown",
      message:
        "The local service responded, but did not provide verifiable pending or receipt evidence. Check before submitting again.",
    };
  }

  return {
    state: "failed",
    code: body.code ?? "backend_rejected",
    message:
      typeof body.message === "string"
        ? body.message
        : "The local service did not accept this packet. Nothing is marked received.",
  };
}

export function classifyTransportError(error) {
  if (error?.name === "AbortError" || error?.code === "request_timeout") {
    return {
      state: "unknown",
      code: "receipt_unknown",
      message:
        "The request may have reached the local service, but receipt could not be confirmed. Check the receipt before submitting again.",
    };
  }

  return {
    state: "failed",
    code: "offline",
    message:
      "The local service could not be reached. The reviewed packet remains here for a safe retry.",
  };
}

export function sessionCopy(status, body = {}) {
  if (status >= 200 && status < 300 && body.status === "ready") {
    return {
      state: "ready",
      workspace_label:
        typeof body.workspace_label === "string"
          ? body.workspace_label
          : "Local Talent Signal",
      session_version:
        typeof body.session_version === "string"
          ? body.session_version
          : null,
      message: "Browser-managed local session is ready. No token is exposed to the extension.",
    };
  }

  return {
    state: "not_ready",
    workspace_label: null,
    session_version: null,
    message: "No ready local session was observed. Open sign-in, then check again.",
  };
}
