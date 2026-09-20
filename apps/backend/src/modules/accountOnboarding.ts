import { isIP } from "node:net";

import {
  CONTRACT_VERSION,
  type AccountOnboarding,
  type AccountOnboardingMutation,
  type AccountOnboardingPreview,
} from "@talent-signal/contracts";
import type { Pool, PoolClient } from "pg";

import { inTransaction } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { sha256 } from "../lib/hash.js";
import type { AuthContext } from "./auth.js";
import { previewPublicProfilePage } from "./research.js";

export type OnboardingStatus = "pending" | "completed" | "skipped";

type OnboardingUserRow = {
  id: string;
  kind: string;
  status: "active" | "revoked";
  display_name: string;
  onboarding_focus: string;
  onboarding_profile_url: string;
  onboarding_status: OnboardingStatus;
  profile_revision: number;
};

const writableKinds = new Set([
  "password_human",
  "google_human",
  "apple_human",
  "simulated_human",
]);

/**
 * Pure, DNS-free syntactic gate for a saved profile URL. The preview loader in
 * `research.ts` performs the full DNS/IP/robots safety check before any fetch.
 * Userinfo is rejected, never stripped: a URL that carries credentials is
 * refused rather than silently rewritten.
 */
export function isSafePublicProfileUrl(value: string): boolean {
  if (value.length === 0) {
    return true;
  }
  if (value.length > 2000) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") {
    return false;
  }
  if (url.username !== "" || url.password !== "") {
    return false;
  }
  const hostname = url.hostname.toLowerCase();
  if (isIP(hostname) !== 0) {
    return false;
  }
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return false;
  }
  // Require a registrable-looking public host; single-label hosts are local.
  return hostname.includes(".");
}

async function activeUserContext(
  client: PoolClient,
  auth: AuthContext,
  write: boolean,
): Promise<OnboardingUserRow> {
  const account = await client.query<{ id: string }>(
    `SELECT id FROM accounts WHERE id = $1 FOR ${write ? "UPDATE" : "SHARE"}`,
    [auth.accountId],
  );
  const user = await client.query<OnboardingUserRow>(
    `SELECT id, kind, status, display_name, onboarding_focus,
            onboarding_profile_url, onboarding_status, profile_revision
     FROM users
     WHERE account_id = $1 AND id = $2`,
    [auth.accountId, auth.userId],
  );
  const session = await client.query(
    `SELECT id FROM sessions
     WHERE id = $1 AND account_id = $2 AND user_id = $3
       AND revoked_at IS NULL AND expires_at > now()
     FOR SHARE`,
    [auth.sessionId, auth.accountId, auth.userId],
  );
  const row = user.rows[0];
  if (
    !account.rows[0] ||
    !row ||
    row.status !== "active" ||
    session.rowCount === 0
  ) {
    throw new ApiError(401, "SESSION_INVALID", "Sign in again.");
  }
  return row;
}

async function canonical(
  client: PoolClient,
  auth: AuthContext,
  user: OnboardingUserRow,
): Promise<AccountOnboarding> {
  return {
    contract_version: CONTRACT_VERSION,
    account_id: auth.accountId,
    user_id: user.id,
    display_name: user.display_name,
    focus: user.onboarding_focus,
    profile_url: user.onboarding_profile_url,
    status: user.onboarding_status,
    revision: user.profile_revision,
  };
}

export function readAccountOnboarding(
  pool: Pool,
  auth: AuthContext,
): Promise<AccountOnboarding> {
  return inTransaction(pool, async (client) => {
    const user = await activeUserContext(client, auth, false);
    return canonical(client, auth, user);
  });
}

function canonicalMutationHash(input: AccountOnboardingMutation): string {
  const ordered = Object.fromEntries(
    Object.entries(input).sort(([left], [right]) => left.localeCompare(right)),
  );
  return sha256(JSON.stringify(ordered));
}

export function mutateAccountOnboarding(
  pool: Pool,
  auth: AuthContext,
  input: AccountOnboardingMutation,
): Promise<AccountOnboarding> {
  return inTransaction(pool, async (client) => {
    // Share lock order with accountManagement: lock the account first, then
    // observe the user and the current session. Two profile writers therefore
    // serialize on the account row instead of racing on profile_revision.
    const user = await activeUserContext(client, auth, true);
    if (!writableKinds.has(user.kind)) {
      throw new ApiError(
        403,
        "TEST_ACCOUNT_READ_ONLY",
        "Return to your account to manage onboarding.",
      );
    }

    const requestHash = canonicalMutationHash(input);
    const previous = await client.query<{ request_hash: string }>(
      `SELECT request_hash FROM account_access_events
       WHERE account_id = $1 AND actor_user_id = $2 AND id = $3`,
      [auth.accountId, auth.userId, input.id],
    );
    if (previous.rows[0]) {
      if (previous.rows[0].request_hash !== requestHash) {
        throw new ApiError(
          409,
          "ACCOUNT_OPERATION_CONFLICT",
          "This operation ID was already used with a different request.",
        );
      }
      if (user.profile_revision !== input.expected_revision + 1) {
        throw new ApiError(409, "ONBOARDING_STALE", "The profile changed after that save. Read the current profile.");
      }
      return canonical(client, auth, user);
    }

    if (user.profile_revision !== input.expected_revision) {
      throw new ApiError(
        409,
        "ONBOARDING_STALE",
        "Refresh before saving onboarding.",
      );
    }

    const displayName = input.display_name.trim();
    const focus = input.focus.trim();
    const profileUrl = input.profile_url.trim();
    if (displayName.length === 0 || displayName.length > 100) {
      throw new ApiError(422, "ONBOARDING_INVALID", "Enter a display name.");
    }
    if (!isSafePublicProfileUrl(profileUrl)) {
      throw new ApiError(
        422,
        "ONBOARDING_PROFILE_URL_INVALID",
        "Enter an empty or public HTTPS profile URL.",
      );
    }

    const updated = await client.query<OnboardingUserRow>(
      `UPDATE users
       SET display_name = $3,
           onboarding_focus = $4,
           onboarding_profile_url = $5,
           onboarding_status = $6,
           profile_revision = profile_revision + 1
       WHERE account_id = $1 AND id = $2
       RETURNING id, kind, status, display_name, onboarding_focus,
                 onboarding_profile_url, onboarding_status, profile_revision`,
      [auth.accountId, auth.userId, displayName, focus, profileUrl, input.status],
    );
    const next = updated.rows[0];
    if (!next) {
      throw new ApiError(401, "SESSION_INVALID", "Sign in again.");
    }

    // Audit keeps revision and status only. Names, focus, and URLs never enter
    // the trail.
    const details = {
      revision_before: user.profile_revision,
      revision_after: next.profile_revision,
      status_before: user.onboarding_status,
      status_after: next.onboarding_status,
    };
    await client.query(
      `INSERT INTO account_access_events(
         id, account_id, actor_user_id, kind, request_hash, details
       ) VALUES ($1, $2, $3, 'onboarding', $4, $5)`,
      [input.id, auth.accountId, auth.userId, requestHash, JSON.stringify(details)],
    );
    return canonical(client, auth, next);
  });
}

/**
 * Read exactly one user-supplied public page so a human can edit a short
 * excerpt. Nothing is persisted and no contact, model call, or broad discovery
 * runs. Failures are sanitized: the caller learns the page was unreadable, not
 * why the upstream provider refused it.
 */
export async function previewAccountOnboardingProfile(
  url: string,
): Promise<AccountOnboardingPreview> {
  let preview;
  try {
    preview = await previewPublicProfilePage(url);
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.code === "ONBOARDING_PREVIEW_URL_INVALID" ||
        error.code === "ONBOARDING_PREVIEW_UNAVAILABLE")
    ) {
      throw error;
    }
    throw new ApiError(
      422,
      "ONBOARDING_PREVIEW_UNAVAILABLE",
      "That page is not publicly readable right now. You can still add your focus and profile URL manually.",
    );
  }
  return {
    contract_version: CONTRACT_VERSION,
    profile_url: preview.profileUrl,
    excerpt: preview.excerpt,
    retrieved_at: preview.retrievedAt.toISOString(),
  };
}
