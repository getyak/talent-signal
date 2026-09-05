import { randomUUID } from "node:crypto";

import { PROHIBITED_INFERENCE_TERMS } from "@talent-signal/contracts";
import type { PoolClient } from "pg";

import { appendAudit } from "../lib/audit.js";
import { sha256 } from "../lib/hash.js";
import type { AuthContext } from "./auth.js";
import { isCompleteReviewDate, requiresCalendarDate } from "./claimReviewAuthority.js";

const PRODUCER_NAME = "conservative-resource-claim-compiler";
const PRODUCER_VERSION = "1.0.0";
const MAX_CLAIMS = 24;

export interface ExtractedResourceClaim {
  field: string;
  value: string;
  evidenceQuote: string;
  certainty: "proposed" | "ambiguous";
}

interface FragmentClaimContext {
  fragment_id: string;
  capture_id: string;
  resource_id: string;
  resource_kind:
    | "conversation_screenshot"
    | "conversation_transcript"
    | "resume"
    | "document"
    | "public_url"
    | "personal_note"
    | "contact_record";
  duplicate_of_resource_id: string | null;
  fragment_sequence: number;
  text_content: string | null;
  content_hash: string;
  review_status: "proposed" | "reviewed" | "rejected";
  attributed_actor:
    | "candidate"
    | "recruiter"
    | "client"
    | "document_author"
    | "public_source"
    | "unknown";
  attribution_status: "confirmed" | "proposed" | "unknown";
  subject_id: string | null;
  assignment_id: string | null;
  identity_status: "bound" | "ambiguous" | "unbound";
}

export function resourceFragmentClaimAuthority(
  context: Pick<
    FragmentClaimContext,
    "resource_kind" | "attributed_actor" | "attribution_status"
  >,
): { allowed: boolean; subjectKind: "candidate" | "unknown" } {
  if (["conversation_transcript", "conversation_screenshot"].includes(context.resource_kind)) {
    const candidateConfirmed =
      context.attributed_actor === "candidate" &&
      context.attribution_status === "confirmed";
    return {
      allowed: candidateConfirmed,
      subjectKind: candidateConfirmed ? "candidate" : "unknown",
    };
  }
  return {
    allowed: ["resume", "document", "public_url", "contact_record"].includes(
      context.resource_kind,
    ),
    subjectKind: "unknown",
  };
}

const LABEL_RULES: Array<{
  field: string;
  pattern: RegExp;
}> = [
  {
    field: "current_role",
    pattern:
      /^(?:current\s+(?:role|title)|role|title|当前职位|职位|职务)\s*[:：]\s*(.+)$/i,
  },
  {
    field: "current_employer",
    pattern:
      /^(?:current\s+(?:company|employer)|company|employer|当前公司|公司|雇主)\s*[:：]\s*(.+)$/i,
  },
  {
    field: "location",
    pattern:
      /^(?:location|based\s+in|所在地|地点|城市)\s*[:：]\s*(.+)$/i,
  },
  {
    field: "availability",
    pattern:
      /^(?:availability|available\s+from|到岗时间|可入职时间)\s*[:：]\s*(.+)$/i,
  },
  {
    field: "notice_period",
    pattern:
      /^(?:notice\s+period|通知期|离职周期)\s*[:：]\s*(.+)$/i,
  },
  {
    field: "work_mode_preference",
    pattern:
      /^(?:work\s+mode|working\s+model|工作模式|办公模式)\s*[:：]\s*(.+)$/i,
  },
  {
    field: "relocation_requirement",
    pattern:
      /^(?:relocation|relocate|搬迁|是否接受搬迁)\s*[:：]\s*(.+)$/i,
  },
  {
    field: "decision_deadline",
    pattern:
      /^(?:decision\s+deadline|deadline|决策截止|截止日期)\s*[:：]\s*(.+)$/i,
  },
  {
    field: "competing_process",
    pattern:
      /^(?:competing\s+process|other\s+process|其他流程|竞对流程)\s*[:：]\s*(.+)$/i,
  },
];

function compact(value: string, maximum = 500): string {
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  return normalized.length <= maximum
    ? normalized
    : normalized.slice(0, maximum).trimEnd();
}

function safeQuote(value: string): boolean {
  const lower = value.toLowerCase();
  return !PROHIBITED_INFERENCE_TERMS.some((term) =>
    lower.includes(term.replaceAll("_", " ")),
  );
}

function splitRoleAndEmployer(
  value: string,
  evidenceQuote: string,
): ExtractedResourceClaim[] {
  const match = value.match(/^(.{2,100}?)\s+at\s+(.{2,140})$/i);
  if (!match?.[1] || !match[2]) {
    return [
      {
        field: "current_role",
        value: compact(value),
        evidenceQuote,
        certainty: "proposed",
      },
    ];
  }
  return [
    {
      field: "current_role",
      value: compact(match[1]),
      evidenceQuote,
      certainty: "proposed",
    },
    {
      field: "current_employer",
      value: compact(match[2].replace(/[.。]$/, "")),
      evidenceQuote,
      certainty: "proposed",
    },
  ];
}

export function extractConservativeResourceClaims(
  text: string,
): ExtractedResourceClaim[] {
  const claims: ExtractedResourceClaim[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 300);

  for (const line of lines) {
    if (claims.length >= MAX_CLAIMS || !safeQuote(line)) {
      continue;
    }
    const normalizedLine = line.normalize("NFKC").replace(/\s+/g, " ").trim();
    let matchedLabel = false;
    for (const rule of LABEL_RULES) {
      const match = normalizedLine.match(rule.pattern);
      const value = match?.[1] ? compact(match[1]) : "";
      if (!value) {
        continue;
      }
      matchedLabel = true;
      if (rule.field === "current_role") {
        claims.push(...splitRoleAndEmployer(value, line));
      } else {
        claims.push({
          field: rule.field,
          value,
          evidenceQuote: line,
          certainty: requiresCalendarDate(rule.field, value) && !isCompleteReviewDate(value)
            ? "ambiguous" : "proposed",
        });
      }
      break;
    }
    if (matchedLabel) {
      continue;
    }

    const current = normalizedLine.match(
      /^currently\s+(.{2,100}?)\s+at\s+(.{2,140})[.。]?$/i,
    );
    if (current?.[1] && current[2]) {
      claims.push(
        {
          field: "current_role",
          value: compact(current[1]),
          evidenceQuote: line,
          certainty: "proposed",
        },
        {
          field: "current_employer",
          value: compact(current[2].replace(/[.。]$/, "")),
          evidenceQuote: line,
          certainty: "proposed",
        },
      );
      continue;
    }

    const history = normalizedLine.match(
      /^((?:19|20)\d{2})\s*[-–—]\s*((?:19|20)\d{2}|present|current|至今)\s+(.{3,300})$/i,
    );
    if (history) {
      claims.push({
        field: `professional_history.${sha256(normalizedLine).slice(0, 12)}`,
        value: compact(normalizedLine),
        evidenceQuote: line,
        certainty: "proposed",
      });
    }
  }

  const unique = new Map<string, ExtractedResourceClaim>();
  for (const claim of claims.slice(0, MAX_CLAIMS)) {
    unique.set(
      `${claim.field}\u0000${claim.value}\u0000${claim.evidenceQuote}`,
      claim,
    );
  }
  return [...unique.values()].slice(0, MAX_CLAIMS);
}

export async function proposeResourceClaimsForFragment(
  client: PoolClient,
  auth: AuthContext,
  fragmentId: string,
): Promise<number> {
  const result = await client.query<FragmentClaimContext>(
    `SELECT
       fragments.id AS fragment_id,
       fragments.capture_id,
       fragments.resource_id,
       fragments.sequence AS fragment_sequence,
       fragments.text_content,
       fragments.content_hash,
       fragments.review_status,
       fragments.attributed_actor,
       fragments.attribution_status,
       resources.resource_kind,
       resources.duplicate_of_resource_id,
       captures.subject_id,
       captures.assignment_id,
       captures.identity_status
     FROM evidence_fragments fragments
     JOIN source_resources resources
       ON resources.account_id = fragments.account_id
      AND resources.id = fragments.resource_id
     JOIN captures
       ON captures.account_id = resources.account_id
      AND captures.id = resources.capture_id
     WHERE fragments.account_id = $1
       AND fragments.id = $2
       AND fragments.status = 'active'
       AND resources.processing_state <> 'deleted'
       AND captures.status = 'active'`,
    [auth.accountId, fragmentId],
  );
  const context = result.rows[0];
  const authority = context
    ? resourceFragmentClaimAuthority(context)
    : { allowed: false, subjectKind: "unknown" as const };
  if (
    !context ||
    context.review_status !== "reviewed" ||
    context.identity_status !== "bound" ||
    !context.subject_id ||
    !context.assignment_id ||
    !context.text_content ||
    context.duplicate_of_resource_id ||
    !authority.allowed
  ) {
    return 0;
  }

  const extracted = extractConservativeResourceClaims(
    context.text_content,
  );
  if (extracted.length === 0) {
    return 0;
  }
  const existing = await client.query<{
    field: string;
    evidence_quote: string | null;
  }>(
    `SELECT field, evidence_quote
     FROM proposed_assertions
     WHERE account_id = $1
       AND evidence_fragment_id = $2
       AND review_status <> 'deleted'`,
    [auth.accountId, fragmentId],
  );
  const existingKeys = new Set(
    existing.rows.map(
      (item) => `${item.field}\u0000${item.evidence_quote ?? ""}`,
    ),
  );
  const newClaims = extracted.filter(
    (claim) =>
      !existingKeys.has(
        `${claim.field}\u0000${claim.evidenceQuote}`,
      ),
  );
  if (newClaims.length === 0) {
    return 0;
  }

  const sourceMessageId = `resource-fragment:${fragmentId}`;
  const evidenceSpeaker =
    context.attributed_actor === "candidate" ||
    context.attributed_actor === "recruiter"
      ? context.attributed_actor
      : "unknown";
  const evidenceId = randomUUID();
  const evidence = await client.query<{ id: string }>(
    `INSERT INTO evidence_items(
       id, account_id, capture_id, source_message_id, sequence,
       speaker, redacted_text, content_hash
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (account_id, capture_id, source_message_id)
     DO UPDATE SET
       redacted_text = EXCLUDED.redacted_text,
       content_hash = EXCLUDED.content_hash
     RETURNING id`,
    [
      evidenceId,
      auth.accountId,
      context.capture_id,
      sourceMessageId,
      context.fragment_sequence,
      evidenceSpeaker,
      context.text_content,
      context.content_hash,
    ],
  );
  const evidenceItemId = evidence.rows[0]?.id;
  if (!evidenceItemId) {
    return 0;
  }

  const fields = [...new Set(newClaims.map((claim) => claim.field))];
  const activeStates = await client.query<{
    id: string;
    field: string;
    value_text: string | null;
  }>(
    `SELECT id, field, value_text
     FROM confirmed_states
     WHERE account_id = $1
       AND assignment_id = $2
       AND field = ANY($3::text[])
       AND status = 'active'`,
    [auth.accountId, context.assignment_id, fields],
  );
  const activeByField = new Map(
    activeStates.rows.map((state) => [state.field, state]),
  );
  const distinctValuesByField = new Map<string, Set<string>>();
  for (const claim of newClaims) {
    const values =
      distinctValuesByField.get(claim.field) ?? new Set<string>();
    values.add(claim.value);
    distinctValuesByField.set(claim.field, values);
  }

  const proposalId = randomUUID();
  const anyAmbiguous = newClaims.some((claim) => {
    const active = activeByField.get(claim.field);
    return (
      claim.certainty === "ambiguous" ||
      context.resource_kind === "public_url" ||
      (distinctValuesByField.get(claim.field)?.size ?? 0) > 1 ||
      Boolean(active && active.value_text !== claim.value)
    );
  });
  await client.query(
    `INSERT INTO analysis_proposals(
       id, account_id, capture_id, disposition, producer_kind,
       producer_name, producer_version
     )
     VALUES ($1, $2, $3, $4, 'fixture_compiler', $5, $6)`,
    [
      proposalId,
      auth.accountId,
      context.capture_id,
      anyAmbiguous ? "clarify" : "no_action",
      PRODUCER_NAME,
      PRODUCER_VERSION,
    ],
  );

  for (const claim of newClaims) {
    const active = activeByField.get(claim.field);
    const conflictsWithinSource =
      (distinctValuesByField.get(claim.field)?.size ?? 0) > 1;
    const conflictsWithState =
      Boolean(active) && active?.value_text !== claim.value;
    const ambiguous =
      claim.certainty === "ambiguous" ||
      context.resource_kind === "public_url" ||
      conflictsWithinSource ||
      conflictsWithState;
    const temporalRelation = active
      ? active.value_text === claim.value
        ? "reinforces"
        : "supersedes"
      : "new";
    await client.query(
      `INSERT INTO proposed_assertions(
         id, account_id, capture_id, analysis_proposal_id, evidence_id,
         evidence_fragment_id, field, proposal_status, proposed_value,
         evidence_quote, subject_kind, temporal_relation,
         supersedes_state_id
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13
       )`,
      [
        randomUUID(),
        auth.accountId,
        context.capture_id,
        proposalId,
        evidenceItemId,
        fragmentId,
        claim.field,
        ambiguous ? "ambiguous" : "proposed",
        claim.value,
        claim.evidenceQuote,
        authority.subjectKind,
        temporalRelation,
        temporalRelation === "supersedes" ? active?.id ?? null : null,
      ],
    );
  }

  await appendAudit(
    client,
    { accountId: auth.accountId, actorUserId: auth.userId },
    "resource_claims.proposed",
    "evidence_fragment",
    fragmentId,
    {
      proposal_id: proposalId,
      resource_id: context.resource_id,
      claim_count: newClaims.length,
      ambiguous: anyAmbiguous,
      producer: {
        name: PRODUCER_NAME,
        version: PRODUCER_VERSION,
      },
    },
  );
  return newClaims.length;
}
