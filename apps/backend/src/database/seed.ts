import { fileURLToPath } from "node:url";

import {
  SIMULATED_CAPABILITY,
  SIMULATED_REVERSAL_CAPABILITY,
} from "@talent-signal/contracts";

import { loadConfig } from "../config.js";
import { createPool, inTransaction } from "./pool.js";

const IDS = {
  alphaAccount: "10000000-0000-4000-8000-000000000001",
  alphaRecruiter: "10000000-0000-4000-8000-000000000011",
  alphaReviewer: "10000000-0000-4000-8000-000000000012",
  alphaRecruiterGrant: "10000000-0000-4000-8000-000000000021",
  alphaReviewerGrant: "10000000-0000-4000-8000-000000000022",
  alphaRecruiterReversalGrant: "10000000-0000-4000-8000-000000000031",
  alphaReviewerReversalGrant: "10000000-0000-4000-8000-000000000032",
  betaAccount: "20000000-0000-4000-8000-000000000001",
  betaRecruiter: "20000000-0000-4000-8000-000000000011",
  betaGrant: "20000000-0000-4000-8000-000000000021",
  betaReversalGrant: "20000000-0000-4000-8000-000000000031",
} as const;

export async function seed(): Promise<void> {
  const pool = createPool(loadConfig());
  try {
    await inTransaction(pool, async (client) => {
      await client.query(
        `INSERT INTO accounts(id, slug, name)
         VALUES
           ($1, 'fixture-alpha', 'Fixture Alpha Search'),
           ($2, 'fixture-beta', 'Fixture Beta Search')
         ON CONFLICT (id) DO UPDATE SET
           slug = EXCLUDED.slug,
           name = EXCLUDED.name`,
        [IDS.alphaAccount, IDS.betaAccount],
      );
      await client.query(
        `INSERT INTO users(id, account_id, email, display_name, kind, status)
         VALUES
           ($1, $2, 'recruiter@alpha.local', 'Alpha Recruiter', 'simulated_human', 'active'),
           ($3, $2, 'reviewer@alpha.local', 'Alpha Reviewer', 'simulated_human', 'active'),
           ($4, $5, 'recruiter@beta.local', 'Beta Recruiter', 'simulated_human', 'active')
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           display_name = EXCLUDED.display_name,
           status = 'active'`,
        [
          IDS.alphaRecruiter,
          IDS.alphaAccount,
          IDS.alphaReviewer,
          IDS.betaRecruiter,
          IDS.betaAccount,
        ],
      );
      await client.query(
        `INSERT INTO capability_grants(
           id, account_id, user_id, capability, status, version, expires_at
         )
         VALUES
           ($1, $2, $3, $7, 'active', 1, '2099-01-01T00:00:00Z'),
           ($4, $2, $5, $7, 'active', 1, '2099-01-01T00:00:00Z'),
           ($6, $8, $9, $7, 'active', 1, '2099-01-01T00:00:00Z')
         ON CONFLICT (account_id, user_id, capability) DO UPDATE SET
           status = 'active',
           revoked_at = NULL,
           revocation_reason = NULL,
           expires_at = EXCLUDED.expires_at,
           version = capability_grants.version + 1`,
        [
          IDS.alphaRecruiterReversalGrant,
          IDS.alphaAccount,
          IDS.alphaRecruiter,
          IDS.alphaReviewerReversalGrant,
          IDS.alphaReviewer,
          IDS.betaReversalGrant,
          SIMULATED_REVERSAL_CAPABILITY,
          IDS.betaAccount,
          IDS.betaRecruiter,
        ],
      );
      await client.query(
        `INSERT INTO capability_grants(
           id, account_id, user_id, capability, status, version, expires_at
         )
         VALUES
           ($1, $2, $3, $7, 'active', 1, '2099-01-01T00:00:00Z'),
           ($4, $2, $5, $7, 'active', 1, '2099-01-01T00:00:00Z'),
           ($6, $8, $9, $7, 'active', 1, '2099-01-01T00:00:00Z')
         ON CONFLICT (account_id, user_id, capability) DO UPDATE SET
           status = 'active',
           revoked_at = NULL,
           revocation_reason = NULL,
           expires_at = EXCLUDED.expires_at,
           version = capability_grants.version + 1`,
        [
          IDS.alphaRecruiterGrant,
          IDS.alphaAccount,
          IDS.alphaRecruiter,
          IDS.alphaReviewerGrant,
          IDS.alphaReviewer,
          IDS.betaGrant,
          SIMULATED_CAPABILITY,
          IDS.betaAccount,
          IDS.betaRecruiter,
        ],
      );
    });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed().catch((error: unknown) => {
    process.stderr.write(
      `Seed failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  });
}
