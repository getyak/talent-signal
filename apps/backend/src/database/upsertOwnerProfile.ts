import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import type { PoolClient } from "pg";

import { loadConfig } from "../config.js";
import { createPool } from "./pool.js";

export const ownerProfile = {
  displayLabel: "cubxxw",
  headline: "Talent Signal 创建者 · 产品与工程负责人",
  summary:
    "cubxxw（Xiong Xinwei）是 Talent Signal 的创建者，也是当前产品与工程负责人。他把产品定位为面向独立招聘顾问的、安静且证据优先的关系智能工具，关注可信的关系动量、证据来源、人工判断与可逆操作。这条人物档案代表当前工作区的所有者，便于把与本人有关的产品、运营和协作情境稳定地归到同一身份。该介绍由工作区所有者明确要求写入，不来自候选人会话、公开资料或模型推断。",
} as const;

interface OwnerProfileOptions {
  accountSlug: string;
  userId?: string;
}

interface OwnerProfileReadback {
  account_id: string;
  subject_id: string;
  authored_by_user_id: string;
  display_label: string;
  headline: string;
  summary: string;
  provenance_kind: "user_authored";
  revision: number;
}

export function parseOwnerProfileArguments(args: string[]): OwnerProfileOptions {
  let accountSlug: string | undefined;
  let userId: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--account-slug") accountSlug = args[++index];
    else if (value === "--user-id") userId = args[++index];
    else throw new Error(`Unknown owner-profile argument: ${value}`);
  }
  if (!accountSlug?.trim()) {
    throw new Error(
      "--account-slug is required; owner profiles are never seeded globally.",
    );
  }
  const normalizedUserID = userId?.trim();
  return normalizedUserID
    ? { accountSlug: accountSlug.trim(), userId: normalizedUserID }
    : { accountSlug: accountSlug.trim() };
}

async function resolveOwner(
  client: PoolClient,
  options: OwnerProfileOptions,
): Promise<{ accountId: string; userId: string }> {
  const result = await client.query<{ account_id: string; user_id: string }>(
    `SELECT accounts.id AS account_id, users.id AS user_id
     FROM accounts
     JOIN users ON users.account_id = accounts.id
     WHERE accounts.slug = $1
       AND users.status = 'active'
       AND ($2::uuid IS NULL OR users.id = $2)
     ORDER BY users.created_at, users.id
     FOR UPDATE`,
    [options.accountSlug, options.userId ?? null],
  );
  if (result.rowCount !== 1) {
    throw new Error(
      result.rowCount === 0
        ? "The requested active account owner was not found."
        : "The account has multiple active users; pass --user-id explicitly.",
    );
  }
  const row = result.rows[0];
  if (!row) throw new Error("The requested active account owner was not found.");
  return { accountId: row.account_id, userId: row.user_id };
}

export async function upsertOwnerProfile(
  client: PoolClient,
  options: OwnerProfileOptions,
): Promise<OwnerProfileReadback> {
  const owner = await resolveOwner(client, options);
  const externalRef = `workspace-owner:${owner.userId}`;
  const subject = await client.query<{ id: string; status: string }>(
    `INSERT INTO subjects(id, account_id, external_ref, display_label)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (account_id, external_ref) DO UPDATE
       SET display_label = EXCLUDED.display_label
     RETURNING id, status`,
    [randomUUID(), owner.accountId, externalRef, ownerProfile.displayLabel],
  );
  if (subject.rows[0]?.status !== "active") {
    throw new Error("The existing owner person is deleted and was not resurrected.");
  }
  const subjectId = subject.rows[0].id;
  await client.query(
    `INSERT INTO person_profiles(
       account_id,
       subject_id,
       headline,
       summary,
       provenance_kind,
       authored_by_user_id
     ) VALUES ($1, $2, $3, $4, 'user_authored', $5)
     ON CONFLICT (account_id, subject_id) DO UPDATE SET
       headline = EXCLUDED.headline,
       summary = EXCLUDED.summary,
       provenance_kind = EXCLUDED.provenance_kind,
       authored_by_user_id = EXCLUDED.authored_by_user_id,
       revision = person_profiles.revision + 1,
       updated_at = now()
     WHERE person_profiles.headline IS DISTINCT FROM EXCLUDED.headline
        OR person_profiles.summary IS DISTINCT FROM EXCLUDED.summary
        OR person_profiles.authored_by_user_id IS DISTINCT FROM EXCLUDED.authored_by_user_id`,
    [
      owner.accountId,
      subjectId,
      ownerProfile.headline,
      ownerProfile.summary,
      owner.userId,
    ],
  );
  const readback = await client.query<OwnerProfileReadback>(
    `SELECT
       subjects.account_id,
       subjects.id AS subject_id,
       subjects.display_label,
       person_profiles.headline,
       person_profiles.summary,
       person_profiles.provenance_kind,
       person_profiles.authored_by_user_id,
       person_profiles.revision
     FROM subjects
     JOIN person_profiles
       ON person_profiles.account_id = subjects.account_id
      AND person_profiles.subject_id = subjects.id
     WHERE subjects.account_id = $1 AND subjects.id = $2`,
    [owner.accountId, subjectId],
  );
  if (!readback.rows[0]) throw new Error("Owner profile readback failed.");
  return readback.rows[0];
}

async function main(): Promise<void> {
  const options = parseOwnerProfileArguments(process.argv.slice(2));
  const pool = createPool(loadConfig());
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const readback = await upsertOwnerProfile(client, options);
    await client.query("COMMIT");
    process.stdout.write(`${JSON.stringify(readback, null, 2)}\n`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `Owner profile failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  });
}
