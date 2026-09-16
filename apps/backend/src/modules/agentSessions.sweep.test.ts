import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

import type { DatabaseClient } from "../database/pool.js";
import {
  runAgentSessionRetentionSweep,
  sweepAgentSessions,
} from "./agentSessions.js";

describe("Agent Session retention sweep", () => {
  it("keeps snapshot cleanup outside the sensitive Session sweep", async () => {
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        statements.push(text);
        return { command: "UPDATE", fields: [], oid: 0, rowCount: 0, rows: [] };
      }),
    } as unknown as DatabaseClient;

    await expect(sweepAgentSessions(client)).resolves.toBeUndefined();

    const expiryScrub = statements.findIndex((text) =>
      text.includes("UPDATE agent_sessions SET payload=NULL"),
    );
    const revocationScrub = statements.findIndex((text) =>
      text.includes("payload=redact_agent_session_payload"),
    );
    expect(expiryScrub).toBeGreaterThanOrEqual(0);
    expect(revocationScrub).toBeGreaterThan(expiryScrub);
    expect(
      statements.some((text) =>
        text.includes("DELETE FROM agent_session_list_snapshots"),
      ),
    ).toBe(false);
  });

  it("surfaces recurring snapshot cleanup failures after sensitive scrubbing", async () => {
    const statements: string[] = [];
    const cleanupFailure = new Error("snapshot lock timeout");
    const client = {
      query: vi.fn(async (text: string) => {
        statements.push(text);
        if (text.includes("DELETE FROM agent_session_list_snapshots")) {
          throw cleanupFailure;
        }
        return { command: "UPDATE", fields: [], oid: 0, rowCount: 0, rows: [] };
      }),
    } as unknown as Pool;

    await expect(runAgentSessionRetentionSweep(client)).rejects.toBe(
      cleanupFailure,
    );

    const revocationScrub = statements.findIndex((text) =>
      text.includes("payload=redact_agent_session_payload"),
    );
    const snapshotCleanup = statements.findIndex((text) =>
      text.includes("DELETE FROM agent_session_list_snapshots"),
    );
    expect(revocationScrub).toBeGreaterThanOrEqual(0);
    expect(snapshotCleanup).toBeGreaterThan(revocationScrub);
  });
});
