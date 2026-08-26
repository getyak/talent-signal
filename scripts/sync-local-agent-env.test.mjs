import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseEnv } from "node:util";

import { syncLocalAgentEnvironment } from "./sync-local-agent-env.mjs";

test("copies only allowlisted OpenRouter settings and preserves local target values", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "talent-signal-agent-env-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const source = join(directory, "source.env");
  const target = join(directory, "target.env");
  await writeFile(target, "POSTGRES_PORT=55432\nLOCAL_ONLY=keep-me\n");
  await writeFile(
    source,
    [
      "OPENROUTER_API_KEY=synthetic-secret-value",
      "OPENROUTER_BASE_URL=https://openrouter.example/v1",
      "DEEPSEEK_API_KEY=must-not-copy",
      "UNRELATED_TOKEN=must-not-copy",
    ].join("\n"),
  );

  const result = await syncLocalAgentEnvironment(source, target);
  const targetText = await readFile(target, "utf8");
  const values = parseEnv(targetText);

  assert.deepEqual(result.copied, [
    "OPENROUTER_API_KEY",
    "OPENROUTER_BASE_URL",
  ]);
  assert.equal(result.provider, "openrouter");
  assert.deepEqual(Object.keys(values).sort(), [
    "LOCAL_ONLY",
    "OPENROUTER_API_KEY",
    "OPENROUTER_BASE_URL",
    "POSTGRES_PORT",
    "TALENT_SIGNAL_AGENT_MODEL",
    "TALENT_SIGNAL_AGENT_PROVIDER",
    "TALENT_SIGNAL_AGENT_REFERER",
  ]);
  assert.equal(values.OPENROUTER_API_KEY, "synthetic-secret-value");
  assert.equal(values.TALENT_SIGNAL_AGENT_MODEL, "cohere/north-mini-code:free");
  assert.equal(values.POSTGRES_PORT, "55432");
  assert.equal(values.LOCAL_ONLY, "keep-me");
  assert.equal((await stat(target)).mode & 0o777, 0o600);
  assert.equal(targetText.includes("must-not-copy"), false);
});

test("prefers a pinned Claude Agent and excludes unrelated source credentials", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "talent-signal-agent-env-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const source = join(directory, "source.env");
  const target = join(directory, "target.env");
  await writeFile(
    source,
    [
      "ANTHROPIC_API_KEY=synthetic-anthropic-secret",
      "ANTHROPIC_BASE_URL=https://anthropic.example",
      "ANTHROPIC_MODEL=claude-synthetic-pinned",
      "DATABASE_URL=postgresql://must-not-copy",
      "REDIS_URL=redis://must-not-copy",
      "APNS__PRODUCTION_PRIVATE_KEY=must-not-copy",
    ].join("\n"),
  );

  const result = await syncLocalAgentEnvironment(source, target);
  const targetText = await readFile(target, "utf8");
  const values = parseEnv(targetText);

  assert.equal(result.provider, "claude");
  assert.equal(result.model, "claude-synthetic-pinned");
  assert.deepEqual(result.copied, [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_MODEL",
  ]);
  assert.deepEqual(Object.keys(values).sort(), [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_BASE_URL",
    "TALENT_SIGNAL_AGENT_MODEL",
    "TALENT_SIGNAL_AGENT_PROVIDER",
  ]);
  assert.equal(values.ANTHROPIC_API_KEY, "synthetic-anthropic-secret");
  assert.equal(values.TALENT_SIGNAL_AGENT_MODEL, "claude-synthetic-pinned");
  assert.equal(targetText.includes("must-not-copy"), false);
  assert.equal((await stat(target)).mode & 0o777, 0o600);
});

test("requires an explicit pinned Claude model", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "talent-signal-agent-env-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const source = join(directory, "source.env");
  const target = join(directory, "target.env");
  await writeFile(source, "ANTHROPIC_API_KEY=synthetic-secret-value\n");

  await assert.rejects(
    syncLocalAgentEnvironment(source, target),
    /requires one explicitly pinned model/,
  );
  await assert.rejects(stat(target), { code: "ENOENT" });
});

test("fails without a supported Agent key and does not create the target", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "talent-signal-agent-env-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const source = join(directory, "source.env");
  const target = join(directory, "target.env");
  await writeFile(source, "DEEPSEEK_API_KEY=not-eligible\n");

  await assert.rejects(
    syncLocalAgentEnvironment(source, target),
    /no supported Agent credential/,
  );
  await assert.rejects(stat(target), { code: "ENOENT" });
});
