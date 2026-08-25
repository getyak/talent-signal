import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
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
const classifier = join(repositoryRoot, "scripts/ci/has-ios-changes.sh");

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

function classify(worktree, base, head, pathSet) {
  const args = [base, head];
  if (pathSet) args.push(pathSet);
  return run(classifier, args, worktree);
}

test("CI and release use explicit, shared iOS change sets", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "talent-signal-ios-policy-"));

  try {
    run("git", ["init", "--initial-branch=main"], temporaryDirectory);
    run("git", ["config", "user.name", "iOS policy test"], temporaryDirectory);
    run(
      "git",
      ["config", "user.email", "ios-policy@example.invalid"],
      temporaryDirectory,
    );

    let base = writeCommit(
      temporaryDirectory,
      "README.md",
      "initial\n",
      "Initial state",
    );
    let head = writeCommit(
      temporaryDirectory,
      "docs/notes.md",
      "documentation only\n",
      "Change documentation",
    );
    assert.equal(classify(temporaryDirectory, base, head), "false");
    assert.equal(classify(temporaryDirectory, base, head, "--ci-files"), "false");
    assert.equal(
      classify(temporaryDirectory, base, head, "--release-files"),
      "false",
    );

    base = head;
    head = writeCommit(
      temporaryDirectory,
      ".github/workflows/ci.yml",
      "name: CI\n",
      "Change CI",
    );
    assert.equal(classify(temporaryDirectory, base, head), "false");
    assert.equal(classify(temporaryDirectory, base, head, "--ci-files"), "true");
    assert.equal(
      classify(temporaryDirectory, base, head, "--release-files"),
      "false",
    );

    base = head;
    head = writeCommit(
      temporaryDirectory,
      ".github/workflows/release-ios.yml",
      "name: Release iOS\n",
      "Change release workflow",
    );
    assert.equal(classify(temporaryDirectory, base, head), "false");
    assert.equal(classify(temporaryDirectory, base, head, "--ci-files"), "true");
    assert.equal(
      classify(temporaryDirectory, base, head, "--release-files"),
      "true",
    );

    base = head;
    head = writeCommit(
      temporaryDirectory,
      "scripts/ci/has-ios-changes.sh",
      "release policy implementation\n",
      "Change release classifier",
    );
    assert.equal(classify(temporaryDirectory, base, head), "false");
    assert.equal(classify(temporaryDirectory, base, head, "--ci-files"), "true");
    assert.equal(
      classify(temporaryDirectory, base, head, "--release-files"),
      "true",
    );

    base = head;
    head = writeCommit(
      temporaryDirectory,
      "apps/ios/App.swift",
      "// iOS product change\n",
      "Change iOS product",
    );
    assert.equal(classify(temporaryDirectory, base, head), "true");
    assert.equal(classify(temporaryDirectory, base, head, "--ci-files"), "true");
    assert.equal(
      classify(temporaryDirectory, base, head, "--release-files"),
      "true",
    );
    assert.equal(classify(temporaryDirectory, "missing", head), "true");

    const invalidMode = spawnSync(
      classifier,
      [base, head, "--unknown-files"],
      { cwd: temporaryDirectory, encoding: "utf8" },
    );
    assert.equal(invalidMode.status, 2);
    assert.match(invalidMode.stderr, /Unknown path set/);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("external link reachability is advisory to the release gate", () => {
  const ciWorkflow = readFileSync(
    join(repositoryRoot, ".github/workflows/ci.yml"),
    "utf8",
  );
  const advisoryStep = ciWorkflow.match(
    /- name: Check external Markdown links \(advisory\)([\s\S]*?)(?=\n  web:)/,
  );

  assert.ok(advisoryStep, "expected the advisory external-link step");
  assert.match(advisoryStep[1], /continue-on-error: true/);
  assert.match(advisoryStep[1], /fail: false/);
});

test("automatic releases call the shared release classifier", () => {
  const releaseWorkflow = readFileSync(
    join(repositoryRoot, ".github/workflows/release-ios.yml"),
    "utf8",
  );

  assert.match(
    releaseWorkflow,
    /has-ios-changes\.sh \\\n+\s+"\$base_sha" "\$RELEASE_SHA" --release-files/,
  );
});
