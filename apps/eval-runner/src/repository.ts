import { readFile, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import {
  assertValidMaterializedScenario,
  assertValidProfile,
  assertValidScenarioDocument,
  assertValidSuite,
  materializeScenario,
  digestCriterionAdjudications,
  scanPartitionContamination,
  type PartitionContaminationFindingV1,
  type EvaluationExecutionProfileV1,
  type EvaluationScenarioDocumentV1,
  type EvaluationScenarioV1,
  type EvaluationSuiteV1,
  type FixtureReferenceV1,
} from "@talent-signal/evaluation";

export interface EvaluationRepositorySnapshotV1 {
  rootDirectory: string;
  suites: EvaluationSuiteV1[];
  profiles: EvaluationExecutionProfileV1[];
  scenarios: EvaluationScenarioV1[];
  contaminationFindings: PartitionContaminationFindingV1[];
}

export interface RepositoryValidationFindingV1 {
  path: string;
  status: "valid" | "invalid";
  reason?: string;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function jsonFiles(directory: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  return names.filter((name) => name.endsWith(".json")).sort().map((name) => resolve(directory, name));
}

function resolveFixturePath(rootDirectory: string, reference: FixtureReferenceV1): string {
  if (isAbsolute(reference.path)) {
    throw new Error(`Fixture paths must be repository-relative: ${reference.path}`);
  }
  const target = resolve(rootDirectory, reference.path);
  const outside = relative(rootDirectory, target);
  if (outside.startsWith("..") || isAbsolute(outside)) {
    throw new Error(`Fixture path escapes evaluation root: ${reference.path}`);
  }
  return target;
}

export async function loadEvaluationRepository(
  evaluationRootDirectory: string,
  fixtureRootDirectory = resolve(evaluationRootDirectory, "../.."),
): Promise<EvaluationRepositorySnapshotV1> {
  const root = resolve(evaluationRootDirectory);
  const fixtureRoot = resolve(fixtureRootDirectory);
  const [suiteFiles, profileFiles, scenarioFiles] = await Promise.all([
    jsonFiles(resolve(root, "suites")),
    jsonFiles(resolve(root, "profiles")),
    jsonFiles(resolve(root, "scenarios")),
  ]);
  const suites = await Promise.all(
    suiteFiles.map(async (path) => {
      const parsed = await readJson(path);
      if (!hasSchemaVersion(parsed, "evaluation-suite.v1")) return null;
      const document = parsed as unknown as EvaluationSuiteV1;
      assertValidSuite(document);
      return document;
    }),
  ).then((items) => items.filter((item): item is EvaluationSuiteV1 => item !== null));
  const profiles = await Promise.all(
    profileFiles.map(async (path) => {
      const parsed = await readJson(path);
      if (!hasSchemaVersion(parsed, "evaluation-profile.v1")) return null;
      const document = parsed as unknown as EvaluationExecutionProfileV1;
      assertValidProfile(document);
      return document;
    }),
  ).then((items) => items.filter((item): item is EvaluationExecutionProfileV1 => item !== null));
  const scenarios = await Promise.all(
    scenarioFiles.map(async (path) => {
      const parsed = await readJson(path);
      if (!hasSchemaVersion(parsed, "evaluation-scenario.v1")) return null;
      const document = parsed as unknown as EvaluationScenarioDocumentV1;
      assertValidScenarioDocument(document);
      const scenario = await materializeScenario(document, {
        readModelInput: async (reference) => readJson(resolveFixturePath(fixtureRoot, reference)),
        readInitialState: async (reference) => readJson(resolveFixturePath(fixtureRoot, reference)),
        readOracle: async (reference) => readJson(resolveFixturePath(fixtureRoot, reference)),
      });
      assertValidMaterializedScenario(scenario);
      return scenario;
    }),
  ).then((items) => items.filter((item): item is EvaluationScenarioV1 => item !== null));
  const profileIds = new Set(profiles.map((profile) => profile.profileId));
  const suiteIds = new Set(suites.map((suite) => suite.suiteId));
  const scenariosByKey = new Map(
    scenarios.map((scenario) => [`${scenario.scenarioId}@${scenario.revision}`, scenario]),
  );
  const integrityIssues: string[] = [];
  for (const scenario of scenarios) {
    for (const profileId of scenario.compatibleProfileIds) {
      if (!profileIds.has(profileId)) {
        integrityIssues.push(`${scenario.scenarioId} references missing compatible profile ${profileId}`);
      }
    }
    for (const suiteId of scenario.suiteIds) {
      if (!suiteIds.has(suiteId)) integrityIssues.push(`${scenario.scenarioId} references missing suite ${suiteId}`);
    }
  }
  for (const suite of suites) {
    for (const registration of suite.scenarios) {
      const scenario = scenariosByKey.get(`${registration.scenarioId}@${registration.revision}`);
      if (!scenario) {
        integrityIssues.push(`${suite.suiteId} references missing scenario ${registration.scenarioId}@${registration.revision}`);
        continue;
      }
      if (
        registration.contentDigest !== scenario.contentDigest ||
        registration.criterionAdjudicationDigest !==
          digestCriterionAdjudications(scenario.criterionAdjudications) ||
        registration.lifecycle !== scenario.lifecycle ||
        registration.adjudication !== scenario.adjudication ||
        registration.partition !== scenario.partition ||
        registration.dataClass !== scenario.dataPolicy.dataClass
      ) {
        integrityIssues.push(`${suite.suiteId} registration is stale for ${scenario.scenarioId}@${scenario.revision}`);
      }
      if (suite.suiteId === "p0-release" && registration.partition !== "p0") {
        integrityIssues.push(`p0-release contains non-P0 partition scenario ${scenario.scenarioId}`);
      }
      if (!scenario.suiteIds.includes(suite.suiteId)) {
        integrityIssues.push(`${suite.suiteId} registration is absent from ${scenario.scenarioId}.suiteIds`);
      }
    }
  }
  if (integrityIssues.length > 0) {
    throw new Error(`Evaluation repository integrity failed: ${integrityIssues.join("; ")}`);
  }
  const contaminationFindings = scanPartitionContamination(scenarios);
  if (contaminationFindings.length > 0) {
    throw new Error(`Evaluation partition contamination detected: ${JSON.stringify(contaminationFindings)}`);
  }
  return { rootDirectory: root, suites, profiles, scenarios, contaminationFindings };
}

function hasSchemaVersion(value: unknown, schemaVersion: string): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).schemaVersion === schemaVersion,
  );
}

export function findScenario(
  repository: EvaluationRepositorySnapshotV1,
  scenarioId: string,
): EvaluationScenarioV1 {
  const matches = repository.scenarios.filter((scenario) => scenario.scenarioId === scenarioId);
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `Unknown evaluation scenario: ${scenarioId}`
        : `Ambiguous evaluation scenario revision: ${scenarioId}`,
    );
  }
  return matches[0]!;
}

export function findProfile(
  repository: EvaluationRepositorySnapshotV1,
  profileId: string,
): EvaluationExecutionProfileV1 {
  const matches = repository.profiles.filter((profile) => profile.profileId === profileId);
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `Unknown evaluation profile: ${profileId}`
        : `Ambiguous evaluation profile version: ${profileId}`,
    );
  }
  return matches[0]!;
}

export function findSuite(
  repository: EvaluationRepositorySnapshotV1,
  suiteId: string,
): EvaluationSuiteV1 {
  const matches = repository.suites.filter((suite) => suite.suiteId === suiteId);
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `Unknown evaluation suite: ${suiteId}`
        : `Ambiguous evaluation suite version: ${suiteId}`,
    );
  }
  return matches[0]!;
}

export function safeScenarioSummary(scenario: EvaluationScenarioV1) {
  return {
    schemaVersion: scenario.schemaVersion,
    scenarioId: scenario.scenarioId,
    revision: scenario.revision,
    contentDigest: scenario.contentDigest,
    title: scenario.title,
    purpose: scenario.purpose,
    suiteIds: scenario.suiteIds,
    riskTier: scenario.riskTier,
    lifecycle: scenario.lifecycle,
    adjudication: scenario.adjudication,
    partition: scenario.partition,
    dataPolicy: scenario.dataPolicy,
    modelInputRef: scenario.modelInputRef,
    initialStateRef: scenario.initialStateRef,
    oracleRef: {
      fixtureId: scenario.oracleRef.fixtureId,
      path: "[oracle hidden]",
      contentDigest: scenario.oracleRef.contentDigest,
    },
    slices: scenario.slices,
    lineage: scenario.lineage,
  };
}
