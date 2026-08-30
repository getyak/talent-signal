import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  AgentJournalEvent,
  AgentPublicResearchCheckpoint,
} from "@talent-signal/agent";
import { afterEach, describe, expect, it } from "vitest";

import {
  LocalResearchStore,
  type LocalRunRecord,
} from "./localResearchStore.js";

const temporaryDirectories: string[] = [];
const runID = "33333333-3333-4333-8333-333333333333";
const record: LocalRunRecord = {
  scope: {
    runID,
    objective: "Research Example Company.",
    providerID: "synthetic-search",
    authorization: {
      purpose: "company_market_research",
      subjectKind: "company",
      accessMode: "domain_allowlist",
      allowedDomains: ["example.com"],
      queryAnchors: ["Example Company"],
      maximumSearchCount: 1,
      maximumFetchCount: 1,
    },
  },
  budget: {
    maxTurns: 4,
    maxToolCalls: 3,
    maxDurationMs: 30_000,
    maxTaskTokens: 4_000,
    maxEstimatedUsd: 1,
  },
  modelProviderID: "scripted",
  model: "scripted-model",
  sdkVersion: "scripted.v1",
  startedAt: "2026-08-30T00:00:00.000Z",
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("local public-research journal", () => {
  it("restores a checkpoint and sequence in a new host process", async () => {
    const stateRoot = await fs.mkdtemp(join(tmpdir(), "talent-signal-store-"));
    temporaryDirectories.push(stateRoot);
    const first = new LocalResearchStore(stateRoot);
    await first.start(record);
    const event = (sequence: number): AgentJournalEvent => ({
      runID,
      sequence,
      kind: "tool_call",
      occurredAt: "2026-08-30T00:00:00.000Z",
      toolName: "search_web",
      status: "allowed",
      metadata: {},
    });
    const checkpoint: AgentPublicResearchCheckpoint = {
      searchResults: [],
      fetchedPages: [],
      searchCalls: 1,
      fetchCalls: 0,
      toolCalls: 1,
      sequence: 1,
    };
    await first.append(event(1));
    await first.saveCheckpoint(runID, checkpoint);

    const restarted = new LocalResearchStore(stateRoot);
    await restarted.start({ ...record, startedAt: "2026-08-30T00:01:00.000Z" });
    await expect(restarted.loadCheckpoint(runID)).resolves.toEqual(checkpoint);
    await expect(restarted.append(event(2))).resolves.toBeUndefined();

    const directoryMode = (
      await fs.stat(join(stateRoot, "runs", runID))
    ).mode & 0o777;
    const fileMode = (
      await fs.stat(join(stateRoot, "runs", runID, "checkpoint.json"))
    ).mode & 0o777;
    expect(directoryMode).toBe(0o700);
    expect(fileMode).toBe(0o600);
  });

  it("rejects reuse of a run ID with a different authorization", async () => {
    const stateRoot = await fs.mkdtemp(join(tmpdir(), "talent-signal-store-"));
    temporaryDirectories.push(stateRoot);
    const store = new LocalResearchStore(stateRoot);
    await store.start(record);

    await expect(
      new LocalResearchStore(stateRoot).start({
        ...record,
        scope: {
          ...record.scope,
          authorization: {
            ...record.scope.authorization,
            allowedDomains: ["other.example"],
          },
        },
      }),
    ).rejects.toThrow("already belongs to a different");
  });
});
