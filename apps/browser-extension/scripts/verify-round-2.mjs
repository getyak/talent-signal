import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, "../../..");
const evidenceRoot = path.join(
  repositoryRoot,
  "docs/evaluations/round-2/browser-extension",
);
const buildRoot = path.join(repositoryRoot, "apps/chrome-extension/dist");

await mkdir(evidenceRoot, { recursive: true });

const checks = [
  {
    id: "browser-extension-tests",
    command: process.execPath,
    args: [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--test",
      "apps/browser-extension/tests/capture-contract.test.mjs",
      "apps/browser-extension/tests/fixture-contract.test.mjs",
      "apps/browser-extension/tests/handoff-contract.test.mjs",
      "apps/browser-extension/tests/image-review.test.mjs",
      "apps/browser-extension/tests/manifest.test.mjs",
      "apps/browser-extension/tests/review-presentation.test.mjs",
    ],
  },
  {
    id: "package-validation",
    command: process.execPath,
    args: ["apps/browser-extension/scripts/validate-package.mjs"],
  },
  {
    id: "chrome-extension-build",
    command: process.execPath,
    args: ["apps/chrome-extension/scripts/build.mjs"],
  },
  {
    id: "integrated-package-tests",
    command: process.execPath,
    args: [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--test",
      "apps/chrome-extension/tests/integrated-package.test.mjs",
    ],
  },
  {
    id: "core-evaluation",
    command: "pnpm",
    args: ["eval:core"],
  },
  {
    id: "documentation-check",
    command: "pnpm",
    args: ["docs:check"],
  },
];

const results = [];
for (const check of checks) {
  const startedAt = new Date();
  const result = spawnSync(check.command, check.args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 20_000_000,
  });
  const completedAt = new Date();
  const output = [
    `$ ${[check.command, ...check.args].join(" ")}`,
    "",
    result.stdout ?? "",
    result.stderr ?? "",
  ]
    .join("\n")
    .trimEnd()
    .concat("\n");
  const logPath = path.join(evidenceRoot, `${check.id}.log`);
  await writeFile(logPath, output);
  results.push({
    id: check.id,
    command: [check.command, ...check.args],
    exit_code: result.status,
    signal: result.signal,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    duration_ms: completedAt.valueOf() - startedAt.valueOf(),
    log: path.relative(repositoryRoot, logPath),
  });
}

async function walkFiles(directory, prefix = "") {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries.sort()) {
    const absolute = path.join(directory, entry);
    const relative = path.join(prefix, entry);
    if ((await stat(absolute)).isDirectory()) {
      files.push(...(await walkFiles(absolute, relative)));
    } else {
      files.push(relative);
    }
  }
  return files;
}

const buildFiles = await walkFiles(buildRoot);
const buildDigests = [];
const aggregate = createHash("sha256");
for (const file of buildFiles) {
  const content = await readFile(path.join(buildRoot, file));
  const digest = createHash("sha256").update(content).digest("hex");
  buildDigests.push({ file, sha256: digest, bytes: content.byteLength });
  aggregate.update(file);
  aggregate.update("\0");
  aggregate.update(digest);
  aggregate.update("\0");
}

const manifest = JSON.parse(
  await readFile(path.join(buildRoot, "manifest.json"), "utf8"),
);
const commit = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).stdout.trim();

const summary = {
  verification_id: "TS-browser-extension-round-2",
  artifact: {
    source_commit: commit,
    build_root: path.relative(repositoryRoot, buildRoot),
    aggregate_sha256: aggregate.digest("hex"),
    files: buildDigests,
    manifest: {
      version: manifest.version,
      manifest_version: manifest.manifest_version,
      permissions: manifest.permissions,
      host_permissions: manifest.host_permissions,
      incognito: manifest.incognito,
    },
  },
  environment: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    real_candidate_data: false,
    external_writes: false,
  },
  checks: results,
  result: results.every((result) => result.exit_code === 0) ? "pass" : "fail",
  caveat:
    "Verification does not prove user Google Chrome toolbar activeTab, a real localhost backend receipt, or backend retention/deletion.",
};

const summaryPath = path.join(evidenceRoot, "verification-summary.json");
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

if (summary.result !== "pass") {
  process.exitCode = 1;
}
