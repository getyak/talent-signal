#!/usr/bin/env node

const { writeFileSync } = require("node:fs");

const AUTOMATION_ACTOR = "github-actions[bot]";
const IPA_ASSET = "TalentSignal.ipa";
const RECEIPT_ASSET = "testflight-release-receipt.json";
const SEMANTIC_RELEASE_TAG = /^v\d+\.\d+\.\d+$/;

function isTrustedTestFlightRelease(release) {
  if (
    !release ||
    release.draft ||
    !SEMANTIC_RELEASE_TAG.test(release.tag_name ?? "") ||
    release.author?.login !== AUTOMATION_ACTOR
  ) {
    return false;
  }

  const assetNames = new Set(
    (release.assets ?? []).map(({ name }) => name).filter(Boolean),
  );
  return assetNames.has(IPA_ASSET) && assetNames.has(RECEIPT_ASSET);
}

function selectLatestTestFlightRelease(releases) {
  return (releases ?? []).find(isTrustedTestFlightRelease);
}

function buildTestFlightReleaseReceipt({
  buildNumber,
  commitSha,
  processedAt,
  releaseTag,
  releaseVersion,
  workflowRunUrl,
}) {
  const fields = {
    buildNumber,
    commitSha,
    processedAt,
    releaseTag,
    releaseVersion,
    workflowRunUrl,
  };
  for (const [name, value] of Object.entries(fields)) {
    if (!value) throw new Error(`Missing TestFlight receipt field: ${name}`);
  }

  if (!SEMANTIC_RELEASE_TAG.test(releaseTag)) {
    throw new Error(`Invalid TestFlight receipt release tag: ${releaseTag}`);
  }
  if (releaseTag !== `v${releaseVersion}`) {
    throw new Error("TestFlight receipt version does not match its release tag");
  }

  return {
    schemaVersion: 1,
    app: {
      bundleId: "com.talentsignal.app",
      ipaAsset: IPA_ASSET,
    },
    release: {
      buildNumber,
      commitSha,
      processedAt,
      tag: releaseTag,
      testflightState: "processed",
      version: releaseVersion,
      workflowRunUrl,
    },
  };
}

function writeReceiptFromEnvironment(outputPath, environment = process.env) {
  if (!outputPath) throw new Error("A TestFlight receipt output path is required");

  const receipt = buildTestFlightReleaseReceipt({
    buildNumber: environment.BUILD_NUMBER,
    commitSha: environment.RELEASE_SHA,
    processedAt: environment.PROCESSED_AT,
    releaseTag: environment.RELEASE_TAG,
    releaseVersion: environment.RELEASE_VERSION,
    workflowRunUrl: environment.WORKFLOW_RUN_URL,
  });
  writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    mode: 0o600,
  });
}

if (require.main === module) {
  writeReceiptFromEnvironment(process.argv[2]);
}

module.exports = {
  AUTOMATION_ACTOR,
  IPA_ASSET,
  RECEIPT_ASSET,
  buildTestFlightReleaseReceipt,
  isTrustedTestFlightRelease,
  selectLatestTestFlightRelease,
  writeReceiptFromEnvironment,
};
