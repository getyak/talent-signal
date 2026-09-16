import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const classifier = join(repositoryRoot, "scripts/ci/has-runtime-changes.sh");
const hybridClassifier = join(
  repositoryRoot,
  "scripts/ci/has-macos-hybrid-changes.sh",
);

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function writeCommit(worktree, relativePath, contents, message) {
  const destination = join(worktree, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
  run("git", ["add", relativePath], worktree);
  run("git", ["commit", "-m", message], worktree);
  return run("git", ["rev-parse", "HEAD"], worktree);
}

function classify(worktree, base, head) {
  return run(classifier, [base, head], worktree);
}

function commitPair(worktree, changes, message) {
  const base = run("git", ["rev-parse", "HEAD"], worktree);
  for (const [relativePath, contents] of Object.entries(changes)) {
    const destination = join(worktree, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, contents);
    run("git", ["add", relativePath], worktree);
  }
  run("git", ["commit", "-m", message], worktree);
  return [base, run("git", ["rev-parse", "HEAD"], worktree)];
}

test("runtime classifier fails closed for code, config, and ambiguous input", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "talent-signal-scope-"));

  try {
    run("git", ["init", "--initial-branch=main"], temporaryDirectory);
    run("git", ["config", "user.name", "CI scope test"], temporaryDirectory);
    run(
      "git",
      ["config", "user.email", "ci-scope@example.invalid"],
      temporaryDirectory,
    );

    writeCommit(temporaryDirectory, "README.md", "# Root\n", "Initial state");

    // Every documentation/knowledge-only shape returns false.
    for (const [changes, label] of [
      [{ "docs/notes.md": "documentation only\n" }, "docs markdown"],
      [{ "docs/operations/ci-cd.md": "ops documentation\n" }, "nested docs"],
      [{ "_index/pages/new.md": "reviewed page\n" }, "knowledge source"],
      [{ "AGENTS.md": "guidance\n" }, "root markdown"],
      [{ "apps/web/AGENTS.md": "nested guidance\n" }, "nested markdown"],
      [
        {
          "docs/architecture.svg": "<svg></svg>\n",
          "docs/notes.md": "media plus prose\n",
        },
        "documentation media",
      ],
    ]) {
      const [base, head] = commitPair(temporaryDirectory, changes, label);
      assert.equal(classify(temporaryDirectory, base, head), "false", label);
    }

    // Any non-documentation path forces the full scope, even alongside docs.
    for (const [changes, label] of [
      [{ "apps/web/src/page.tsx": "export {};\n" }, "web code"],
      [{ "apps/backend/src/server.ts": "export {};\n" }, "backend code"],
      [{ "scripts/ci/has-runtime-changes.sh": "#!/bin/sh\n" }, "tooling"],
      [{ ".github/workflows/ci.yml": "name: CI\n" }, "workflow"],
      [{ "package.json": "{}\n" }, "config"],
      [
        {
          "docs/notes.md": "doc plus code\n",
          "apps/web/src/page.tsx": "export const combined = true;\n",
        },
        "docs plus code",
      ],
    ]) {
      const [base, head] = commitPair(temporaryDirectory, changes, label);
      assert.equal(classify(temporaryDirectory, base, head), "true", label);
    }

    // Renaming runtime code into a documentation path still changes runtime
    // behavior, so rename detection must expose both the deletion and add.
    writeCommit(
      temporaryDirectory,
      "apps/web/src/renamed.ts",
      "export const removed = true;\n",
      "Add runtime source",
    );
    const renameBase = run("git", ["rev-parse", "HEAD"], temporaryDirectory);
    mkdirSync(join(temporaryDirectory, "docs"), { recursive: true });
    run(
      "git",
      ["mv", "apps/web/src/renamed.ts", "docs/renamed.md"],
      temporaryDirectory,
    );
    run("git", ["commit", "-m", "Move runtime source to docs"], temporaryDirectory);
    const renameHead = run("git", ["rev-parse", "HEAD"], temporaryDirectory);
    assert.equal(classify(temporaryDirectory, renameBase, renameHead), "true");

    // Empty diffs, missing revisions, and missing input all fail closed.
    const head = run("git", ["rev-parse", "HEAD"], temporaryDirectory);
    assert.equal(classify(temporaryDirectory, head, head), "true");

    const missingBase = spawnSync(classifier, ["missing-sha", head], {
      cwd: temporaryDirectory,
      encoding: "utf8",
    });
    assert.equal(missingBase.status, 0);
    assert.equal(missingBase.stdout.trim(), "true");

    const noArguments = spawnSync(classifier, [], {
      cwd: temporaryDirectory,
      encoding: "utf8",
    });
    assert.equal(noArguments.status, 0);
    assert.equal(noArguments.stdout.trim(), "true");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("macOS Hybrid classifier runs only for its dependency boundary", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "talent-signal-hybrid-scope-"));

  try {
    run("git", ["init", "--initial-branch=main"], temporaryDirectory);
    run("git", ["config", "user.name", "Hybrid scope test"], temporaryDirectory);
    run(
      "git",
      ["config", "user.email", "hybrid-scope@example.invalid"],
      temporaryDirectory,
    );
    writeCommit(temporaryDirectory, "README.md", "# Root\n", "Initial state");

    for (const [changes, label] of [
      [{ "apps/macos-hybrid/src/App.tsx": "export {};\n" }, "hybrid app"],
      [{ "packages/workspace-ui/src/index.ts": "export {};\n" }, "shared UI"],
      [{ "scripts/macos/check.sh": "#!/bin/sh\n" }, "macOS tooling"],
      [{ "pnpm-lock.yaml": "lockfileVersion: 9\n" }, "dependency lock"],
      [{ ".github/workflows/ci.yml": "name: CI\n" }, "CI workflow"],
    ]) {
      const [base, head] = commitPair(temporaryDirectory, changes, label);
      assert.equal(
        run(hybridClassifier, [base, head], temporaryDirectory),
        "true",
        label,
      );
    }

    for (const [changes, label] of [
      [{ "docs/notes.md": "documentation only\n" }, "documentation"],
      [{ "apps/backend/src/server.ts": "export {};\n" }, "backend only"],
      [{ "apps/ios/Sources/App.swift": "struct App {}\n" }, "iOS only"],
    ]) {
      const [base, head] = commitPair(temporaryDirectory, changes, label);
      assert.equal(
        run(hybridClassifier, [base, head], temporaryDirectory),
        "false",
        label,
      );
    }

    const head = run("git", ["rev-parse", "HEAD"], temporaryDirectory);
    assert.equal(run(hybridClassifier, [head, head], temporaryDirectory), "true");
    assert.equal(
      run(hybridClassifier, ["missing-sha", head], temporaryDirectory),
      "true",
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("CI keeps policy and docs required while skipping quality only for docs", () => {
  const ciWorkflow = readFileSync(
    join(repositoryRoot, ".github/workflows/ci.yml"),
    "utf8",
  );

  const changesJob = ciWorkflow.match(/  changes:\n([\s\S]*?)(?=\n  repository:)/);
  assert.ok(changesJob, "expected the CI changes job");
  assert.match(changesJob[1], /has-runtime-changes\.sh/);
  assert.match(changesJob[1], /docs_only: \$\{\{ steps\.scope\.outputs\.docs_only \}\}/);
  assert.match(changesJob[1], /workflow_dispatch/);
  assert.match(changesJob[1], /docs_only=false/);
  assert.match(
    changesJob[1],
    /macos_hybrid: \$\{\{ steps\.macos_hybrid\.outputs\.required \}\}/,
  );
  assert.match(changesJob[1], /has-macos-hybrid-changes\.sh/);

  for (const job of ["web", "backend", "phase-one"]) {
    const jobBody = ciWorkflow.match(
      new RegExp(`  ${job.replace("-", "\\-")}:\\n([\\s\\S]*?)(?=\\n  [a-z-]+:)`),
    );
    assert.ok(jobBody, `expected the ${job} job`);
    assert.match(jobBody[1], /needs: changes/);
    assert.match(jobBody[1], /if: needs\.changes\.outputs\.docs_only != 'true'/);
  }

  const repositoryJob = ciWorkflow.match(
    /  repository:\n([\s\S]*?)(?=\n  web:)/,
  );
  assert.ok(repositoryJob, "expected the repository job");
  assert.doesNotMatch(repositoryJob[1], /docs_only/);

  const hybridJob = ciWorkflow.match(
    /  macos-hybrid:\n([\s\S]*?)(?=\n  required:)/,
  );
  assert.ok(hybridJob, "expected the macOS Hybrid job");
  assert.match(hybridJob[1], /needs: changes/);
  assert.match(
    hybridJob[1],
    /if: needs\.changes\.outputs\.macos_hybrid == 'true'/,
  );

  const requiredJob = ciWorkflow.match(/  required:\n([\s\S]*)$/);
  assert.ok(requiredJob, "expected the CI required job");
  assert.match(requiredJob[1], /name: CI required/);
  assert.match(requiredJob[1], /DOCS_ONLY: \$\{\{ needs\.changes\.outputs\.docs_only \}\}/);
  assert.match(requiredJob[1], /test "\$REPOSITORY_RESULT" = "success"/);
  assert.match(requiredJob[1], /test "\$WEB_RESULT" = "success"/);
  assert.match(requiredJob[1], /test "\$result" = "skipped"/);
  assert.match(
    requiredJob[1],
    /MACOS_HYBRID_REQUIRED: \$\{\{ needs\.changes\.outputs\.macos_hybrid \}\}/,
  );
  assert.match(requiredJob[1], /test "\$MACOS_HYBRID_RESULT" = "skipped"/);
});

test("Security keeps secret hygiene required while gating CodeQL on docs", () => {
  const securityWorkflow = readFileSync(
    join(repositoryRoot, ".github/workflows/security.yml"),
    "utf8",
  );

  const changesJob = securityWorkflow.match(
    /  changes:\n([\s\S]*?)(?=\n  dependency-review:)/,
  );
  assert.ok(changesJob, "expected the Security changes job");
  assert.match(changesJob[1], /has-runtime-changes\.sh/);
  assert.match(
    changesJob[1],
    /docs_only: \$\{\{ steps\.scope\.outputs\.docs_only \}\}/,
  );
  assert.match(changesJob[1], /"\$EVENT_NAME" != "pull_request"/);
  assert.match(changesJob[1], /"\$EVENT_NAME" != "push"/);

  const codeqlJob = securityWorkflow.match(
    /  codeql:\n([\s\S]*?)(?=\n  codeql-swift:)/,
  );
  assert.ok(codeqlJob, "expected the JS/Actions CodeQL job");
  assert.match(codeqlJob[1], /needs: changes/);
  assert.match(
    codeqlJob[1],
    /if: needs\.changes\.outputs\.docs_only != 'true'/,
  );

  const secretJob = securityWorkflow.match(
    /  secret-hygiene:\n([\s\S]*?)(?=\n  codeql:)/,
  );
  assert.ok(secretJob, "expected the secret hygiene job");
  assert.doesNotMatch(secretJob[1], /docs_only/);

  const requiredJob = securityWorkflow.match(/  required:\n([\s\S]*)$/);
  assert.ok(requiredJob, "expected the Security required job");
  assert.match(requiredJob[1], /name: Security required/);
  assert.match(requiredJob[1], /DOCS_ONLY: \$\{\{ needs\.changes\.outputs\.docs_only \}\}/);
  assert.match(requiredJob[1], /test "\$SECRET_RESULT" = "success"/);
  assert.match(requiredJob[1], /test "\$CODEQL_RESULT" = "success"/);
  assert.match(requiredJob[1], /test "\$CODEQL_RESULT" = "skipped"/);
});

test("Release iOS ignores non-main CI completions", () => {
  const releaseWorkflow = readFileSync(
    join(repositoryRoot, ".github/workflows/release-ios.yml"),
    "utf8",
  );

  const trigger = releaseWorkflow.match(/(?:^|\n)on:\n([\s\S]*?)\npermissions:/);
  assert.ok(trigger, "expected the release trigger block");
  assert.match(trigger[1], /workflow_run:/);
  assert.match(trigger[1], /workflows: \[CI\]/);
  assert.match(trigger[1], /types: \[completed\]/);
  assert.match(trigger[1], /branches: \[main\]/);
  assert.match(trigger[1], /workflow_dispatch:/);

  // Existing release safety decisions must remain intact.
  const prepareJob = releaseWorkflow.match(
    /  prepare:\n([\s\S]*?)(?=\n  package:)/,
  );
  assert.ok(prepareJob, "expected the release preparation job");
  assert.match(prepareJob[1], /github\.event\.workflow_run\.event == 'push'/);
  assert.match(prepareJob[1], /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(prepareJob[1], /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(
    prepareJob[1],
    /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/,
  );
});

test("the bounded waiter is read-only and fails clearly", () => {
  const waiter = readFileSync(
    join(repositoryRoot, "scripts/ci/wait-for-required-checks.sh"),
    "utf8",
  );

  assert.match(waiter, /gh pr checks/);
  assert.match(waiter, /--json name,bucket/);
  assert.match(waiter, /timed out after/);
  assert.match(waiter, /required check\(s\) failed/);
  assert.match(waiter, /CI required/);
  assert.match(waiter, /Security required/);

  // No repository or pull-request mutations are allowed.
  for (const pattern of [
    /\bgh pr (?:create|edit|comment|review|merge|close|reopen|ready|rerun|lock|unlock)\b/,
    /\bgh run (?:rerun|cancel|delete)\b/,
    /\bgh api\b[^\n]*(-X|--method)\s*(?:POST|PUT|PATCH|DELETE)/i,
    /\bgit (?:push|commit|tag)\b/,
  ]) {
    assert.doesNotMatch(waiter, pattern);
  }

  const syntax = spawnSync("bash", ["-n", join(repositoryRoot, "scripts/ci/wait-for-required-checks.sh")], {
    encoding: "utf8",
  });
  assert.equal(syntax.status, 0, syntax.stderr);

  const helpFree = spawnSync(
    join(repositoryRoot, "scripts/ci/wait-for-required-checks.sh"),
    ["not-a-number", "0"],
    { encoding: "utf8" },
  );
  assert.notEqual(helpFree.status, 0);
  assert.match(helpFree.stderr, /timeout must be a positive integer/);

  const fakeBin = mkdtempSync(join(tmpdir(), "talent-signal-gh-"));
  try {
    const fakeGh = join(fakeBin, "gh");
    writeFileSync(
      fakeGh,
      `#!/usr/bin/env bash
if [ "\${1:-}" = "pr" ] && [ "\${2:-}" = "checks" ]; then
  printf 'CI required\\tpass\\nSecurity required\\t%s\\n' "\${GH_SECURITY_BUCKET:-pass}"
  exit 0
fi
exit 2
`,
    );
    chmodSync(fakeGh, 0o755);

    const success = spawnSync(
      join(repositoryRoot, "scripts/ci/wait-for-required-checks.sh"),
      ["42", "2"],
      {
        encoding: "utf8",
        env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` },
      },
    );
    assert.equal(success.status, 0, success.stderr);
    assert.match(success.stdout, /All required checks passed on PR #42/);

    const failure = spawnSync(
      join(repositoryRoot, "scripts/ci/wait-for-required-checks.sh"),
      ["42", "2"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          GH_SECURITY_BUCKET: "fail",
          PATH: `${fakeBin}:${process.env.PATH}`,
        },
      },
    );
    assert.notEqual(failure.status, 0);
    assert.match(failure.stderr, /Security required/);
  } finally {
    rmSync(fakeBin, { recursive: true, force: true });
  }
});
