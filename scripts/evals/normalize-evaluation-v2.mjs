import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const evaluationRoot = resolve(workspaceRoot, "evals/v2");
const scenarioDirectory = resolve(evaluationRoot, "scenarios");
const suiteDirectory = resolve(evaluationRoot, "suites");

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex")}`;
}

function withoutDigest(value) {
  const { contentDigest: _contentDigest, ...content } = value;
  return content;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const p0SuitePath = resolve(suiteDirectory, "p0-release.v1.json");
const p0SuiteBefore = await readJson(p0SuitePath);
const p0Ids = new Set(p0SuiteBefore.scenarios.map((item) => item.scenarioId));
const searchCompatibleIds = new Set(["TS-TRJ-002", "TS-TRJ-003", "TS-TRJ-004", "TS-TRJ-008"]);
const scenarioNames = (await readdir(scenarioDirectory)).filter((name) => name.endsWith(".json")).sort();
const scenarios = [];

for (const name of scenarioNames) {
  const path = resolve(scenarioDirectory, name);
  const scenario = await readJson(path);
  const defaultProfileId = scenario.slices.defaultProfileId;
  const compatibleProfileIds = [defaultProfileId, "model-replay-v1"];
  if (searchCompatibleIds.has(scenario.scenarioId)) compatibleProfileIds.push("search-integration-probe-v1");
  scenario.compatibleProfileIds = [...new Set(compatibleProfileIds)];
  scenario.criterionAdjudications = [];
  scenario.adjudication = "unreviewed";
  if (p0Ids.has(scenario.scenarioId)) scenario.partition = "p0";
  scenario.evaluatorBindings = scenario.evaluatorBindings.map((binding) =>
    binding.kind === "human" && p0Ids.has(scenario.scenarioId)
      ? { ...binding, requiredForGate: true }
      : binding);
  scenario.contentDigest = digest(withoutDigest(scenario));
  scenarios.push(scenario);
  await writeJson(path, scenario);
}

const byId = new Map(scenarios.map((scenario) => [scenario.scenarioId, scenario]));
const suiteNames = (await readdir(suiteDirectory)).filter((name) => name.endsWith(".json")).sort();
for (const name of suiteNames) {
  const path = resolve(suiteDirectory, name);
  const suite = await readJson(path);
  suite.scenarios = suite.scenarios.map((registration) => {
    const scenario = byId.get(registration.scenarioId);
    if (!scenario) throw new Error(`Unknown Scenario registration ${registration.scenarioId}`);
    return {
      scenarioId: scenario.scenarioId,
      revision: scenario.revision,
      contentDigest: scenario.contentDigest,
      lifecycle: scenario.lifecycle,
      adjudication: scenario.adjudication,
      criterionAdjudicationDigest: digest(scenario.criterionAdjudications),
      partition: scenario.partition,
      dataClass: scenario.dataPolicy.dataClass,
    };
  });
  suite.contentDigest = digest(withoutDigest(suite));
  await writeJson(path, suite);
}

process.stdout.write(`normalized ${scenarios.length} scenarios and ${suiteNames.length} suites\n`);
