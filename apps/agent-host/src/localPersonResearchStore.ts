import { randomUUID } from "node:crypto";
import { constants, promises as fs } from "node:fs";
import { join } from "node:path";

import {
  fingerprint,
  type AgentBudget,
  type AgentJournalEvent,
  type AgentJournalOutput,
  type AgentPersonResearchArtifactCandidate,
  type AgentPersonResearchCheckpoint,
  type AgentPersonResearchJournal,
  type AgentPersonResearchNoActionCandidate,
  type AgentPersonResearchScope,
  type AgentPersonResearchTerminalReceipt,
} from "@talent-signal/agent";

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const FINGERPRINT = /^[0-9a-f]{64}$/u;

export interface LocalPersonResearchRunRecord {
  scope: AgentPersonResearchScope;
  budget: AgentBudget;
  modelProviderID: string;
  model: string;
  sdkVersion: string;
  startedAt: string;
}

export interface LocalPersonResearchArtifactRecord {
  artifactID: string;
  runID: string;
  status: "draft";
  identityAuthority: "unconfirmed";
  publicationAuthority: "none";
  externalEffectAuthority: "none";
  candidateFingerprint: string;
  objective: string;
  authorization: AgentPersonResearchScope["authorization"];
  inputArtifactManifest: AgentPersonResearchScope["inputArtifactManifest"];
  candidate: AgentPersonResearchArtifactCandidate;
  createdAt: string;
}

export interface LocalPersonResearchNoActionRecord {
  noActionID: string;
  runID: string;
  candidateFingerprint: string;
  candidate: AgentPersonResearchNoActionCandidate;
  createdAt: string;
}

function stableRunIdentity(record: LocalPersonResearchRunRecord) {
  return fingerprint({
    scope: record.scope,
    budget: record.budget,
    modelProviderID: record.modelProviderID,
    model: record.model,
    sdkVersion: record.sdkVersion,
  });
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path, "utf8")) as T;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(temporary, path);
  await fs.chmod(path, 0o600);
}

export class LocalPersonResearchStore implements AgentPersonResearchJournal {
  private readonly lastSequence = new Map<string, number>();

  constructor(readonly stateRoot: string) {}

  private runDirectory(runID: string): string {
    if (!RUN_ID.test(runID)) throw new Error("The local Run ID must be a UUID.");
    return join(this.stateRoot, "person-runs", runID);
  }

  private path(runID: string, name: string): string {
    return join(this.runDirectory(runID), name);
  }

  private async ensureRunDirectories(runID: string): Promise<void> {
    const collection = join(this.stateRoot, "person-runs");
    const directory = this.runDirectory(runID);
    await fs.mkdir(join(directory, "artifacts"), { recursive: true, mode: 0o700 });
    await fs.mkdir(join(directory, "no-actions"), { recursive: true, mode: 0o700 });
    await fs.chmod(this.stateRoot, 0o700);
    await fs.chmod(collection, 0o700);
    await fs.chmod(directory, 0o700);
  }

  async start(input: LocalPersonResearchRunRecord): Promise<void> {
    await this.ensureRunDirectories(input.scope.runID);
    const path = this.path(input.scope.runID, "run.json");
    const existing = await readJson<LocalPersonResearchRunRecord>(path);
    if (existing) {
      if (stableRunIdentity(existing) !== stableRunIdentity(input)) {
        throw new Error(
          "The Run ID already belongs to a different image, objective, authorization, provider, model, or budget.",
        );
      }
    } else {
      await atomicJson(path, input);
    }
    const checkpoint = await this.loadCheckpoint(input.scope.runID);
    this.lastSequence.set(input.scope.runID, checkpoint?.sequence ?? 0);
  }

  loadCheckpoint(runID: string) {
    return readJson<AgentPersonResearchCheckpoint>(
      this.path(runID, "checkpoint.json"),
    );
  }

  saveCheckpoint(runID: string, checkpoint: AgentPersonResearchCheckpoint) {
    return atomicJson(this.path(runID, "checkpoint.json"), checkpoint);
  }

  async append(event: AgentJournalEvent): Promise<void> {
    const expected = (this.lastSequence.get(event.runID) ?? 0) + 1;
    if (event.sequence !== expected) {
      throw new Error(
        `Local journal sequence mismatch: expected ${expected}, received ${event.sequence}.`,
      );
    }
    await fs.appendFile(
      this.path(event.runID, "events.jsonl"),
      `${JSON.stringify(event)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    this.lastSequence.set(event.runID, event.sequence);
  }

  async recordOutput(output: AgentJournalOutput): Promise<void> {
    await fs.appendFile(
      this.path(output.runID, "outputs.jsonl"),
      `${JSON.stringify(output)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  }

  async complete(receipt: AgentPersonResearchTerminalReceipt) {
    const path = this.path(receipt.runID, "terminal.json");
    const existing = await readJson<AgentPersonResearchTerminalReceipt>(path);
    if (existing) {
      if (fingerprint(existing) !== fingerprint(receipt)) {
        throw new Error("The Run already has a different terminal receipt.");
      }
      return existing;
    }
    await atomicJson(path, receipt);
    return receipt;
  }

  readTerminal(runID: string) {
    return readJson<AgentPersonResearchTerminalReceipt>(
      this.path(runID, "terminal.json"),
    );
  }

  readRun(runID: string) {
    return readJson<LocalPersonResearchRunRecord>(
      this.path(runID, "run.json"),
    );
  }

  async commitPersonResearchArtifact(
    scope: AgentPersonResearchScope,
    candidate: AgentPersonResearchArtifactCandidate,
    candidateFingerprint: string,
  ) {
    if (!FINGERPRINT.test(candidateFingerprint)) {
      throw new Error("The artifact fingerprint is invalid.");
    }
    const path = this.artifactPath(scope.runID, candidateFingerprint);
    const existing = await readJson<{ artifactID: string }>(path);
    if (existing) {
      return {
        artifactID: existing.artifactID,
        status: "draft" as const,
        replayed: true,
      };
    }
    const artifact = {
      artifactID: randomUUID(),
      runID: scope.runID,
      status: "draft",
      identityAuthority: "unconfirmed",
      publicationAuthority: "none",
      externalEffectAuthority: "none",
      candidateFingerprint,
      objective: scope.objective,
      authorization: scope.authorization,
      inputArtifactManifest: scope.inputArtifactManifest,
      candidate,
      createdAt: new Date().toISOString(),
    };
    await atomicJson(path, artifact);
    return {
      artifactID: artifact.artifactID,
      status: "draft" as const,
      replayed: false,
    };
  }

  async commitNoAction(
    scope: AgentPersonResearchScope,
    candidate: AgentPersonResearchNoActionCandidate,
    candidateFingerprint: string,
  ) {
    if (!FINGERPRINT.test(candidateFingerprint)) {
      throw new Error("The no-action fingerprint is invalid.");
    }
    const path = join(
      this.runDirectory(scope.runID),
      "no-actions",
      `${candidateFingerprint}.json`,
    );
    const existing = await readJson<{ noActionID: string }>(path);
    if (existing) return { noActionID: existing.noActionID, replayed: true };
    const noAction = {
      noActionID: randomUUID(),
      runID: scope.runID,
      candidateFingerprint,
      candidate,
      createdAt: new Date().toISOString(),
    };
    await atomicJson(path, noAction);
    return { noActionID: noAction.noActionID, replayed: false };
  }

  artifactPath(runID: string, candidateFingerprint: string): string {
    if (!FINGERPRINT.test(candidateFingerprint)) {
      throw new Error("The artifact fingerprint is invalid.");
    }
    return join(
      this.runDirectory(runID),
      "artifacts",
      `${candidateFingerprint}.json`,
    );
  }

  noActionPath(runID: string, candidateFingerprint: string): string {
    if (!FINGERPRINT.test(candidateFingerprint)) {
      throw new Error("The no-action fingerprint is invalid.");
    }
    return join(
      this.runDirectory(runID),
      "no-actions",
      `${candidateFingerprint}.json`,
    );
  }

  readArtifact(runID: string, candidateFingerprint: string) {
    return readJson<LocalPersonResearchArtifactRecord>(
      this.artifactPath(runID, candidateFingerprint),
    );
  }

  readNoAction(runID: string, candidateFingerprint: string) {
    return readJson<LocalPersonResearchNoActionRecord>(
      this.noActionPath(runID, candidateFingerprint),
    );
  }

  async artifactExists(runID: string, candidateFingerprint: string) {
    try {
      await fs.access(
        this.artifactPath(runID, candidateFingerprint),
        constants.R_OK,
      );
      return true;
    } catch {
      return false;
    }
  }
}
