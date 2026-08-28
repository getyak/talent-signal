#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(
  await readFile(resolve(repositoryRoot, "config/infisical-secrets.json"), "utf8"),
);

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function run(command, argumentsList) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, argumentsList, {
      stdio: ["ignore", "ignore", "inherit"],
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with ${code ?? "no status"}.`));
    });
  });
}

const environmentSlug = option("environment");
const groupName = option("group");
const sourceFile = option("source-file");
const sourceKeyFile = option("source-key-file");
const apply = process.argv.includes("--apply");
const group = manifest.groups[groupName];

if (!manifest.environments.includes(environmentSlug)) {
  throw new Error("--environment must be dev, staging, or prod.");
}
if (!group) throw new Error("--group must name one manifest group.");
if (!apply) throw new Error("Refusing to write without --apply.");
if (sourceFile && sourceKeyFile) {
  throw new Error("Use either --source-file or --source-key-file, not both.");
}

let source = process.env;
let rawKeyImport;
if (sourceFile) {
  source = parseEnv(await readFile(resolve(sourceFile), "utf8"));
} else if (sourceKeyFile) {
  const separator = sourceKeyFile.indexOf(":");
  if (separator <= 0 || separator === sourceKeyFile.length - 1) {
    throw new Error("--source-key-file must be NAME:PATH.");
  }
  const name = sourceKeyFile.slice(0, separator);
  const path = sourceKeyFile.slice(separator + 1);
  if (!group.names.includes(name)) {
    throw new Error(`${name} is not allowlisted in ${groupName}.`);
  }
  const resolvedPath = resolve(path);
  source = { [name]: await readFile(resolvedPath, "utf8") };
  rawKeyImport = { name, path: resolvedPath };
}
const selected = Object.fromEntries(
  group.names
    .filter((name) => typeof source[name] === "string" && source[name].trim())
    .map((name) => [name, source[name]]),
);

if (Object.keys(selected).length === 0) {
  process.stdout.write(
    `No allowlisted ${groupName} values were present; Infisical was unchanged.\n`,
  );
  process.exit(0);
}

if (rawKeyImport) {
  await run("infisical", [
    "secrets",
    "set",
    `${rawKeyImport.name}=@${rawKeyImport.path}`,
    "--projectId",
    manifest.projectId,
    "--env",
    environmentSlug,
    "--path",
    group.path,
    "--silent",
  ]);
  process.stdout.write(
    `Migrated 1 allowlisted raw-file name to ${environmentSlug}:${group.path}; its value was not printed.\n`,
  );
  process.exit(0);
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), "talent-signal-infisical-"));
const temporaryEnvironment = join(temporaryDirectory, "migration.env");
try {
  const body = `${Object.entries(selected)
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
    .join("\n")}\n`;
  await writeFile(temporaryEnvironment, body, { encoding: "utf8", mode: 0o600 });
  await run("infisical", [
    "secrets",
    "set",
    "--file",
    temporaryEnvironment,
    "--projectId",
    manifest.projectId,
    "--env",
    environmentSlug,
    "--path",
    group.path,
    "--silent",
  ]);
  process.stdout.write(
    `Migrated ${Object.keys(selected).length} allowlisted names to ${environmentSlug}:${group.path}; values were not printed.\n`,
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
