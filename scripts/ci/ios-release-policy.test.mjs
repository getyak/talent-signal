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

test("automatic releases classify the verified default-branch tip without executing repository code", () => {
  const releaseWorkflow = readFileSync(
    join(repositoryRoot, ".github/workflows/release-ios.yml"),
    "utf8",
  );
  const prepareJob = releaseWorkflow.match(
    /  prepare:\n([\s\S]*?)(?=\n  testflight:)/,
  );

  assert.ok(prepareJob, "expected the release preparation job");
  assert.match(prepareJob[1], /actions\/github-script@[0-9a-f]{40} # v8/);
  assert.match(prepareJob[1], /process\.env\.VERIFIED_SHA !== releaseSha/);
  assert.match(prepareJob[1], /compareCommitsWithBasehead/);
  assert.match(prepareJob[1], /"apps\/ios\/"/);
  assert.match(prepareJob[1], /"\.github\/workflows\/release-ios\.yml"/);
  assert.doesNotMatch(prepareJob[1], /actions\/checkout/);
  assert.doesNotMatch(prepareJob[1], /\.\/scripts\/ci\/has-ios-changes\.sh/);

  assert.match(
    releaseWorkflow,
    /TALENT_SIGNAL_API_BASE_URL: \$\{\{ vars\.TALENT_SIGNAL_API_BASE_URL \}\}/,
  );
  assert.match(releaseWorkflow, /probe-auth-backend\.mjs/);
  assert.match(
    releaseWorkflow,
    /tailscale\/github-action@[0-9a-f]{40} # v4\.1\.3/,
  );
  assert.match(
    releaseWorkflow,
    /Infisical\/secrets-action@03d3fa38607956c493f53c6633f94006a13c47ae # v1\.0\.7/,
  );
  assert.match(releaseWorkflow, /method: oidc/);
  assert.match(
    releaseWorkflow,
    /oidc-audience: infisical:\/\/talent-signal\/testflight/,
  );
  assert.match(releaseWorkflow, /secret-path: \/release/);
  assert.match(
    releaseWorkflow,
    /if: vars\.INFISICAL_TESTFLIGHT_IDENTITY_ID == ''/,
  );
  assert.match(
    releaseWorkflow,
    /oauth-client-id: \$\{\{ env\.TS_OAUTH_CLIENT_ID \}\}/,
  );
  assert.match(
    releaseWorkflow,
    /oauth-secret: \$\{\{ env\.TS_OAUTH_SECRET \}\}/,
  );
  assert.match(releaseWorkflow, /TS_OAUTH_CLIENT_ID/);
  assert.match(releaseWorkflow, /TS_OAUTH_SECRET/);
  assert.match(releaseWorkflow, /tags: tag:ci/);
  assert.match(releaseWorkflow, /tailscale ping/);
  assert.doesNotMatch(
    releaseWorkflow,
    /TALENT_SIGNAL_API_BASE_URL: \$\{\{ secrets\./,
  );
});

test("manual Fastlane builds require the same Release environment", () => {
  const fastfile = readFileSync(join(repositoryRoot, "fastlane/Fastfile"), "utf8");

  assert.match(fastfile, /configure-build-environment\.mjs/);
  assert.match(
    fastfile,
    /lane :build_only do\n\s+configure_ios_environment\("Release"\)/,
  );
  assert.match(
    fastfile,
    /lane :beta do[\s\S]*?configure_ios_environment\("Release"\)/,
  );
});

test("signing refresh is explicit, entitlement-checked, and separately authorized", () => {
  const refreshWorkflow = readFileSync(
    join(repositoryRoot, ".github/workflows/refresh-ios-signing.yml"),
    "utf8",
  );

  assert.match(refreshWorkflow, /workflow_dispatch:/);
  assert.doesNotMatch(refreshWorkflow, /workflow_run:/);
  assert.match(refreshWorkflow, /confirm_profile_refresh:/);
  assert.match(refreshWorkflow, /environment:\n\s+name: testflight/);
  assert.match(refreshWorkflow, /id-token: write/);
  assert.match(
    refreshWorkflow,
    /Infisical\/secrets-action@03d3fa38607956c493f53c6633f94006a13c47ae # v1\.0\.7/,
  );
  assert.match(refreshWorkflow, /secret-path: \/release/);
  assert.match(refreshWorkflow, /MATCH_MAINTENANCE_DEPLOY_KEY/);
  assert.match(refreshWorkflow, /fastlane run sigh/);
  assert.match(refreshWorkflow, /readonly:true/);
  assert.match(refreshWorkflow, /sync-refreshed-ios-profile\.rb/);
  assert.doesNotMatch(refreshWorkflow, /MATCH_FORCE/);
  assert.doesNotMatch(refreshWorkflow, /fastlane ios prepare_signing/);
  assert.doesNotMatch(refreshWorkflow, /fastlane ios beta/);
  assert.match(refreshWorkflow, /Remove temporary signing material/);
});

test("TestFlight access uses the release-scoped Infisical OIDC identity", () => {
  const accessWorkflow = readFileSync(
    join(repositoryRoot, ".github/workflows/testflight-access.yml"),
    "utf8",
  );

  assert.match(accessWorkflow, /id-token: write/);
  assert.match(accessWorkflow, /environment:\n\s+name: testflight/);
  assert.match(
    accessWorkflow,
    /Infisical\/secrets-action@03d3fa38607956c493f53c6633f94006a13c47ae # v1\.0\.7/,
  );
  assert.match(accessWorkflow, /method: oidc/);
  assert.match(
    accessWorkflow,
    /identity-id: \$\{\{ vars\.INFISICAL_TESTFLIGHT_IDENTITY_ID \}\}/,
  );
  assert.match(accessWorkflow, /secret-path: \/release/);
  assert.match(
    accessWorkflow,
    /API_KEY_CONTENT: \$\{\{ env\.APP_STORE_CONNECT_API_KEY_CONTENT \}\}/,
  );
});
