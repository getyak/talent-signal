import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  CONTRACT_VERSION,
  TalentSignalClient,
  type PublicResearchResponse,
} from "@talent-signal/contracts";
import { Pool } from "pg";

import { runPendingPublicResearchJobs } from "../modules/research.js";

const baseUrl =
  process.env.TALENT_SIGNAL_EVALUATION_URL ??
  "http://127.0.0.1:4318";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

async function run(): Promise<void> {
  const runId = randomUUID();
  const observedAt = new Date().toISOString();
  const client = new TalentSignalClient(baseUrl);
  const session = await client.login({
    account_slug: "fixture-alpha",
    user_email: "recruiter@alpha.local",
    client_label: "research-restart-recovery-evaluation",
  });
  const seedClientId = `research-recovery-seed:${runId}`;
  const seed = await client.createResourceCapture({
    contract_version: CONTRACT_VERSION,
    idempotency_key: `research-recovery:${runId}:seed`,
    channel: "chat",
    purpose: "Synthetic durable research recovery proof",
    captured_at: observedAt,
    source_timezone: "Asia/Singapore",
    person_scope: {
      status: "new_person",
      display_label: `Research recovery ${runId.slice(0, 8)}`,
      relationship_context: {
        status: "proposed",
        label: "Synthetic research recovery context",
        purpose:
          "Prove restart recovery and stale research projection",
      },
      binding_basis:
        "The synthetic recruiter explicitly created this isolated proof person.",
    },
    resource: {
      client_resource_id: seedClientId,
      kind: "public_url",
      display_name: "Recovery proof public page",
      media_type: "text/uri-list",
      observed_at: observedAt,
      source_timezone: "Asia/Singapore",
      source_locator: "https://example.com/",
      retention: {
        requested_mode: "ephemeral",
        source_scope: "reviewed_selected_text",
      },
    },
    fragments: [
      {
        client_resource_id: seedClientId,
        kind: "url_excerpt",
        sequence: 0,
        text: "https://example.com/",
        locator: {
          kind: "url_excerpt",
          canonical_url: "https://example.com/",
          retrieved_at: observedAt,
        },
        attribution: {
          actor_kind: "public_source",
          status: "confirmed",
        },
        review_status: "reviewed",
        parser: {
          name: "research-restart-recovery-evaluation",
          version: "1.0.0",
        },
      },
    ],
  });
  assert(seed.identity.person_id);
  assert(seed.identity.relationship_context_id);
  const personId = seed.identity.person_id;
  const contextId = seed.identity.relationship_context_id;
  const researchRequest = {
    idempotency_key: `research-recovery:${runId}:run`,
    person_id: personId,
    relationship_context_id: contextId,
    seed_resource_id: seed.resource.id,
    purpose: "Retrieve one page for durable recovery proof",
    expected_seed_url: "https://example.com/",
    authorization: {
      decision: "approve_public_research" as const,
      allowed_domain: "example.com",
      maximum_page_count: 1,
      maximum_link_depth: 0,
    },
  };
  const research = await client.runPublicResearch(researchRequest);
  assert.equal(research.status, "completed");
  const page = research.pages[0];
  assert(page);

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const jobBefore = await pool.query<{
      id: string;
      idempotency_record_id: string;
      attempt_count: number;
    }>(
      `SELECT id, idempotency_record_id, attempt_count
       FROM research_retrieval_jobs
       WHERE account_id = $1 AND task_id = $2`,
      [session.account.id, research.task_id],
    );
    const job = jobBefore.rows[0];
    assert(job);
    assert.equal(job.attempt_count, 1);

    const runningBody: PublicResearchResponse = {
      ...research,
      status: "running",
      pages: [],
      warnings: [],
      completed_at: null,
    };
    await pool.query("BEGIN");
    try {
      await pool.query(
        `DELETE FROM research_snapshots
         WHERE account_id = $1 AND task_id = $2`,
        [session.account.id, research.task_id],
      );
      await pool.query(
        `UPDATE research_tasks
         SET status = 'running', updated_at = now()
         WHERE account_id = $1 AND id = $2`,
        [session.account.id, research.task_id],
      );
      await pool.query(
        `UPDATE idempotency_records
         SET status = 'completed',
             response_status = 202,
             response_body = $3,
             completed_at = now()
         WHERE account_id = $1 AND id = $2`,
        [
          session.account.id,
          job.idempotency_record_id,
          runningBody,
        ],
      );
      await pool.query(
        `UPDATE research_retrieval_jobs
         SET status = 'running',
             lease_owner = 'synthetic-dead-research-worker',
             lease_expires_at = now() - interval '1 second',
             last_error = NULL,
             completed_at = NULL,
             updated_at = now() - interval '1 second'
         WHERE account_id = $1 AND id = $2`,
        [session.account.id, job.id],
      );
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }

    const recovered = await runPendingPublicResearchJobs(pool, {
      now: new Date(),
      limit: 10,
    });
    assert.deepEqual(recovered, {
      claimed: 1,
      completed: 1,
      retried: 0,
    });
    const completedJob = await pool.query<{
      status: string;
      attempt_count: number;
      lease_owner: string | null;
      lease_expires_at: Date | null;
      completed_at: Date | null;
    }>(
      `SELECT
         status, attempt_count, lease_owner, lease_expires_at,
         completed_at
       FROM research_retrieval_jobs
       WHERE account_id = $1 AND task_id = $2`,
      [session.account.id, research.task_id],
    );
    assert.equal(completedJob.rows[0]?.status, "completed");
    assert.equal(completedJob.rows[0]?.attempt_count, 2);
    assert.equal(completedJob.rows[0]?.lease_owner, null);
    assert.equal(completedJob.rows[0]?.lease_expires_at, null);
    assert(completedJob.rows[0]?.completed_at);

    const replay = await client.runPublicResearch(researchRequest);
    assert.equal(replay.status, "completed");
    assert.equal(replay.pages.length, 1);
    assert.equal(replay.pages[0]?.resource_id, page.resource_id);
    const latestAfterRecovery =
      await client.getLatestPublicResearchTask(seed.resource.id);
    assert.equal(latestAfterRecovery?.task_id, research.task_id);
    assert.equal(latestAfterRecovery?.status, "completed");
    assert.equal(
      latestAfterRecovery?.pages[0]?.resource_id,
      page.resource_id,
    );
    const pageResources = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::integer AS count
       FROM source_resources
       WHERE account_id = $1
         AND client_resource_id = $2
         AND processing_state <> 'deleted'`,
      [
        session.account.id,
        `research:${research.task_id}:0`,
      ],
    );
    assert.equal(pageResources.rows[0]?.count, 1);

    await pool.query(
      `UPDATE research_snapshots
       SET status = 'stale',
           freshness_until = now() - interval '1 day'
       WHERE account_id = $1 AND task_id = $2`,
      [session.account.id, research.task_id],
    );
    const wiki = await client.compileKnowledge(personId, contextId, {
      idempotency_key: `research-recovery:${runId}:stale-wiki`,
      objective: "Prepare a brief without stale public page content",
    });
    assert(
      wiki.blocks.every(
        (block) => block.type !== "sourced_research",
      ),
    );
    const staleBlock = wiki.blocks.find((block) =>
      block.block_key.startsWith("research.stale."),
    );
    assert(staleBlock);
    assert.equal(staleBlock.type, "open_question");
    assert.equal(staleBlock.status, "expired");
    assert(
      staleBlock.content.headline.startsWith(
        "Refresh stale public research",
      ),
    );
    const chat = await client.createChatTask({
      idempotency_key: `research-recovery:${runId}:stale-chat`,
      objective: "Prepare a brief without stale public page content",
      person_id: personId,
      relationship_context_id: contextId,
    });
    const researchStatus = chat.blocks.find(
      (block) => block.kind === "research_status",
    );
    assert.equal(
      researchStatus?.title,
      "Public research is stale and needs refresh",
    );
    assert(
      chat.blocks.every(
        (block) => block.kind !== "action_proposal",
      ),
    );

    const secondRecovery = await runPendingPublicResearchJobs(pool, {
      now: new Date(),
      limit: 10,
    });
    assert.deepEqual(secondRecovery, {
      claimed: 0,
      completed: 0,
      retried: 0,
    });

    process.stdout.write(
      `${JSON.stringify(
        {
          artifact:
            "bounded-public-research-restart-recovery-proof",
          task_id: research.task_id,
          person_id: personId,
          relationship_context_id: contextId,
          page_resource_id: page.resource_id,
          injected_failure:
            "retrieval job lease expired after page source commit and before research snapshot finalization",
          recovered_attempt_count:
            completedJob.rows[0]?.attempt_count,
          reused_page_resource_without_duplicate: true,
          latest_task_visible_after_reload:
            latestAfterRecovery?.task_id === research.task_id,
          stale_research_content_excluded: true,
          stale_refresh_block_id: staleBlock.id,
          stale_chat_status: researchStatus?.title,
          second_recovery_was_idempotent: true,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await pool.end();
  }
}

run().catch((error: unknown) => {
  process.stderr.write(
    `${
      error instanceof Error
        ? error.stack ?? error.message
        : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
