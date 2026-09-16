import { randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import type { DatabaseClient } from "../database/pool.js";

import {
  dismissMeetingDraft,
  getMeetingDraft,
  listMeetingDrafts,
  updateMeetingDraft,
} from "./meetingDrafts.js";

const database = process.env.MEETING_DRAFT_TEST_DATABASE_URL;
if (database && !["127.0.0.1", "localhost"].includes(new URL(database).hostname)) {
  throw new Error("Use an isolated local PostgreSQL database for meeting draft tests.");
}
const pool = database ? new Pool({ connectionString: database }) : null;
const suite = database ? describe : describe.skip;

afterAll(async () => pool?.end());

async function removeProofAccount(accountID: string): Promise<void> {
  const tables = (
    await pool!.query<{ table_name: string }>(
      `SELECT table_name FROM lab_test_workspace_table_manifest
       WHERE scope='account' ORDER BY table_name`,
    )
  ).rows.map((row) => row.table_name);
  const targets = [...tables, "sessions"];
  await pool!.query(
    `WITH ${targets.map((table, index) =>
      `d${index} AS (DELETE FROM "${table}" WHERE account_id=$1 RETURNING 1)`
    ).join(",")}
     SELECT ${targets.map((_, index) =>
       `(SELECT count(*) FROM d${index})`
     ).join("+")} AS removed`,
    [accountID],
  );
  await pool!.query("DELETE FROM users WHERE account_id=$1", [accountID]);
  await pool!.query("DELETE FROM accounts WHERE id=$1", [accountID]);
}

suite("meeting draft source lifecycle", () => {
  it("persists edits idempotently, rejects stale intent, then blocks revoked-source export", async () => {
    const accountID = randomUUID();
    const userID = randomUUID();
    const sessionID = randomUUID();
    const taskID = randomUUID();
    const draftID = randomUUID();
    const editKey = randomUUID();
    const peerUserID = randomUUID();
    const otherAccountID = randomUUID();
    const otherUserID = randomUUID();
    const auth = {
      accountId: accountID,
      accountSlug: `meeting-${accountID}`,
      userId: userID,
      userEmail: `${userID}@example.test`,
      sessionId: randomUUID(),
      userKind: "simulated_human" as const,
    };
    try {
      await pool!.query(
        "INSERT INTO accounts(id,slug,name) VALUES($1,$2,'Meeting edit proof')",
        [accountID, auth.accountSlug],
      );
      await pool!.query(
        `INSERT INTO users(id,account_id,email,display_name,kind)
         VALUES($1,$2,$3,'Meeting proof','simulated_human')`,
        [userID, accountID, auth.userEmail],
      );
      await pool!.query(
        `INSERT INTO agent_sessions(
           account_id,id,created_by_user_id,revision,payload,created_at,expires_at
         ) VALUES($1,$2,$3,1,'{"turns":[]}'::jsonb,now(),now()+interval '7 days')`,
        [accountID, sessionID, userID],
      );
      await pool!.query(
        `INSERT INTO agent_session_chat_tasks(
           account_id,task_id,actor_user_id,origin_session_id,expires_at
         ) VALUES($1,$2,$3,$4,now()+interval '7 days')`,
        [accountID, taskID, userID, sessionID],
      );
      await pool!.query(
        `SELECT record_meeting_draft(
           $1,$2,$3,$4,$5,NULL,'Synthetic review',
           now()+interval '1 day',now()+interval '1 day 61 minutes',
           'UTC','Synthetic source excerpt',now(),now()+interval '6 days'
         )`,
        [accountID, draftID, userID, taskID, sessionID],
      );
      await pool!.query(
        `INSERT INTO users(id,account_id,email,display_name,kind)
         VALUES($1,$2,$3,'Peer proof','simulated_human')`,
        [peerUserID, accountID, `${peerUserID}@example.test`],
      );
      const peerSessionID = randomUUID();
      const userTaskInPeerSession = randomUUID();
      await pool!.query(
        `INSERT INTO agent_sessions(
           account_id,id,created_by_user_id,revision,payload,created_at,expires_at
         ) VALUES($1,$2,$3,1,'{"turns":[]}'::jsonb,now(),now()+interval '7 days')`,
        [accountID, peerSessionID, peerUserID],
      );
      await pool!.query(
        `INSERT INTO agent_session_chat_tasks(
           account_id,task_id,actor_user_id,origin_session_id,expires_at
         ) VALUES($1,$2,$3,$4,now()+interval '7 days')`,
        [accountID, userTaskInPeerSession, userID, peerSessionID],
      );
      await expect(
        pool!.query(
          `SELECT record_meeting_draft(
             $1,$2,$3,$4,$5,NULL,'Cross-user session',
             now()+interval '1 day',now()+interval '1 day 1 hour',
             'UTC','Synthetic source excerpt',now(),now()+interval '7 days'
           )`,
          [
            accountID,
            randomUUID(),
            userID,
            userTaskInPeerSession,
            peerSessionID,
          ],
        ),
      ).rejects.toThrow(/MEETING_DRAFT_SOURCE_AUTHORITY_INVALID/u);
      await expect(
        pool!.query(
          `SELECT record_meeting_draft(
             $1,$2,$3,$4,$5,NULL,'Overlong retention',
             now()+interval '1 day',now()+interval '1 day 1 hour',
             'UTC','Synthetic source excerpt',now(),now()+interval '8 days'
           )`,
          [accountID, randomUUID(), userID, taskID, sessionID],
        ),
      ).rejects.toThrow(/MEETING_DRAFT_SOURCE_AUTHORITY_INVALID/u);

      const peerTaskInUserSession = randomUUID();
      await pool!.query(
        `INSERT INTO agent_session_chat_tasks(
           account_id,task_id,actor_user_id,origin_session_id,expires_at
         ) VALUES($1,$2,$3,$4,now()+interval '7 days')`,
        [accountID, peerTaskInUserSession, peerUserID, sessionID],
      );
      await expect(
        pool!.query(
          `SELECT record_meeting_draft(
             $1,$2,$3,$4,$5,NULL,'Cross-user task',
             now()+interval '1 day',now()+interval '1 day 1 hour',
             'UTC','Synthetic source excerpt',now(),now()+interval '7 days'
           )`,
          [
            accountID,
            randomUUID(),
            userID,
            peerTaskInUserSession,
            sessionID,
          ],
        ),
      ).rejects.toThrow(/MEETING_DRAFT_SOURCE_AUTHORITY_INVALID/u);
      await expect(
        pool!.query(
          `INSERT INTO meeting_drafts(
             account_id,id,created_by_user_id,source_task_id,origin_session_id,
             title,starts_at,ends_at,time_zone,source_excerpt,reference_time,
             status,external_effect,revision,created_at,updated_at,expires_at
           ) VALUES(
             $1,$2,$3,$4,$5,'Invalid direct writer',
             now()+interval '1 day',now()+interval '1 day 1 hour','UTC',
             'Synthetic source excerpt',now(),'needs_review','none',1,
             now(),now(),now()+interval '6 days'
           )`,
          [
            accountID,
            randomUUID(),
            userID,
            peerTaskInUserSession,
            sessionID,
          ],
        ),
      ).rejects.toThrow(/foreign key constraint/u);
      await expect(
        pool!.query(
          `UPDATE meeting_drafts
           SET dismissed_at=now()
           WHERE account_id=$1 AND id=$2`,
          [accountID, draftID],
        ),
      ).rejects.toThrow(/check constraint/u);
      await expect(
        pool!.query(
          `INSERT INTO meeting_draft_operations(
             account_id,actor_user_id,idempotency_key,draft_id,operation,
             request_hash,response_revision
           ) VALUES($1,$2,$3,$4,'edit',$5,1)`,
          [accountID, peerUserID, randomUUID(), draftID, "a".repeat(64)],
        ),
      ).rejects.toThrow(/foreign key constraint/u);
      await pool!.query(
        "INSERT INTO accounts(id,slug,name) VALUES($1,$2,'Other account proof')",
        [otherAccountID, `meeting-${otherAccountID}`],
      );
      await pool!.query(
        `INSERT INTO users(id,account_id,email,display_name,kind)
         VALUES($1,$2,$3,'Other account proof','simulated_human')`,
        [otherUserID, otherAccountID, `${otherUserID}@example.test`],
      );
      await expect(
        getMeetingDraft(pool!, { ...auth, userId: peerUserID }, draftID),
      ).rejects.toMatchObject({ code: "MEETING_DRAFT_NOT_FOUND" });
      await expect(
        getMeetingDraft(
          pool!,
          {
            ...auth,
            accountId: otherAccountID,
            accountSlug: `meeting-${otherAccountID}`,
            userId: otherUserID,
            userEmail: `${otherUserID}@example.test`,
          },
          draftID,
        ),
      ).rejects.toMatchObject({ code: "MEETING_DRAFT_NOT_FOUND" });

      const request = {
        expected_revision: 1,
        idempotency_key: editKey.toUpperCase(),
        title: "Reviewed title",
        starts_at: "2026-09-20T01:00:00.000Z",
        ends_at: "2026-09-20T02:00:00.000Z",
      };
      const updated = await updateMeetingDraft(
        pool!, auth, draftID.toUpperCase(), request,
      );
      expect(updated).toMatchObject({
        revision: 2,
        status: "needs_review",
        title: "Reviewed title",
      });
      await expect(
        updateMeetingDraft(pool!, auth, draftID.toUpperCase(), request),
      ).resolves.toMatchObject({ revision: 2, title: "Reviewed title" });
      await expect(
        updateMeetingDraft(pool!, auth, draftID, {
          ...request,
          title: "Different content under the same identity",
        }),
      ).rejects.toMatchObject({ code: "MEETING_DRAFT_INTENT_CONFLICT" });
      await expect(
        updateMeetingDraft(pool!, auth, draftID, {
          ...request,
          idempotency_key: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "MEETING_DRAFT_REVISION_CONFLICT" });

      const otherTaskID = randomUUID();
      const otherDraftID = randomUUID();
      await pool!.query(
        `INSERT INTO agent_session_chat_tasks(
           account_id,task_id,actor_user_id,origin_session_id,expires_at
         ) VALUES($1,$2,$3,$4,clock_timestamp()+interval '7 days')`,
        [accountID, otherTaskID, userID, sessionID],
      );
      await pool!.query(
        `SELECT record_meeting_draft(
           $1,$2,$3,$4,$5,NULL,'Other review',
           clock_timestamp()+interval '1 day',clock_timestamp()+interval '1 day 1 hour',
           'UTC','Other synthetic excerpt',clock_timestamp(),
           clock_timestamp()+interval '6 days'
         )`,
        [accountID, otherDraftID, userID, otherTaskID, sessionID],
      );
      await expect(
        updateMeetingDraft(pool!, auth, otherDraftID, {
          ...request,
          expected_revision: 1,
        }),
      ).rejects.toMatchObject({ code: "MEETING_DRAFT_INTENT_CONFLICT" });

      await pool!.query(
        `INSERT INTO agent_session_retracted_tasks(account_id,task_id)
         VALUES($1,$2)`,
        [accountID, otherTaskID],
      );
      await expect(
        getMeetingDraft(pool!, auth, otherDraftID),
      ).resolves.toMatchObject({
        content_available: false,
        revision: 2,
        status: "redacted",
        title: null,
      });
      await expect(
        listMeetingDrafts(pool!, auth, undefined, 50, "reviewable"),
      ).resolves.toMatchObject({
        complete: true,
        drafts: [{ id: draftID, status: "needs_review" }],
      });
      await expect(
        listMeetingDrafts(pool!, auth, undefined, 50, "inactive"),
      ).resolves.toMatchObject({
        complete: true,
        drafts: [{ id: otherDraftID, status: "redacted" }],
      });
      const consumedSnapshots = await pool!.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM meeting_draft_list_snapshots
         WHERE account_id=$1 AND created_by_user_id=$2`,
        [accountID, userID],
      );
      expect(consumedSnapshots.rows[0]?.count).toBe("0");

      await expect(
        dismissMeetingDraft(pool!, auth, draftID, {
          expected_revision: 2,
          idempotency_key: editKey,
        }),
      ).rejects.toMatchObject({ code: "MEETING_DRAFT_INTENT_CONFLICT" });

      const dismissalKey = randomUUID();
      const dismissal = {
        expected_revision: 2,
        idempotency_key: dismissalKey,
      };
      await expect(
        dismissMeetingDraft(pool!, auth, draftID, dismissal),
      ).resolves.toMatchObject({ revision: 3, status: "dismissed" });
      await expect(
        dismissMeetingDraft(pool!, auth, draftID, dismissal),
      ).resolves.toMatchObject({ revision: 3, status: "dismissed" });
      await expect(
        dismissMeetingDraft(pool!, auth, draftID, {
          ...dismissal,
          expected_revision: 3,
        }),
      ).rejects.toMatchObject({ code: "MEETING_DRAFT_INTENT_CONFLICT" });

      await pool!.query(
        `UPDATE agent_sessions SET payload=NULL,deleted_at=now(),revision=2
         WHERE account_id=$1 AND id=$2`,
        [accountID, sessionID],
      );
      await expect(
        getMeetingDraft(pool!, auth, draftID),
      ).resolves.toMatchObject({
        content_available: false,
        revision: 4,
        status: "redacted",
        title: null,
      });
      const keys = (
        await pool!.query<{
          edit_idempotency_key: string | null;
          edit_request_hash: string | null;
        }>(
          `SELECT edit_idempotency_key,edit_request_hash FROM meeting_drafts
           WHERE account_id=$1 AND id=$2`,
          [accountID, draftID],
        )
      ).rows[0]!;
      expect(keys).toEqual({
        edit_idempotency_key: null,
        edit_request_hash: null,
      });
      const retainedOperations = await pool!.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM meeting_draft_operations
         WHERE account_id=$1 AND draft_id=$2`,
        [accountID, draftID],
      );
      expect(retainedOperations.rows[0]?.count).toBe("0");
    } finally {
      await removeProofAccount(otherAccountID);
      await removeProofAccount(accountID);
    }
  });

  it("materializes a complete visibility snapshot across more than one page", async () => {
    const accountID = randomUUID();
    const userID = randomUUID();
    const sessionID = randomUUID();
    const auth = {
      accountId: accountID,
      accountSlug: `meeting-${accountID}`,
      userId: userID,
      userEmail: `${userID}@example.test`,
      sessionId: randomUUID(),
      userKind: "simulated_human" as const,
    };
    let concurrent: PoolClient | undefined;
    try {
      await pool!.query(
        "INSERT INTO accounts(id,slug,name) VALUES($1,$2,'Meeting page proof')",
        [accountID, auth.accountSlug],
      );
      await pool!.query(
        `INSERT INTO users(id,account_id,email,display_name,kind)
         VALUES($1,$2,$3,'Meeting page proof','simulated_human')`,
        [userID, accountID, auth.userEmail],
      );
      await pool!.query(
        `INSERT INTO agent_sessions(
           account_id,id,created_by_user_id,revision,payload,created_at,expires_at
         ) VALUES($1,$2,$3,1,'{"turns":[]}'::jsonb,now(),now()+interval '7 days')`,
        [accountID, sessionID, userID],
      );
      const ids: string[] = [];
      for (let index = 0; index < 52; index += 1) {
        const taskID = randomUUID();
        const draftID = randomUUID();
        ids.push(draftID);
        await pool!.query(
          `INSERT INTO agent_session_chat_tasks(
             account_id,task_id,actor_user_id,origin_session_id,created_at,expires_at
           ) VALUES($1,$2,$3,$4,$5,now()+interval '7 days')`,
          [accountID, taskID, userID, sessionID, new Date(Date.UTC(2026, 8, 1, 0, index))],
        );
        await pool!.query(
          `SELECT record_meeting_draft(
             $1,$2,$3,$4,$5,NULL,$6,
             now()+interval '1 day',now()+interval '1 day 1 hour',
             'UTC','Synthetic source excerpt',now(),now()+interval '6 days'
           )`,
          [accountID, draftID, userID, taskID, sessionID, `Draft ${index}`],
        );
      }

      concurrent = await pool!.connect();
      await concurrent.query("BEGIN");
      const preSnapshotTask = randomUUID();
      const preSnapshotDraft = "10000000-0000-4000-8000-000000000001";
      await concurrent.query(
        `INSERT INTO agent_session_chat_tasks(
           account_id,task_id,actor_user_id,origin_session_id,expires_at
         ) VALUES($1,$2,$3,$4,now()+interval '7 days')`,
        [accountID, preSnapshotTask, userID, sessionID],
      );
      await concurrent.query(
        `SELECT record_meeting_draft(
           $1,$2,$3,$4,$5,NULL,'Pre-snapshot uncommitted draft',
           now()+interval '1 day',now()+interval '1 day 1 hour',
           'UTC','Synthetic source excerpt',now(),now()+interval '6 days'
         )`,
        [accountID, preSnapshotDraft, userID, preSnapshotTask, sessionID],
      );

      const visibleTask = randomUUID();
      const visibleDraft = "20000000-0000-4000-8000-000000000002";
      await pool!.query(
        `INSERT INTO agent_session_chat_tasks(
           account_id,task_id,actor_user_id,origin_session_id,expires_at
         ) VALUES($1,$2,$3,$4,now()+interval '7 days')`,
        [accountID, visibleTask, userID, sessionID],
      );
      await pool!.query(
        `SELECT record_meeting_draft(
           $1,$2,$3,$4,$5,NULL,'Visible snapshot draft',
           now()+interval '1 day',now()+interval '1 day 1 hour',
           'UTC','Synthetic source excerpt',now(),now()+interval '6 days'
         )`,
        [accountID, visibleDraft, userID, visibleTask, sessionID],
      );
      const first = await listMeetingDrafts(
        pool!, auth, undefined, 50, "reviewable",
      );
      expect(first).toMatchObject({ complete: false });
      expect(first.drafts).toHaveLength(50);
      expect(first.next_cursor).toEqual(expect.any(String));
      const oversizedCursor = Buffer.from(JSON.stringify({
        v: 3,
        scope: "reviewable",
        snapshot_id: ids[0],
        before_us: "9223372036854775808",
        before_id: ids[1],
      })).toString("base64url");
      await expect(
        listMeetingDrafts(pool!, auth, oversizedCursor, 50, "reviewable"),
      ).rejects.toMatchObject({ code: "MEETING_DRAFT_CURSOR_INVALID" });
      await expect(
        listMeetingDrafts(pool!, auth, first.next_cursor!, 50, "inactive"),
      ).rejects.toMatchObject({ code: "MEETING_DRAFT_CURSOR_INVALID" });

      await concurrent.query("COMMIT");
      concurrent.release();
      concurrent = undefined;

      const lateTask = randomUUID();
      const lateDraft = "30000000-0000-4000-8000-000000000003";
      await pool!.query(
        `INSERT INTO agent_session_chat_tasks(
           account_id,task_id,actor_user_id,origin_session_id,expires_at
         ) VALUES($1,$2,$3,$4,now()+interval '7 days')`,
        [accountID, lateTask, userID, sessionID],
      );
      await pool!.query(
        `SELECT record_meeting_draft(
           $1,$2,$3,$4,$5,NULL,'Concurrent later draft',
           now()+interval '1 day',now()+interval '1 day 1 hour',
           'UTC','Synthetic source excerpt',now(),now()+interval '6 days'
        )`,
        [accountID, lateDraft, userID, lateTask, sessionID],
      );

      const second = await listMeetingDrafts(
        pool!, auth, first.next_cursor!, 50, "reviewable",
      );
      expect(second).toMatchObject({ complete: true, next_cursor: null });
      expect(second.drafts).toHaveLength(3);
      const traversed = [...first.drafts, ...second.drafts].map((draft) => draft.id);
      expect(new Set(traversed).size).toBe(53);
      expect(traversed).toEqual(expect.arrayContaining(ids));
      expect(traversed).toContain(visibleDraft);
      expect(traversed).not.toContain(preSnapshotDraft);
      expect(traversed).not.toContain(lateDraft);
      const consumedSnapshots = await pool!.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM meeting_draft_list_snapshots
         WHERE account_id=$1 AND created_by_user_id=$2`,
        [accountID, userID],
      );
      expect(consumedSnapshots.rows[0]?.count).toBe("0");

      const retryable = await listMeetingDrafts(
        pool!, auth, undefined, 50, "reviewable",
      );
      expect(retryable).toMatchObject({ complete: false });
      const finalCursor = retryable.next_cursor!;
      const concurrentFinalPages = await Promise.allSettled([
        listMeetingDrafts(pool!, auth, finalCursor, 50, "reviewable"),
        listMeetingDrafts(pool!, auth, finalCursor, 50, "reviewable"),
      ]);
      const successfulFinalPages = concurrentFinalPages
        .filter((outcome): outcome is PromiseFulfilledResult<Awaited<
          ReturnType<typeof listMeetingDrafts>
        >> => outcome.status === "fulfilled")
        .map((outcome) => outcome.value);
      expect(successfulFinalPages.length).toBeGreaterThan(0);
      for (const finalPage of successfulFinalPages) {
        expect(finalPage.complete).toBe(true);
        expect(finalPage.drafts.length).toBeGreaterThan(0);
      }
      if (successfulFinalPages.length === 2) {
        expect(successfulFinalPages[1]).toEqual(successfulFinalPages[0]);
      }
      for (const outcome of concurrentFinalPages) {
        if (outcome.status === "rejected") {
          expect(outcome.reason).toMatchObject({
            code: "MEETING_DRAFT_CURSOR_EXPIRED",
          });
        }
      }
      await expect(
        listMeetingDrafts(pool!, auth, finalCursor, 50, "reviewable"),
      ).rejects.toMatchObject({ code: "MEETING_DRAFT_CURSOR_EXPIRED" });

      const expiring = await listMeetingDrafts(
        pool!, auth, undefined, 1, "reviewable",
      );
      expect(expiring.complete).toBe(false);
      const expiringCursor = JSON.parse(
        Buffer.from(expiring.next_cursor!, "base64url").toString("utf8"),
      ) as { snapshot_id: string };
      let crossedSnapshotExpiry = false;
      const expiryRace = {
        query: async (text: string, values?: unknown[]) => {
          if (!crossedSnapshotExpiry && text.includes("LEFT JOIN LATERAL")) {
            crossedSnapshotExpiry = true;
            await pool!.query(
              `UPDATE meeting_draft_list_snapshots
               SET created_at=clock_timestamp()-interval '2 minutes',
                   expires_at=clock_timestamp()-interval '1 minute'
               WHERE account_id=$1 AND id=$2`,
              [accountID, expiringCursor.snapshot_id],
            );
          }
          return pool!.query(text, values);
        },
      } as unknown as DatabaseClient;
      await expect(
        listMeetingDrafts(
          expiryRace, auth, expiring.next_cursor!, 1, "reviewable",
        ),
      ).rejects.toMatchObject({ code: "MEETING_DRAFT_CURSOR_EXPIRED" });
      expect(crossedSnapshotExpiry).toBe(true);
      await expect(
        listMeetingDrafts(
          pool!, auth, expiring.next_cursor!, 1, "reviewable",
        ),
      ).rejects.toMatchObject({ code: "MEETING_DRAFT_CURSOR_EXPIRED" });
      const expiredSnapshots = await pool!.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM meeting_draft_list_snapshots
         WHERE account_id=$1 AND id=$2`,
        [accountID, expiringCursor.snapshot_id],
      );
      expect(expiredSnapshots.rows[0]?.count).toBe("0");

      await pool!.query(
        `UPDATE meeting_drafts
         SET expires_at=clock_timestamp()+interval '350 milliseconds'
         WHERE account_id=$1 AND id=$2`,
        [accountID, ids[1]],
      );
      let delayedFinalRead = false;
      const delayedRead = {
        query: async (text: string, values?: unknown[]) => {
          if (!delayedFinalRead && text.includes("SELECT * FROM meeting_drafts d")) {
            delayedFinalRead = true;
            await pool!.query("SELECT pg_sleep(0.5)");
          }
          return pool!.query(text, values);
        },
      } as unknown as DatabaseClient;
      await expect(
        getMeetingDraft(delayedRead, auth, ids[1]!),
      ).resolves.toMatchObject({
        content_available: false,
        status: "expired",
        title: null,
      });
      expect(delayedFinalRead).toBe(true);

      const blockedKey = randomUUID();
      concurrent = await pool!.connect();
      await concurrent.query("BEGIN");
      await concurrent.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`${accountID}:${userID}:${blockedKey}`],
      );
      await pool!.query(
        `UPDATE meeting_drafts
         SET expires_at=clock_timestamp()+interval '600 milliseconds'
         WHERE account_id=$1 AND id=$2`,
        [accountID, ids[0]],
      );
      const blockedUpdate = updateMeetingDraft(pool!, auth, ids[0]!, {
        expected_revision: 1,
        idempotency_key: blockedKey.toUpperCase(),
        title: "Must not cross the expiry boundary",
        starts_at: "2026-09-20T01:00:00.000Z",
        ends_at: "2026-09-20T02:00:00.000Z",
      }).then(
        (value) => ({ error: null, value }),
        (error: unknown) => ({ error, value: null }),
      );
      await pool!.query("SELECT pg_sleep(0.8)");
      await concurrent.query("COMMIT");
      concurrent.release();
      concurrent = undefined;
      const blockedOutcome = await blockedUpdate;
      expect(blockedOutcome.value).toBeNull();
      expect(blockedOutcome.error).toMatchObject({
        code: "MEETING_DRAFT_UNAVAILABLE",
      });
      await expect(
        getMeetingDraft(pool!, auth, ids[0]!),
      ).resolves.toMatchObject({
        content_available: false,
        revision: 2,
        status: "expired",
        title: null,
      });
      const receipt = await pool!.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM meeting_draft_operations
         WHERE account_id=$1 AND actor_user_id=$2 AND idempotency_key=$3`,
        [accountID, userID, blockedKey],
      );
      expect(receipt.rows[0]?.count).toBe("0");
    } finally {
      if (concurrent) {
        await concurrent.query("ROLLBACK");
        concurrent.release();
      }
      await removeProofAccount(accountID);
    }
  }, 30_000);

  it("redacts a dismissed draft when its originating Session is deleted", async () => {
    const client = await pool!.connect();
    const accountID = randomUUID();
    const userID = randomUUID();
    const sessionID = randomUUID();
    const taskID = randomUUID();
    const draftID = randomUUID();
    const dismissalKey = randomUUID();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO accounts(id,slug,name) VALUES($1,$2,'Meeting draft proof')",
        [accountID, `meeting-${accountID}`],
      );
      await client.query(
        `INSERT INTO users(id,account_id,email,display_name,kind)
         VALUES($1,$2,$3,'Meeting proof','simulated_human')`,
        [userID, accountID, `${userID}@example.test`],
      );
      await client.query(
        `INSERT INTO agent_sessions(
           account_id,id,created_by_user_id,revision,payload,created_at,expires_at
         ) VALUES($1,$2,$3,1,'{"turns":[]}'::jsonb,now(),now()+interval '7 days')`,
        [accountID, sessionID, userID],
      );
      await client.query(
        `INSERT INTO agent_session_chat_tasks(
           account_id,task_id,actor_user_id,origin_session_id,expires_at
         ) VALUES($1,$2,$3,$4,now()+interval '7 days')`,
        [accountID, taskID, userID, sessionID],
      );
      await client.query(
        `SELECT record_meeting_draft(
           $1,$2,$3,$4,$5,NULL,'Synthetic review',
           now()+interval '1 day',now()+interval '1 day 61 minutes',
           'UTC','Synthetic source excerpt',now(),now()+interval '6 days'
         )`,
        [accountID, draftID, userID, taskID, sessionID],
      );
      await client.query(
        `UPDATE meeting_drafts SET status='dismissed',dismissed_at=now(),
           dismiss_idempotency_key=$3,revision=2
         WHERE account_id=$1 AND id=$2`,
        [accountID, draftID, dismissalKey],
      );

      await expect(
        client.query(
          `UPDATE agent_sessions SET payload=NULL,deleted_at=now(),revision=2
           WHERE account_id=$1 AND id=$2`,
          [accountID, sessionID],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });

      const row = (
        await client.query<{
          dismiss_idempotency_key: string | null;
          dismissed_at: Date | null;
          redacted_at: Date | null;
          revision: number;
          source_excerpt: string | null;
          status: string;
          title: string | null;
        }>(
          `SELECT status,revision,title,source_excerpt,redacted_at,dismissed_at,
             dismiss_idempotency_key
           FROM meeting_drafts WHERE account_id=$1 AND id=$2`,
          [accountID, draftID],
        )
      ).rows[0]!;
      expect(row).toMatchObject({
        dismiss_idempotency_key: null,
        revision: 3,
        source_excerpt: null,
        status: "redacted",
        title: null,
      });
      expect(row.dismissed_at).toBeInstanceOf(Date);
      expect(row.redacted_at).toBeInstanceOf(Date);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
