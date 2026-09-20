import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const computeIosBase = join(repositoryRoot, "scripts/ci/compute-ios-base.sh");

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function git(worktree, args) {
  return run("git", args, worktree).trim();
}

function writeCommit(worktree, relativePath, contents, message) {
  writeFileSync(join(worktree, relativePath), contents);
  git(worktree, ["add", relativePath]);
  git(worktree, ["commit", "-m", message]);
  return git(worktree, ["rev-parse", "HEAD"]);
}

function createRepository() {
  const directory = mkdtempSync(join(tmpdir(), "talent-signal-compute-ios-base-"));
  git(directory, ["init", "--initial-branch=main"]);
  git(directory, ["config", "user.name", "CI base test"]);
  git(directory, ["config", "user.email", "ci-base@example.invalid"]);

  const first = writeCommit(directory, "first.txt", "first\n", "First commit");
  const second = writeCommit(directory, "second.txt", "second\n", "Second commit");
  return { directory, first, second };
}

function withRepository(callback) {
  const repository = createRepository();
  try {
    callback(repository);
  } finally {
    rmSync(repository.directory, { recursive: true, force: true });
  }
}

function resolveBase(directory, args) {
  return run(computeIosBase, args, directory).trim();
}

test("pull_request returns the pull request base commit", () => {
  withRepository(({ directory, first, second }) => {
    const output = resolveBase(directory, [
      "--event",
      "pull_request",
      "--ref",
      "refs/heads/feature",
      "--base",
      first,
      "--head",
      second,
    ]);
    assert.equal(output, first);
  });
});

test("merge_group returns the merge queue base commit", () => {
  withRepository(({ directory, first, second }) => {
    const output = resolveBase(directory, [
      "--event",
      "merge_group",
      "--ref",
      "gh-readonly-queue/main",
      "--base",
      first,
      "--head",
      second,
    ]);
    assert.equal(output, first);
  });
});

test("workflow_dispatch returns the dispatched base commit", () => {
  withRepository(({ directory, first, second }) => {
    const output = resolveBase(directory, [
      "--event",
      "workflow_dispatch",
      "--ref",
      "refs/heads/main",
      "--base",
      first,
      "--head",
      second,
    ]);
    assert.equal(output, first);
  });
});

test("push to main resolves the trusted tag commit", () => {
  withRepository(({ directory, first, second }) => {
    git(directory, ["tag", "v0.1.0", first]);
    const output = resolveBase(directory, [
      "--event",
      "push",
      "--ref",
      "refs/heads/main",
      "--base",
      "",
      "--head",
      second,
      "--trusted-tag",
      "v0.1.0",
    ]);
    assert.equal(output, first);
  });
});

test("push to main without a trusted tag returns empty", () => {
  withRepository(({ directory, second }) => {
    const output = resolveBase(directory, [
      "--event",
      "push",
      "--ref",
      "refs/heads/main",
      "--base",
      "",
      "--head",
      second,
    ]);
    assert.equal(output, "");
  });
});

test("push to a non-main ref with a trusted tag returns empty", () => {
  withRepository(({ directory, first, second }) => {
    git(directory, ["tag", "v0.1.0", first]);
    const output = resolveBase(directory, [
      "--event",
      "push",
      "--ref",
      "refs/heads/other",
      "--base",
      "",
      "--head",
      second,
      "--trusted-tag",
      "v0.1.0",
    ]);
    assert.equal(output, "");
  });
});
