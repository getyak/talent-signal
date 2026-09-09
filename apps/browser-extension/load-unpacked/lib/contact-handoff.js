import { normalizeLocalOrigin } from "./handoff-contract.js";

/** Only explicitly reviewed pixels enter the shared screenshot Agent. */
export async function contactTaskFromReviewedImage(envelope) {
  if (envelope?.source?.capture_kind !== "visible_tab" || envelope.review?.type !== "reviewed_image"
    || envelope.authorization?.decision !== "submit_reviewed_capture" || envelope.retention_mode !== "evidence_crop"
    || typeof envelope.idempotency_key !== "string" || envelope.idempotency_key.length > 128
    || !Number.isFinite(Date.parse(envelope.source.captured_at))) throw new Error("CONTACT_HANDOFF_INVALID");
  normalizeLocalOrigin(envelope.handoff_target);
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/u.exec(envelope.review.data_url ?? "");
  if (!match || match[0].length > 8_000_000 || match[1] !== envelope.review.mime_type) throw new Error("CONTACT_HANDOFF_IMAGE_INVALID");
  const bytes = Uint8Array.from(atob(match[2]), character => character.charCodeAt(0));
  if (!bytes.length) throw new Error("CONTACT_HANDOFF_IMAGE_EMPTY");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let browserSource;
  if (envelope.source.url && envelope.source.title) {
    const url=new URL(envelope.source.url);
    if (url.username || url.password || (!["https:","http:"].includes(url.protocol) && url.href!=="local-file://reviewed-screenshot")) throw new Error("CONTACT_HANDOFF_SOURCE_INVALID");
    url.search=""; url.hash="";
    if(url.href.length>1000)throw new Error("CONTACT_HANDOFF_SOURCE_TOO_LONG");
    browserSource={title:envelope.source.title.slice(0,500),locator:url.href};
  }
  return { idempotency_key: envelope.idempotency_key, captured_at: envelope.source.captured_at,
    ...(browserSource?{browser_source:browserSource}:{}),
    objective: "整理这张我已审阅的截图；聊天按来源归档，个人主页生成可编辑的联系人草稿。",
    image: { media_type: match[1], byte_size: bytes.length, content_hash: [...digest].map(byte => byte.toString(16).padStart(2,"0")).join(""), data_base64: match[2] },
    allow_public_research: false };
}

export function contactTaskReviewURL(origin, taskID) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(taskID)) throw new Error("CONTACT_TASK_ID_INVALID");
  const url = new URL("/contact-agent", normalizeLocalOrigin(origin));
  url.searchParams.set("task", taskID); url.searchParams.set("source", "browser-extension"); return url.toString();
}

/** Runs in the newly opened, exact trusted Web origin. Cookies stay in Web. */
export async function submitContactTaskInWeb(origin, sessionVersion, payload) {
  if (location.origin !== origin || location.pathname !== "/contact-agent") return { state: "failed", code: "session_stale", no_submit: true };
  const sessionResponse = await fetch("/api/browser-extension/session", { credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
  const session = await sessionResponse.json();
  if (!sessionResponse.ok || !sessionVersion || session.session_version !== sessionVersion || session.contact_agent !== true) {
    return { state: "failed", code: "session_stale", no_submit: true };
  }
  const response = await fetch("/api/contact-agent/tasks", { method: "POST", credentials: "same-origin", redirect: "error",
    headers: { "content-type": "application/json", "x-contact-handoff-session": sessionVersion }, body: JSON.stringify(payload), signal: AbortSignal.timeout(40_000) });
  const created = await response.json();
  if (!response.ok) return { state: "failed", code: response.status === 401 || created.code === "session_stale" ? "session_stale" : "contact_handoff_rejected" };
  if (!/^[0-9a-f-]{36}$/iu.test(created.task_id)) throw new Error("CONTACT_TASK_RECEIPT_INVALID");
  const readback = await fetch(`/api/contact-agent/tasks/${created.task_id}`, { credentials: "same-origin", headers: { "x-contact-handoff-session": sessionVersion }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
  const saved = await readback.json();
  if (!readback.ok || saved.task_id !== created.task_id) throw new Error("CONTACT_TASK_READBACK_FAILED");
  return { state: "received", receipt_id: saved.task_id, capture_id: saved.task_id, contact_task_id: saved.task_id,
    duplicate: response.status === 200, message: "The reviewed image reached the shared Agent. Continue in Web; profile fields still require your review." };
}

/** Read-only lookup after panel/service-worker restart; never resubmit pixels. */
export async function recoverContactTaskInWeb(origin, sessionVersion, requestKey) {
  if (location.origin !== origin || location.pathname !== "/contact-agent") return { state: "failed", code: "session_stale" };
  const sessionResponse = await fetch("/api/browser-extension/session", { credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
  const session = await sessionResponse.json();
  if (!sessionResponse.ok || !sessionVersion || session.session_version !== sessionVersion || session.contact_agent !== true) return { state: "failed", code: "session_stale", message: "Sign in to the original Web session to recover this handoff." };
  const response = await fetch(`/api/contact-agent/tasks?handoff_request_id=${encodeURIComponent(requestKey)}`, {
    credentials: "same-origin", headers: { "x-contact-handoff-session": sessionVersion }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
  const saved = await response.json();
  if (!response.ok || !/^[0-9a-f-]{36}$/iu.test(saved.task_id)) return { state: "unknown", code: "contact_handoff_unverified", message: "No receipt is available yet. Check again before submitting another copy." };
  if (["deleted", "expired", "cancelled"].includes(saved.status)) return { state: "unavailable", code: "contact_handoff_unavailable", message: "The original task is no longer available. It was not recreated." };
  return { state: "received", contact_task_id: saved.task_id, receipt_id: saved.task_id, duplicate: true,
    message: "Recovered the original task. No image was submitted again." };
}
