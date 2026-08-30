import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ScriptedAgentProvider,
  fingerprint,
} from "@talent-signal/agent";
import { afterEach, describe, expect, it } from "vitest";

import { runLocalResearchCommand } from "./cli.js";
import { LocalResearchGateway } from "./localResearchGateway.js";
import { LocalResearchStore } from "./localResearchStore.js";
import type { AgentWebSearchProvider } from "./webSearchProviders.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("local Agent host CLI", () => {
  it("persists a cited draft locally without a backend", async () => {
    const stateRoot = await fs.mkdtemp(join(tmpdir(), "talent-signal-agent-"));
    temporaryDirectories.push(stateRoot);
    const runID = "33333333-3333-4333-8333-333333333333";
    const resultID = fingerprint({
      runID,
      providerID: "synthetic-search",
      url: "https://example.com/update",
    });
    const searchProvider: AgentWebSearchProvider = {
      id: "synthetic-search",
      async search() {
        return [
          {
            url: "https://example.com/update",
            title: "Company update",
            snippet: "A public update.",
            publishedAt: null,
            providerID: "synthetic-search",
          },
        ];
      },
    };
    const modelProvider = new ScriptedAgentProvider(
      [
        {
          tool: "search_web",
          input: {
            query: "Example Company public update",
            maximum_results: 5,
            recency_days: 30,
          },
        },
        { tool: "fetch_web", input: { result_id: resultID } },
        {
          tool: "create_research_artifact",
          input: {
            title: "Company update",
            summary: "The company published an update.",
            limitations: "One public source was fetched.",
            claims: [
              {
                statement: "The company published an update.",
                source_refs: [resultID],
              },
            ],
          },
        },
      ],
      (toolResults) => ({
        outcome: "artifact",
        candidate_fingerprint: toolResults.at(-1)?.candidateFingerprint,
      }),
    );
    const store = new LocalResearchStore(stateRoot);
    const gateway = new LocalResearchGateway(searchProvider, store, {
      fetchPage: async (_scope, discovered) => ({
        canonicalUrl: discovered.url,
        title: discovered.title,
        text: "The company published an update.",
        contentHash: "a".repeat(64),
        retrievedAt: "2026-08-30T00:00:00.000Z",
        providerID: discovered.providerID,
      }),
    });

    const result = await runLocalResearchCommand(
      [
        "research",
        "--objective",
        "Research Example Company's public update.",
        "--subject",
        "company",
        "--allow-domain",
        "example.com",
        "--anchor",
        "Example Company",
        "--run-id",
        runID,
        "--state-dir",
        stateRoot,
      ],
      {},
      { modelProvider, searchProvider, gateway },
    );

    expect(result.receipt.status).toBe("artifact_created");
    expect(result.artifactFile).not.toBeNull();
    const artifact = JSON.parse(
      await fs.readFile(result.artifactFile!, "utf8"),
    ) as Record<string, unknown>;
    expect(artifact).toMatchObject({
      status: "draft",
      publicationAuthority: "none",
      runID,
    });
    await expect(fs.access(join(stateRoot, "runs", runID, "terminal.json"))).resolves.toBeUndefined();

    const replay = await runLocalResearchCommand(
      [
        "research",
        "--objective",
        "Research Example Company's public update.",
        "--subject",
        "company",
        "--allow-domain",
        "example.com",
        "--anchor",
        "Example Company",
        "--run-id",
        runID,
        "--state-dir",
        stateRoot,
      ],
      {},
      { modelProvider, searchProvider, gateway },
    );
    expect(replay.replayedTerminal).toBe(true);
    expect(replay.receipt).toEqual(result.receipt);

    await expect(
      runLocalResearchCommand(
        [
          "research",
          "--objective",
          "A different objective.",
          "--subject",
          "company",
          "--allow-domain",
          "example.com",
          "--anchor",
          "Example Company",
          "--run-id",
          runID,
          "--state-dir",
          stateRoot,
        ],
        {},
        { modelProvider, searchProvider, gateway },
      ),
    ).rejects.toThrow("different objective or authorization");
  });

  it("requires an explicit open-web or domain authorization", async () => {
    await expect(
      runLocalResearchCommand([
        "research",
        "--objective",
        "Research a market.",
        "--subject",
        "market",
        "--anchor",
        "Example market",
      ]),
    ).rejects.toThrow("Choose exactly one");
  });
});
