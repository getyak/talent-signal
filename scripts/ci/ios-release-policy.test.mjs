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
import {
  APP_GROUP,
  PROFILE_SPECS,
  validateProvisioningProfile,
} from "./manage-ios-signing-profiles.mjs";

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

test("iOS CI blocks on a bounded smoke suite and keeps full coverage explicit", () => {
  const ciWorkflow = readFileSync(
    join(repositoryRoot, ".github/workflows/ci.yml"),
    "utf8",
  );
  const iosJob = ciWorkflow.match(/  ios:\n([\s\S]*?)(?=\n  required:)/);

  assert.ok(iosJob, "expected the iOS CI job");
  assert.match(iosJob[1], /name: iOS release smoke/);
  assert.match(iosJob[1], /timeout-minutes: 30/);
  assert.match(
    iosJob[1],
    /IOS_UI_TEST_SCOPE: \$\{\{ inputs\.ios_test_scope \|\| 'smoke' \}\}/,
  );
  assert.match(ciWorkflow, /ios_test_scope:/);
  assert.match(ciWorkflow, /- smoke\n\s+- full/);

  const smokeTests = readFileSync(
    join(repositoryRoot, "scripts/ios/ci-smoke-tests.txt"),
    "utf8",
  )
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  assert.ok(smokeTests.length >= 5 && smokeTests.length <= 10);

  const uiSources = [
    "apps/ios/UITests/CandidateSignalUITests.swift",
    "apps/ios/UITests/StandaloneOnboardingUITests.swift",
  ].map((path) => readFileSync(join(repositoryRoot, path), "utf8"));
  for (const selector of smokeTests) {
    const method = selector.split("/").at(-1);
    assert.ok(
      uiSources.some((source) => source.includes(`func ${method}(`)),
      `expected smoke selector ${selector} to exist`,
    );
  }
});

test("automatic releases classify all changes since the last successful release", () => {
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
  assert.match(prepareJob[1], /repos\.listReleases/);
  assert.match(prepareJob[1], /latestRelease\.tag_name/);
  assert.match(prepareJob[1], /compareCommitsWithBasehead/);
  assert.doesNotMatch(prepareJob[1], /const parentSha/);
  assert.match(prepareJob[1], /"apps\/ios\/"/);
  assert.match(prepareJob[1], /"\.github\/workflows\/release-ios\.yml"/);
  assert.doesNotMatch(prepareJob[1], /actions\/checkout/);
  assert.doesNotMatch(prepareJob[1], /\.\/scripts\/ci\/has-ios-changes\.sh/);

  const ciWorkflow = readFileSync(
    join(repositoryRoot, ".github/workflows/ci.yml"),
    "utf8",
  );
  assert.match(ciWorkflow, /--merged "\$HEAD_SHA" --sort=-v:refname/);
  assert.match(ciWorkflow, /grep -E '\^v\[0-9\]\+/);
  assert.match(ciWorkflow, /Checking unreleased iOS changes since/);

  assert.match(releaseWorkflow, /TALENT_SIGNAL_API_BASE_URL/);
  assert.match(releaseWorkflow, /probe-auth-backend\.mjs/);
  assert.match(releaseWorkflow, /tailscale ping --c 3/);
  assert.match(releaseWorkflow, /for attempt in 1 2 3/);
  assert.match(releaseWorkflow, /failed three bounded probes/);
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
  assert.doesNotMatch(releaseWorkflow, /Load legacy GitHub secrets/);
  assert.doesNotMatch(releaseWorkflow, /secrets\.APP_STORE_CONNECT/);
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
  assert.match(
    releaseWorkflow,
    /Infisical\/secrets-action@03d3fa38607956c493f53c6633f94006a13c47ae # v1\.0\.7/,
  );
  assert.match(releaseWorkflow, /method: oidc/);
  assert.match(releaseWorkflow, /secret-path: \/release/);
  assert.match(
    releaseWorkflow,
    /oidc-audience: infisical:\/\/talent-signal\/testflight/,
  );
  assert.match(
    releaseWorkflow,
    /if: vars\.INFISICAL_TESTFLIGHT_IDENTITY_ID == ''/,
  );
});

test("Swift CodeQL runs after merge without extending pull-request latency", () => {
  const securityWorkflow = readFileSync(
    join(repositoryRoot, ".github/workflows/security.yml"),
    "utf8",
  );
  const swiftJob = securityWorkflow.match(
    /  codeql-swift:\n([\s\S]*?)(?=\n  required:)/,
  );

  assert.ok(swiftJob, "expected the Swift CodeQL job");
  assert.match(swiftJob[1], /github\.event_name != 'pull_request'/);
  assert.match(securityWorkflow, /schedule:\n\s+- cron:/);
  assert.match(securityWorkflow, /workflow_dispatch:/);
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
  assert.match(fastfile, /APP_IDENTIFIER = "com\.talentsignal\.app"/);
  assert.match(
    fastfile,
    /SHARE_EXTENSION_IDENTIFIER = "com\.talentsignal\.app\.share"/,
  );
  assert.match(
    fastfile,
    /LIVE_ACTIVITY_IDENTIFIER = "com\.talentsignal\.app\.live-activity"/,
  );
  assert.match(
    fastfile,
    /lane :prepare_signing do[\s\S]*?app_identifier: APP_IDENTIFIERS[\s\S]*?force: true,[\s\S]*?readonly: false/,
  );
  assert.match(
    fastfile,
    /lane :beta do[\s\S]*?app_identifier: APP_IDENTIFIERS[\s\S]*?readonly: true/,
  );
  assert.match(
    fastfile,
    /SHARE_EXTENSION_IDENTIFIER => "match AppStore #\{SHARE_EXTENSION_IDENTIFIER\}"/,
  );
  assert.match(
    fastfile,
    /LIVE_ACTIVITY_IDENTIFIER => "match AppStore #\{LIVE_ACTIVITY_IDENTIFIER\}"/,
  );
});

test("all shipped targets pin their App Store profiles in Release", () => {
  const project = readFileSync(
    join(repositoryRoot, "apps/ios/TalentSignal.xcodeproj/project.pbxproj"),
    "utf8",
  );
  const releaseConfigurations = Array.from(
    project.matchAll(
      /\/\* Release \*\/ = \{\n\s+isa = XCBuildConfiguration;\n(?:\s+baseConfigurationReference = [^\n]+;\n)?\s+buildSettings = \{([\s\S]*?)\n\s+\};\n\s+name = Release;\n\s+\};/g,
    ),
    (match) => match[1],
  );

  for (const bundleIdentifier of [
    "com.talentsignal.app",
    "com.talentsignal.app.share",
    "com.talentsignal.app.live-activity",
  ]) {
    const configuration = releaseConfigurations.find((candidate) =>
      candidate.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${
        bundleIdentifier.includes("-")
          ? `"${bundleIdentifier}"`
          : bundleIdentifier
      };`),
    );

    assert.ok(
      configuration,
      `expected Release settings for ${bundleIdentifier}`,
    );
    assert.match(configuration, /CODE_SIGN_STYLE = Manual;/);
    assert.match(
      configuration,
      /CODE_SIGN_IDENTITY = "iPhone Distribution: Xiong Xinwei \(6RG2F8YY59\)";/,
    );
    assert.ok(
      configuration.includes(
        `PROVISIONING_PROFILE_SPECIFIER = "match AppStore ${bundleIdentifier}";`,
      ),
      `expected the App Store profile for ${bundleIdentifier}`,
    );
  }
});

test("generated extension signing stays represented in the project specification", () => {
  const projectSpecification = readFileSync(
    join(repositoryRoot, "apps/ios/project.yml"),
    "utf8",
  );

  for (const bundleIdentifier of [
    "com.talentsignal.app.share",
    "com.talentsignal.app.live-activity",
  ]) {
    assert.match(
      projectSpecification,
      new RegExp(
        `PRODUCT_BUNDLE_IDENTIFIER: ${bundleIdentifier.replaceAll(".", "\\.")}` +
          `[\\s\\S]*?Release:[\\s\\S]*?CODE_SIGN_STYLE: Manual` +
          `[\\s\\S]*?PROVISIONING_PROFILE_SPECIFIER: match AppStore ${bundleIdentifier.replaceAll(".", "\\.")}`,
      ),
    );
  }
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
  assert.match(refreshWorkflow, /fastlane ios prepare_signing/);
  assert.match(refreshWorkflow, /manage-ios-signing-profiles\.mjs rotate --confirm-rotation/);
  assert.match(refreshWorkflow, /manage-ios-signing-profiles\.mjs verify/);
  assert.match(refreshWorkflow, /The encrypted signing repository was not updated/);
  assert.doesNotMatch(refreshWorkflow, /MATCH_FORCE/);
  assert.doesNotMatch(refreshWorkflow, /match nuke/);
  assert.doesNotMatch(refreshWorkflow, /fastlane ios beta/);
  assert.match(refreshWorkflow, /Remove temporary signing material/);
  assert.match(refreshWorkflow, /id-token: write/);
  assert.match(
    refreshWorkflow,
    /Infisical\/secrets-action@03d3fa38607956c493f53c6633f94006a13c47ae # v1\.0\.7/,
  );
});

test("TestFlight access uses the same Infisical OIDC boundary", () => {
  const accessWorkflow = readFileSync(
    join(repositoryRoot, ".github/workflows/testflight-access.yml"),
    "utf8",
  );

  assert.match(accessWorkflow, /id-token: write/);
  assert.match(
    accessWorkflow,
    /Infisical\/secrets-action@03d3fa38607956c493f53c6633f94006a13c47ae # v1\.0\.7/,
  );
  assert.match(accessWorkflow, /env-slug: staging/);
  assert.match(accessWorkflow, /secret-path: \/release/);
});

test("profile verification requires the shared App Group and main-app Apple sign-in", () => {
  assert.deepEqual(PROFILE_SPECS.map((profile) => profile.bundleId), [
    "com.talentsignal.app",
    "com.talentsignal.app.share",
    "com.talentsignal.app.live-activity",
  ]);
  for (const spec of PROFILE_SPECS) {
    const entitlements = {
      "application-identifier": `6RG2F8YY59.${spec.bundleId}`,
      "com.apple.security.application-groups": [APP_GROUP],
    };
    if (spec.signInWithApple) entitlements["com.apple.developer.applesignin"] = ["Default"];
    validateProvisioningProfile({ Name: spec.name, Entitlements: entitlements }, spec);
    assert.throws(
      () => validateProvisioningProfile({ Name: spec.name, Entitlements: { ...entitlements, "com.apple.security.application-groups": [] } }, spec),
      /lacks group\.com\.talentsignal\.app/,
    );
  }
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
  assert.doesNotMatch(accessWorkflow, /Load legacy GitHub secrets/);
  assert.doesNotMatch(accessWorkflow, /secrets\.APP_STORE_CONNECT/);
  assert.match(
    accessWorkflow,
    /API_KEY_CONTENT: \$\{\{ env\.APP_STORE_CONNECT_API_KEY_CONTENT \}\}/,
  );
});
