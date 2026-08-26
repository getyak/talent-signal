#!/usr/bin/env node

import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readEnvironment(path) {
  try {
    return parseEnv(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

function firstNonEmpty(source, names) {
  for (const name of names) {
    const value = source[name]?.trim();
    if (value) return { name, value };
  }
  return null;
}

function resolveProvider(source, requestedProvider) {
  if (requestedProvider && requestedProvider !== "claude") {
    throw new Error("Provider must be claude.");
  }
  if (source.ANTHROPIC_API_KEY?.trim()) return "claude";
  throw new Error("The source environment has no ANTHROPIC_API_KEY.");
}

function claudeValues(source) {
  if (!source.ANTHROPIC_API_KEY?.trim()) {
    throw new Error("The source environment has no ANTHROPIC_API_KEY.");
  }
  const model = firstNonEmpty(source, [
    "TALENT_SIGNAL_AGENT_MODEL",
    "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
  ]);
  if (!model) {
    throw new Error("Claude Agent execution requires one explicitly pinned model.");
  }
  return {
    values: {
      TALENT_SIGNAL_AGENT_PROVIDER: "claude",
      TALENT_SIGNAL_AGENT_MODEL: model.value,
      ANTHROPIC_API_KEY: source.ANTHROPIC_API_KEY.trim(),
      ...(source.ANTHROPIC_BASE_URL?.trim()
        ? { ANTHROPIC_BASE_URL: source.ANTHROPIC_BASE_URL.trim() }
        : {}),
    },
    copied: [
      "ANTHROPIC_API_KEY",
      ...(source.ANTHROPIC_BASE_URL?.trim() ? ["ANTHROPIC_BASE_URL"] : []),
      model.name,
    ],
  };
}

export async function syncLocalAgentEnvironment(
  sourcePath,
  targetPath,
  requestedProvider,
) {
  if (!sourcePath) {
    throw new Error("Pass the source .env path as the first argument.");
  }
  const source = parseEnv(await readFile(resolve(sourcePath), "utf8"));
  const target = resolve(targetPath ?? resolve(repositoryRoot, ".env"));
  const existing = await readEnvironment(target);
  const provider = resolveProvider(source, requestedProvider);
  const selection = claudeValues(source);
  const values = { ...existing, ...selection.values };
  const body = `${Object.entries(values)
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
    .join("\n")}\n`;
  const temporary = `${target}.syncing`;
  await writeFile(temporary, body, { encoding: "utf8", mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, target);
  await chmod(target, 0o600);
  return { target, provider, model: selection.values.TALENT_SIGNAL_AGENT_MODEL, copied: selection.copied };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argumentsAfterSeparator = process.argv.slice(2).filter((value) => value !== "--");
  syncLocalAgentEnvironment(
    argumentsAfterSeparator[0],
    argumentsAfterSeparator[1],
    argumentsAfterSeparator[2],
  )
    .then((result) => {
      process.stdout.write(
        `Configured pinned ${result.provider} Agent in ${result.target}; copied ${result.copied.join(", ")} without printing values.\n`,
      );
    })
    .catch((error) => {
      process.stderr.write(
        `Agent environment sync failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
      );
      process.exitCode = 1;
    });
}
