import type { Pool, PoolClient } from "pg";

import { ApiError } from "../lib/apiError.js";
import { digestValue } from "../lib/hash.js";

export function isCompleteReviewDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return false;
  const date = new Date(`${value.trim()}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value.trim();
}

export function requiresCalendarDate(field: string, value: string): boolean {
  return field === "decision_deadline" ||
    (field === "availability" && /next|tomorrow|yesterday|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|下周|本周|周[一二三四五六日天]|明天|今天|昨天|下月/i.test(value));
}

interface AuthorityRow {
  id: string;
  field: string;
  proposed_value: string | null;
  subject_kind: string;
  evidence_quote: string | null;
  capture_status: string;
  identity_status: string;
  subject_id: string | null;
  assignment_id: string | null;
  capture_version: number;
  resource_kind: string | null;
  resource_state: string | null;
  fragment_id: string | null;
  fragment_status: string | null;
  review_status: string | null;
  attributed_actor: string | null;
  attribution_status: string | null;
  content_hash: string | null;
  text_content: string | null;
  last_review_id: string | null;
  authorization_state: string;
  authorization_expires_at: Date | null;
  person_version: number | null;
  person_status: string | null;
  assignment_status: string | null;
}

/** Same basis is used by readback and the locked decision transaction. */
export async function loadClaimReviewAuthority(
  client: Pool | PoolClient, accountId: string, assertionId: string,
) {
  const result = await client.query<AuthorityRow>(
    `SELECT a.id, a.field, a.proposed_value, a.subject_kind, a.evidence_quote,
       c.status AS capture_status, c.identity_status, c.subject_id, c.assignment_id,
       c.version AS capture_version, s.version AS person_version,
       s.status AS person_status, context.status AS assignment_status,
       r.resource_kind, r.processing_state AS resource_state,
       f.id AS fragment_id, f.status AS fragment_status, f.review_status,
       f.attributed_actor, f.attribution_status, f.content_hash, f.text_content,
       (SELECT id FROM evidence_fragment_reviews reviews
         WHERE reviews.account_id = a.account_id AND reviews.fragment_id = f.id
         ORDER BY review_revision DESC LIMIT 1) AS last_review_id,
       CASE WHEN receipts.authorization_state = 'authorized'
          AND receipts.authorization_expires_at <= now() THEN 'expired'
          ELSE receipts.authorization_state END AS authorization_state,
       receipts.authorization_expires_at
     FROM proposed_assertions a
     JOIN captures c ON c.account_id = a.account_id AND c.id = a.capture_id
     JOIN source_retention_receipts receipts ON receipts.account_id = c.account_id AND receipts.capture_id = c.id
     LEFT JOIN evidence_fragments f ON f.account_id = a.account_id AND f.id = a.evidence_fragment_id
     LEFT JOIN source_resources r ON r.account_id = f.account_id AND r.id = f.resource_id
     LEFT JOIN subjects s ON s.account_id = c.account_id AND s.id = c.subject_id
     LEFT JOIN assignments context ON context.account_id = c.account_id AND context.id = c.assignment_id
     WHERE a.account_id = $1 AND a.id = $2`, [accountId, assertionId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "ASSERTION_NOT_FOUND", "The assertion is unavailable.");
  const blockers: string[] = [];
  if (row.capture_status !== "active" || row.authorization_state !== "authorized") blockers.push("source_unavailable");
  if (row.identity_status !== "bound" || !row.subject_id || !row.assignment_id ||
      row.person_status !== "active" || row.assignment_status !== "active") blockers.push("identity_unresolved");
  if (row.fragment_id && (row.fragment_status !== "active" || row.review_status !== "reviewed" ||
      row.resource_state === "deleted" || !row.text_content || !row.evidence_quote ||
      !row.text_content.includes(row.evidence_quote))) blockers.push("evidence_needs_review");
  if (row.fragment_id && row.subject_kind === "candidate" &&
      (row.attributed_actor !== "candidate" || row.attribution_status !== "confirmed")) blockers.push("speaker_unresolved");
  if (requiresCalendarDate(row.field, row.proposed_value ?? "") && !isCompleteReviewDate(row.proposed_value ?? "")) blockers.push("calendar_date_required");
  const { text_content: _text, proposed_value: _value, evidence_quote: _quote,
    resource_state: _processingState, ...basis } = row;
  // A successful decision changes workflow progress, not its evidence authority.
  return { token: digestValue({ ...basis, source_deleted: row.resource_state === "deleted" }), blockers, row };
}
