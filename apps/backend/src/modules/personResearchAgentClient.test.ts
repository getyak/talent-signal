import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  PERSON_RESEARCH_SERVICE_CONTRACT_VERSION,
} from "@talent-signal/agent";
import { afterEach, describe, expect, it } from "vitest";

import {
  createEnvironmentPersonResearchAgentClient,
  LocalPersonResearchAgentClient,
} from "./personResearchAgentClient.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

function noActionResponse(runID: string) {
  return {
    contract_version: PERSON_RESEARCH_SERVICE_CONTRACT_VERSION,
    run_id: runID,
    receipt: {
      run_id: runID,
      status: "no_action",
      reason_code: "NO_ACTION_RECORDED",
      artifact_id: null,
      no_action_id: "77777777-7777-4777-8777-777777777777",
      candidate_fingerprint: "a".repeat(64),
      external_effects: [],
      permission_denials: [],
      provider_session_id: null,
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15,
        estimated_usd: 0.001,
        turns: 1,
        tool_calls: 0,
        duration_ms: 25,
      },
      completed_at: "2026-08-31T00:00:00.000Z",
    },
    result: {
      kind: "no_action",
      reason_code: "NO_VISIBLE_IDENTITY_CLUE",
      reason: "No usable visible identity clue was present.",
    },
  };
}

describe("local person-research Agent client", () => {
  it("sends one hashed screenshot over a Unix socket and verifies zero-effect readback", async () => {
    const directory = await fs.mkdtemp(join(tmpdir(), "talent-signal-agent-client-"));
    temporaryDirectories.push(directory);
    const socketPath = join(directory, "person-research.sock");
    const runID = "66666666-6666-4666-8666-666666666666";
    let received: Record<string, unknown> | null = null;
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      received = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(noActionResponse(runID)));
    });
    await new Promise<void>((accept, reject) => {
      server.once("error", reject);
      server.listen(socketPath, accept);
    });
    try {
      const image = Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        Buffer.from("synthetic fixture"),
      ]);
      const result = await new LocalPersonResearchAgentClient(
        socketPath,
      ).research({
        runID,
        objective: "Find possible public profiles from visible screenshot text.",
        image: { mediaType: "image/png", data: image },
      });

      expect(result.result).toMatchObject({
        kind: "no_action",
        reason_code: "NO_VISIBLE_IDENTITY_CLUE",
      });
      expect(received).toMatchObject({
        contract_version: PERSON_RESEARCH_SERVICE_CONTRACT_VERSION,
        run_id: runID,
        authorization: {
          allowed_platforms: ["douyin", "tiktok", "weibo", "threads"],
        },
        image: { byte_size: image.byteLength, media_type: "image/png" },
      });
      expect(JSON.stringify(received)).not.toContain("TIKHUB_API_KEY");
    } finally {
      await new Promise<void>((accept) => server.close(() => accept()));
    }
  });

  it("stays disabled by default and requires sensitive-processing admission", () => {
    expect(createEnvironmentPersonResearchAgentClient({})).toBeNull();
    expect(createEnvironmentPersonResearchAgentClient({
      TALENT_SIGNAL_PERSON_RESEARCH_ENABLED: "false",
    })).toBeNull();
    expect(() => createEnvironmentPersonResearchAgentClient({
      TALENT_SIGNAL_PERSON_RESEARCH_ENABLED: "true",
      TALENT_SIGNAL_PERSON_RESEARCH_SOCKET: "/tmp/person-research.sock",
    })).toThrow("ALLOW_SENSITIVE_AI_PROCESSING=true");
    expect(createEnvironmentPersonResearchAgentClient({
      TALENT_SIGNAL_PERSON_RESEARCH_ENABLED: "true",
      TALENT_SIGNAL_ALLOW_SENSITIVE_AI_PROCESSING: "true",
      TALENT_SIGNAL_PERSON_RESEARCH_SOCKET: "/tmp/person-research.sock",
    })).toBeInstanceOf(LocalPersonResearchAgentClient);
  });
});
