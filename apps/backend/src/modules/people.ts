import {
  CONTRACT_VERSION,
  normalizeIdentityHandle,
  parseIdentityHandleQuery,
  type IdentityHandleType,
  type PersonDirectoryIdentityMatch,
  type PersonDirectoryResponse,
  type RelationshipScope,
} from "@talent-signal/contracts";
import type { Pool } from "pg";

import type { AuthContext } from "./auth.js";
import { ApiError } from "../lib/apiError.js";
import { sha256 } from "../lib/hash.js";

interface PersonDirectoryRow {
  id: string;
  display_label: string;
  context_count: number;
  capture_count: number;
  confirmed_identity_count: number;
  last_activity_at: Date;
  name_match: boolean;
  matched_handle_status: "confirmed" | "expired" | null;
  matched_handle_type: IdentityHandleType | null;
  matched_handle_hint: string | null;
  matched_handle_source_resource_id: string | null;
  matched_handle_valid_until: Date | null;
  profile_headline: string | null;
  profile_summary: string | null;
  profile_provenance_kind: "user_authored" | null;
  profile_authored_by_user_id: string | null;
  profile_revision: number | null;
  profile_updated_at: Date | null;
  contexts: Array<{
    id: string;
    display_label: string;
    last_activity_at: string;
  }>;
}

async function queryPeople(
  pool: Pool,
  auth: AuthContext,
  query = "",
  includeConfirmedHandleMatch = false,
): Promise<PersonDirectoryResponse> {
  const normalizedQuery = query.normalize("NFKC").trim().toLowerCase();
  const parsedHandle = includeConfirmedHandleMatch
    ? parseIdentityHandleQuery(query)
    : null;
  const normalizedHandle = parsedHandle
    ? normalizeIdentityHandle(parsedHandle.type, parsedHandle.value)
    : null;
  const nameQuery = parsedHandle ? "" : normalizedQuery;
  const handleType = parsedHandle?.type ?? null;
  const handleHash = normalizedHandle ? sha256(normalizedHandle) : null;
  const result = await pool.query<PersonDirectoryRow>(
    `SELECT
       subjects.id,
       subjects.display_label,
       person_profiles.headline AS profile_headline,
       person_profiles.summary AS profile_summary,
       person_profiles.provenance_kind AS profile_provenance_kind,
       person_profiles.authored_by_user_id AS profile_authored_by_user_id,
       person_profiles.revision AS profile_revision,
       person_profiles.updated_at AS profile_updated_at,
       ($2 <> '' AND lower(subjects.display_label) LIKE '%' || $2 || '%')
         AS name_match,
       matched_handle.handle_type AS matched_handle_type,
       matched_handle.match_status AS matched_handle_status,
       matched_handle.display_hint AS matched_handle_hint,
       matched_handle.source_resource_id
         AS matched_handle_source_resource_id,
       matched_handle.valid_until AS matched_handle_valid_until,
       (
         SELECT COUNT(*)::integer
         FROM assignments
         WHERE assignments.account_id = subjects.account_id
           AND assignments.subject_id = subjects.id
           AND assignments.status = 'active'
       ) AS context_count,
       (
         SELECT COUNT(*)::integer
         FROM captures
         WHERE captures.account_id = subjects.account_id
           AND captures.subject_id = subjects.id
           AND captures.status = 'active'
       ) AS capture_count,
       (
         SELECT COUNT(*)::integer
         FROM identity_handles confirmed_handles
         LEFT JOIN source_resources confirmed_resources
           ON confirmed_resources.account_id = confirmed_handles.account_id
          AND confirmed_resources.id = confirmed_handles.source_resource_id
         LEFT JOIN source_retention_receipts confirmed_receipts
           ON confirmed_receipts.account_id = confirmed_resources.account_id
          AND confirmed_receipts.capture_id = confirmed_resources.capture_id
         WHERE confirmed_handles.account_id = subjects.account_id
           AND confirmed_handles.subject_id = subjects.id
           AND confirmed_handles.status = 'confirmed'
           AND (
             confirmed_handles.valid_until IS NULL
             OR confirmed_handles.valid_until > now()
           )
           AND (
             confirmed_handles.source_resource_id IS NULL
             OR (
               confirmed_receipts.authorization_state = 'authorized'
               AND (
                 confirmed_receipts.authorization_expires_at IS NULL
                 OR confirmed_receipts.authorization_expires_at > now()
               )
             )
           )
       ) AS confirmed_identity_count,
       COALESCE(
         (
           SELECT MAX(captures.created_at)
           FROM captures
           WHERE captures.account_id = subjects.account_id
             AND captures.subject_id = subjects.id
             AND captures.status = 'active'
         ),
         subjects.created_at
       ) AS last_activity_at,
       COALESCE(
         (
           SELECT jsonb_agg(
             jsonb_build_object(
               'id', contexts.id,
               'display_label', contexts.display_label,
               'last_activity_at', contexts.last_activity_at
             )
             ORDER BY contexts.last_activity_at DESC, contexts.id
           )
           FROM (
             SELECT
               assignments.id,
               assignments.display_label,
               COALESCE(MAX(captures.created_at), assignments.created_at)
                 AS last_activity_at
             FROM assignments
             LEFT JOIN captures
               ON captures.account_id = assignments.account_id
              AND captures.assignment_id = assignments.id
              AND captures.status = 'active'
             WHERE assignments.account_id = subjects.account_id
               AND assignments.subject_id = subjects.id
               AND assignments.status = 'active'
             GROUP BY assignments.id
             ORDER BY last_activity_at DESC, assignments.id
             LIMIT 20
           ) contexts
         ),
         '[]'::jsonb
       ) AS contexts
     FROM subjects
     LEFT JOIN person_profiles
       ON person_profiles.account_id = subjects.account_id
      AND person_profiles.subject_id = subjects.id
     LEFT JOIN LATERAL (
       SELECT
         handles.handle_type,
         handles.display_hint,
         handles.source_resource_id,
         handles.valid_until,
         CASE
           WHEN handles.status = 'confirmed'
             AND (
               handles.valid_until IS NULL
               OR handles.valid_until > now()
             )
             THEN 'confirmed'
           ELSE 'expired'
         END AS match_status
       FROM identity_handles handles
       LEFT JOIN source_resources handle_resources
         ON handle_resources.account_id = handles.account_id
        AND handle_resources.id = handles.source_resource_id
       LEFT JOIN source_retention_receipts handle_receipts
         ON handle_receipts.account_id = handle_resources.account_id
        AND handle_receipts.capture_id = handle_resources.capture_id
       WHERE handles.account_id = subjects.account_id
         AND handles.subject_id = subjects.id
         AND handles.status IN ('confirmed', 'expired')
         AND $3::text IS NOT NULL
         AND handles.handle_type = $3
         AND handles.normalized_value_hash = $4
         AND (
           handles.source_resource_id IS NULL
           OR (
             handle_receipts.authorization_state = 'authorized'
             AND (
               handle_receipts.authorization_expires_at IS NULL
               OR handle_receipts.authorization_expires_at > now()
             )
           )
         )
       ORDER BY
         CASE
           WHEN handles.status = 'confirmed'
             AND (
               handles.valid_until IS NULL
               OR handles.valid_until > now()
             )
             THEN 0
           ELSE 1
         END,
         handles.valid_until DESC NULLS LAST,
         handles.created_at DESC,
         handles.id
       LIMIT 1
     ) matched_handle ON true
     WHERE subjects.account_id = $1
       AND subjects.status = 'active'
       AND (
         ($2 = '' AND $3::text IS NULL)
         OR (
           $2 <> ''
           AND lower(subjects.display_label) LIKE '%' || $2 || '%'
         )
         OR matched_handle.handle_type IS NOT NULL
       )
     ORDER BY
       CASE matched_handle.match_status
         WHEN 'confirmed' THEN 0
         WHEN 'expired' THEN 1
         ELSE 2
       END,
       last_activity_at DESC,
       subjects.id
     LIMIT 20`,
    [auth.accountId, nameQuery, handleType, handleHash],
  );

  return {
    contract_version: CONTRACT_VERSION,
    people: result.rows.map((person) => {
      const identityMatches: PersonDirectoryIdentityMatch[] = [];
      if (person.name_match) {
        identityMatches.push({ kind: "name" });
      }
      if (
        person.matched_handle_type &&
        person.matched_handle_status === "confirmed"
      ) {
        identityMatches.push({
          kind: "confirmed_handle",
          handle_type: person.matched_handle_type,
          display_hint:
            person.matched_handle_hint ??
            `Confirmed ${person.matched_handle_type}`,
          source_resource_id:
            person.matched_handle_source_resource_id,
        });
      } else if (
        person.matched_handle_type &&
        person.matched_handle_status === "expired" &&
        person.matched_handle_valid_until
      ) {
        identityMatches.push({
          kind: "expired_handle",
          handle_type: person.matched_handle_type,
          display_hint:
            person.matched_handle_hint ??
            `Expired ${person.matched_handle_type}`,
          source_resource_id:
            person.matched_handle_source_resource_id,
          expired_at:
            person.matched_handle_valid_until.toISOString(),
        });
      }
      return {
        id: person.id,
        display_label: person.display_label,
        context_count: person.context_count,
        capture_count: person.capture_count,
        confirmed_identity_count: person.confirmed_identity_count,
        last_activity_at: person.last_activity_at.toISOString(),
        profile:
          person.profile_headline &&
          person.profile_summary &&
          person.profile_provenance_kind &&
          person.profile_authored_by_user_id &&
          person.profile_revision &&
          person.profile_updated_at
            ? {
                headline: person.profile_headline,
                summary: person.profile_summary,
                provenance_kind: person.profile_provenance_kind,
                authored_by_user_id: person.profile_authored_by_user_id,
                revision: person.profile_revision,
                updated_at: person.profile_updated_at.toISOString(),
              }
            : null,
        contexts: person.contexts.map((context) => ({
          id: context.id,
          display_label: context.display_label,
          last_activity_at: new Date(
            context.last_activity_at,
          ).toISOString(),
        })),
        identity_matches: identityMatches,
      };
    }),
  };
}

export async function listPeople(
  pool: Pool,
  auth: AuthContext,
  query = "",
): Promise<PersonDirectoryResponse> {
  return queryPeople(pool, auth, query, false);
}

export async function searchPeople(
  pool: Pool,
  auth: AuthContext,
  query: string,
): Promise<PersonDirectoryResponse> {
  return queryPeople(pool, auth, query, true);
}

export async function getRelationshipScope(
  pool: Pool,
  auth: AuthContext,
  personId: string,
  relationshipContextId: string,
): Promise<RelationshipScope> {
  const result = await pool.query<{
    person_id: string;
    person_label: string;
    context_id: string;
    context_label: string;
  }>(
    `SELECT
       subjects.id AS person_id,
       subjects.display_label AS person_label,
       assignments.id AS context_id,
       assignments.display_label AS context_label
     FROM subjects
     JOIN assignments
       ON assignments.account_id = subjects.account_id
      AND assignments.subject_id = subjects.id
     WHERE subjects.account_id = $1
       AND subjects.id = $2
       AND assignments.id = $3
       AND subjects.status = 'active'
       AND assignments.status = 'active'`,
    [auth.accountId, personId, relationshipContextId],
  );
  const scope = result.rows[0];
  if (!scope) {
    const merged = await pool.query<{
      merged_into_subject_id: string;
    }>(
      `SELECT subjects.merged_into_subject_id
       FROM subjects
       JOIN assignments
         ON assignments.account_id = subjects.account_id
        AND assignments.id = $3
        AND assignments.subject_id = subjects.merged_into_subject_id
        AND assignments.status = 'active'
       WHERE subjects.account_id = $1
         AND subjects.id = $2
         AND subjects.status = 'merged'
         AND subjects.merged_into_subject_id IS NOT NULL`,
      [auth.accountId, personId, relationshipContextId],
    );
    const destination = merged.rows[0]?.merged_into_subject_id;
    if (destination) {
      throw new ApiError(
        409,
        "PERSON_MERGED",
        "This person page was merged into the retained person.",
        {
          merged_into_person_id: destination,
          relationship_context_id: relationshipContextId,
        },
      );
    }
    throw new ApiError(
      404,
      "RELATIONSHIP_CONTEXT_NOT_FOUND",
      "The active person and relationship context were not found together.",
    );
  }
  return {
    contract_version: CONTRACT_VERSION,
    person: {
      id: scope.person_id,
      display_label: scope.person_label,
    },
    relationship_context: {
      id: scope.context_id,
      display_label: scope.context_label,
    },
  };
}
