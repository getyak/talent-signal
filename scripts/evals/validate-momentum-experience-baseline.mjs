import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const bundleRoot = path.resolve(
  repositoryRoot,
  process.argv[2] ??
    "docs/evaluations/2026-09-01-momentum-experience-v2-baseline",
);

const requiredScenarioIDs = [
  "TS-CORE-01",
  "TS-CORE-02",
  "TS-CORE-03",
  "TS-CORE-04",
  "TS-CORE-05",
  "TS-CORE-06",
  "TS-ID-01",
  "TS-ID-02",
  "TS-ID-03",
  "TS-ID-04",
  "TS-ACT-01",
  "TS-ACT-02",
  "TS-ACT-03",
  "TS-ACT-04",
  "TS-UX-01",
  "TS-UX-02",
  "TS-UX-03",
  "TS-UX-04",
  "TS-BOUND-01",
];

async function readJson(name) {
  const absolutePath = path.join(bundleRoot, name);
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

function nonEmptyString(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert(value.trim().length > 0, `${label} must not be empty`);
}

function repositoryRelative(locator, label) {
  nonEmptyString(locator, label);
  assert(!path.isAbsolute(locator), `${label} must be repository-relative`);
  const resolved = path.resolve(repositoryRoot, locator);
  assert(
    resolved === repositoryRoot || resolved.startsWith(`${repositoryRoot}${path.sep}`),
    `${label} escapes the repository`,
  );
  return resolved;
}

async function sha256File(absolutePath) {
  const digest = createHash("sha256");
  digest.update(await readFile(absolutePath));
  return digest.digest("hex");
}

async function validateEvidenceEntry(entry, index) {
  const label = `manifest.evidenceBundle[${index}]`;
  nonEmptyString(entry.id, `${label}.id`);
  assert(
    ["observed", "unavailable", "not_run"].includes(entry.status),
    `${label}.status is invalid`,
  );
  nonEmptyString(entry.claimBoundary, `${label}.claimBoundary`);
  if (entry.status === "observed") {
    const absolutePath = repositoryRelative(entry.locator, `${label}.locator`);
    assert((await stat(absolutePath)).isFile(), `${label}.locator is not a file`);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/, `${label}.sha256 is invalid`);
    assert.equal(
      await sha256File(absolutePath),
      entry.sha256,
      `${label}.sha256 does not match ${entry.locator}`,
    );
  } else {
    assert.equal(entry.locator, null, `${label}.locator must be null when not observed`);
    assert.equal(entry.sha256, null, `${label}.sha256 must be null when not observed`);
    nonEmptyString(entry.reason, `${label}.reason`);
    nonEmptyString(entry.nextProof, `${label}.nextProof`);
  }
}

const manifest = await readJson("manifest.json");
const metrics = await readJson("metric-dictionary.json");
const comparison = await readJson("comparison-rule.json");
const scenarios = await readJson("scenario-bank.json");
await readFile(path.join(bundleRoot, "README.md"), "utf8");

assert.equal(manifest.schemaVersion, "momentum-baseline-manifest.v1");
nonEmptyString(manifest.artifactId, "manifest.artifactId");
nonEmptyString(manifest.version, "manifest.version");
assert.match(manifest.frozenAt, /^\d{4}-\d{2}-\d{2}T/);
assert.equal(manifest.dataClassification, "synthetic_only");
assert.equal(manifest.productBehaviorChanged, false);
assert.equal(manifest.xctestDurationUsedAsProductLatency, false);
assert.equal(manifest.freeze.gitHead.length, 40);
assert.match(manifest.freeze.worktreeStatusSha256, /^[a-f0-9]{64}$/);
assert.match(manifest.freeze.trackedDiffSha256, /^[a-f0-9]{64}$/);
assert.match(manifest.freeze.untrackedInventorySha256, /^[a-f0-9]{64}$/);
assert.equal(manifest.environment.iosDevice.kind, "simulator");
assert.equal(manifest.environment.physicalIOSDeviceAvailable, false);
assert.equal(manifest.comparators.ailoha.directBuildAvailable, false);
nonEmptyString(manifest.comparators.ailoha.unavailabilityReason, "Ailoha unavailability reason");
assert.equal(manifest.comparators.manualFallback.syntheticProtocolOnly, true);
assert(Array.isArray(manifest.evidenceBundle) && manifest.evidenceBundle.length > 0);
await Promise.all(manifest.evidenceBundle.map(validateEvidenceEntry));

assert.equal(metrics.schemaVersion, "momentum-metric-dictionary.v1");
assert.equal(metrics.artifactId, manifest.artifactId);
assert(Array.isArray(metrics.measures) && metrics.measures.length >= 15);
const metricIDs = new Set();
for (const [index, metric] of metrics.measures.entries()) {
  const label = `metric[${index}]`;
  nonEmptyString(metric.id, `${label}.id`);
  assert(!metricIDs.has(metric.id), `duplicate metric id ${metric.id}`);
  metricIDs.add(metric.id);
  nonEmptyString(metric.construct, `${label}.construct`);
  nonEmptyString(metric.unit, `${label}.unit`);
  nonEmptyString(metric.startEvent, `${label}.startEvent`);
  nonEmptyString(metric.stopEvent, `${label}.stopEvent`);
  nonEmptyString(metric.device, `${label}.device`);
  nonEmptyString(metric.evidence, `${label}.evidence`);
  nonEmptyString(metric.aggregation, `${label}.aggregation`);
  nonEmptyString(metric.direction, `${label}.direction`);
  assert(["measured", "not_measured"].includes(metric.status), `${label}.status is invalid`);
  if (metric.status === "measured") {
    assert.notEqual(metric.value, null, `${label}.value is required when measured`);
  } else {
    assert.equal(metric.value, null, `${label}.value must be null when not measured`);
    nonEmptyString(metric.missingReason, `${label}.missingReason`);
    nonEmptyString(metric.nextProof, `${label}.nextProof`);
  }
  if (metric.construct === "latency") {
    assert.notEqual(
      metric.evidenceType,
      "xctest_duration",
      `${label} improperly uses XCTest duration as product latency evidence`,
    );
  }
}

assert.equal(comparison.schemaVersion, "momentum-comparison-rule.v1");
assert.equal(comparison.artifactId, manifest.artifactId);
assert.equal(comparison.frozenBeforeRedesignResults, true);
assert.equal(comparison.redesignResultsObserved, false);
assert(Date.parse(comparison.frozenAt) <= Date.parse(manifest.frozenAt));
assert.equal(comparison.overallRule.operator, "all");
assert(Array.isArray(comparison.primaryMeasureIds));
for (const id of comparison.primaryMeasureIds) {
  assert(metricIDs.has(id), `comparison rule references unknown metric ${id}`);
}
assert(comparison.primaryMeasureIds.length >= 3);
assert.equal(comparison.safetyRule.allowedBlockerErrors, 0);
assert.equal(comparison.safetyRule.aggregateMayHideBlocker, false);
assert.equal(comparison.comparators.length, 3);
assert.deepEqual(
  comparison.comparators.map((item) => item.id).sort(),
  ["ailoha", "manual_fallback", "talent_signal_baseline"],
);

assert.equal(scenarios.schemaVersion, "momentum-scenario-bank.v1");
assert.equal(scenarios.artifactId, manifest.artifactId);
assert.equal(scenarios.dataClassification, "synthetic_only");
assert(Array.isArray(scenarios.scenarios));
assert.deepEqual(
  scenarios.scenarios.map((scenario) => scenario.id).sort(),
  [...requiredScenarioIDs].sort(),
  "scenario bank must contain every required scenario exactly once",
);
for (const [index, scenario] of scenarios.scenarios.entries()) {
  const label = `scenario[${index}]`;
  nonEmptyString(scenario.title, `${label}.title`);
  nonEmptyString(scenario.syntheticFixture, `${label}.syntheticFixture`);
  nonEmptyString(scenario.expectedGate, `${label}.expectedGate`);
  assert(
    ["observed_pass", "observed_fail", "observed_gap", "not_run"].includes(
      scenario.baselineStatus,
    ),
    `${label}.baselineStatus is invalid`,
  );
  nonEmptyString(scenario.executionSurface, `${label}.executionSurface`);
  assert(Array.isArray(scenario.evidence) && scenario.evidence.length > 0);
  if (scenario.baselineStatus === "not_run" || scenario.baselineStatus === "observed_gap") {
    nonEmptyString(scenario.exactGap, `${label}.exactGap`);
    nonEmptyString(scenario.nextProof, `${label}.nextProof`);
  }
}

const serialized = JSON.stringify({ manifest, metrics, comparison, scenarios });
assert(
  !serialized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i),
  "baseline bundle must not contain email addresses",
);
assert(
  !serialized.includes("/Users/"),
  "baseline bundle must not contain absolute user paths",
);

console.log(
  `Momentum Experience MX-00 baseline contract passed: ${scenarios.scenarios.length} scenarios, ` +
    `${metrics.measures.length} measures, ${manifest.evidenceBundle.length} evidence entries.`,
);
