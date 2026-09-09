import { randomUUID } from "node:crypto";
import { access, chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { InMemorySessionStore } from "@anthropic-ai/claude-agent-sdk";
import { createClaudeHarnessWorkspace, sweepClaudeHarnessWorkspaces } from "./claudeHarnessWorkspace.js";

const roots: string[] = [];
async function root() { const path = await mkdtemp(join(tmpdir(), "get9-workspace-test-")); roots.push(path); return path; }
afterEach(async () => { for (const path of roots.splice(0)) await rm(path, { recursive: true, force: true }); });
const marker = ".harness-owner.json";

describe("SDK working-copy crash cleanup", () => {
  it("retains the journal through partial resume deletion and retries without the project directory", async () => {
    const path = await root(), id = randomUUID(), workspace = await createClaudeHarnessWorkspace(1000, id, path);
    const key = { projectKey: "partial-delete-project", sessionId: id };
    await workspace.wrapStore(new InMemorySessionStore()).load(key);
    const resume = join(path, `claude-resume-${randomUUID()}`), locked = join(resume, "locked");
    await mkdir(join(resume, "projects", key.projectKey), { recursive: true });
    await mkdir(locked); await writeFile(join(locked, "retained.txt"), "Synthetic payload");
    await chmod(locked, 0);
    try {
      await expect(workspace.dispose()).rejects.toMatchObject({ code: "EACCES" });
      const owner = JSON.parse(await readFile(join(workspace.directory, marker), "utf8"));
      expect(owner.resumeCopies).toHaveLength(1);
      // A failed recursive deletion may already have removed this authority
      // clue. Retry must use the previously journaled root identity.
      await rm(join(resume, "projects"), { recursive: true, force: true });
      await chmod(locked, 0o700);
      await writeFile(join(workspace.directory, marker), JSON.stringify({ ...owner, deadline: 1 }));
      await sweepClaudeHarnessWorkspaces(path);
      await expect(access(resume)).rejects.toThrow(); await expect(access(workspace.directory)).rejects.toThrow();
    } finally { await chmod(locked, 0o700).catch(() => {}); }
  });
  it("keeps Run ownership until all local payloads are removed after a permission failure", async () => {
    const path = await root(), workspace = await createClaudeHarnessWorkspace(1000, undefined, path);
    const locked = join(workspace.directory, "locked");
    await mkdir(locked); await writeFile(join(locked, "retained.txt"), "Synthetic payload"); await chmod(locked, 0);
    try {
      await expect(workspace.dispose()).rejects.toMatchObject({ code: "EACCES" });
      const owner = JSON.parse(await readFile(join(workspace.directory, marker), "utf8"));
      await chmod(locked, 0o700);
      await writeFile(join(workspace.directory, marker), JSON.stringify({ ...owner, deadline: 1 }));
      await sweepClaudeHarnessWorkspaces(path);
      await expect(access(workspace.directory)).rejects.toThrow();
    } finally { await chmod(locked, 0o700).catch(() => {}); }
  });
  it("journals ownership before returning resume data and removes pre-SessionStart copies", async () => {
    const path = await root(), id = randomUUID(), workspace = await createClaudeHarnessWorkspace(1000, id, path);
    const store = new InMemorySessionStore(), key = { projectKey: "unique-run-project", sessionId: id };
    await store.append(key, [{ type: "user", uuid: randomUUID(), message: { role: "user", content: "Synthetic context" } }]);
    const wrapped = workspace.wrapStore(store);
    expect(await wrapped.load(key)).toHaveLength(1);
    expect(JSON.parse(await readFile(join(workspace.directory, marker), "utf8"))).toMatchObject({ sessionID: id, projectKey: key.projectKey });
    const resume = join(path, `claude-resume-${randomUUID()}`);
    await mkdir(join(resume, "projects", key.projectKey), { recursive: true });
    // No transcript file and no SessionStart hook yet: project identity suffices.
    await workspace.dispose();
    await expect(access(resume)).rejects.toThrow();
    await expect(access(workspace.directory)).rejects.toThrow();
  });
  it("removes a crashed owner's main/subagent copies while preserving live and unrelated work", async () => {
    const path = await root(), id = randomUUID(), project = "dead-owner-project";
    const crashed = join(path, "talent-signal-harness-v1-crashed");
    await mkdir(crashed);
    await writeFile(join(crashed, marker), JSON.stringify({ version: 1, pid: process.pid, deadline: 1, sessionID: id, projectKey: project }));
    const resume = join(path, `claude-resume-${randomUUID()}`), subagent = join(resume, "projects", project, id, "subagents");
    await mkdir(subagent, { recursive: true });
    await writeFile(join(subagent, "agent-child.jsonl"), "Synthetic derivative");
    const unrelated = join(path, `claude-resume-${randomUUID()}`);
    await mkdir(join(unrelated, "projects", "other-project"), { recursive: true });
    const live = await createClaudeHarnessWorkspace(1000, randomUUID(), path);
    await sweepClaudeHarnessWorkspaces(path);
    await expect(access(crashed)).rejects.toThrow(); await expect(access(resume)).rejects.toThrow();
    await access(live.directory); await access(unrelated);
    await live.dispose();
  });
  it("does not follow directory symlinks or accept traversal markers as deletion authority", async () => {
    const path = await root(), outside = await root();
    await writeFile(join(outside, "keep.txt"), "unrelated");
    await symlink(outside, join(path, "talent-signal-harness-v1-link"));
    const forged = join(path, "talent-signal-harness-v1-forged"); await mkdir(forged);
    await writeFile(join(forged, marker), JSON.stringify({ version: 1, pid: process.pid, deadline: 1, sessionID: randomUUID(), projectKey: "../../outside" }));
    await sweepClaudeHarnessWorkspaces(path);
    expect(await readFile(join(outside, "keep.txt"), "utf8")).toBe("unrelated"); await access(forged);
  });
});
