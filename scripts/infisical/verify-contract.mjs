#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifySecretEnvironment } from "../verify-secret-environment.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(
  await readFile(resolve(repositoryRoot, "config/infisical-secrets.json"), "utf8"),
);
const contractName = process.argv[2];
const contract = manifest.contracts[contractName];

if (!contract) {
  process.stderr.write(`Unknown Infisical contract: ${contractName ?? "<missing>"}\n`);
  process.exitCode = 2;
} else {
  const verification = verifySecretEnvironment(process.env, contract.required);
  for (const result of verification.results) {
    process.stdout.write(`${result.name}: ${result.present ? "present" : "missing"}\n`);
  }
  process.stdout.write(`${verification.message}\n`);
  if (!verification.ok) process.exitCode = 1;
}
