import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import type {
  EvaluationExecutionProfileV1,
  EvaluationScenarioDocumentV1,
  EvaluationScenarioV1,
  EvaluationSuiteV1,
  FixtureReferenceV1,
  JsonValue,
} from "./contracts.js";
import { canonicalizeJson } from "./canonicalJson.js";
import { digestCriterionAdjudications } from "./adjudication.js";
import { assertValidProfile, assertValidScenarioDocument, assertValidSuite, materializeScenario } from "./validate.js";
import type { ScenarioMaterializationResolver } from "./validate.js";

export interface ScenarioRegistryFilter {
  suiteId?: string;
  lifecycle?: EvaluationScenarioDocumentV1["lifecycle"];
  adjudication?: EvaluationScenarioDocumentV1["adjudication"];
  partition?: EvaluationScenarioDocumentV1["partition"];
  dataClass?: EvaluationScenarioDocumentV1["dataPolicy"]["dataClass"];
}

export interface LegacyScenarioAdapter<TLegacy = unknown> {
  adapterId: string;
  version: string;
  canAdapt(value: unknown): value is TLegacy;
  adapt(value: TLegacy): EvaluationScenarioDocumentV1 | Promise<EvaluationScenarioDocumentV1>;
}

function immutableCopy<T>(value: T): T {
  const copy = canonicalizeJson(value) as T;
  const freeze = (item: unknown): void => {
    if (item === null || typeof item !== "object" || Object.isFrozen(item)) return;
    Object.freeze(item);
    if (Array.isArray(item)) {
      item.forEach(freeze);
    } else {
      Object.values(item as Record<string, unknown>).forEach(freeze);
    }
  };
  freeze(copy);
  return copy;
}

function scenarioKey(scenarioId: string, revision: string): string {
  return `${scenarioId}@${revision}`;
}

function profileKey(profileId: string, version: string): string {
  return `${profileId}@${version}`;
}

function suiteKey(suiteId: string, version: string): string {
  return `${suiteId}@${version}`;
}

export class EvaluationRegistry {
  readonly #scenarios = new Map<string, EvaluationScenarioDocumentV1>();
  readonly #profiles = new Map<string, EvaluationExecutionProfileV1>();
  readonly #suites = new Map<string, EvaluationSuiteV1>();

  public registerScenario(value: EvaluationScenarioDocumentV1): void {
    assertValidScenarioDocument(value);
    const key = scenarioKey(value.scenarioId, value.revision);
    const existing = this.#scenarios.get(key);
    if (existing !== undefined && existing.contentDigest !== value.contentDigest) {
      throw new Error(`Scenario ${key} is immutable and already registered with a different digest`);
    }
    if (existing === undefined) this.#scenarios.set(key, immutableCopy(value));
  }

  public registerProfile(value: EvaluationExecutionProfileV1): void {
    assertValidProfile(value);
    const key = profileKey(value.profileId, value.version);
    const existing = this.#profiles.get(key);
    if (existing !== undefined && existing.contentDigest !== value.contentDigest) {
      throw new Error(`Profile ${key} is immutable and already registered with a different digest`);
    }
    if (existing === undefined) this.#profiles.set(key, immutableCopy(value));
  }

  public registerSuite(value: EvaluationSuiteV1): void {
    assertValidSuite(value);
    const key = suiteKey(value.suiteId, value.version);
    const existing = this.#suites.get(key);
    if (existing !== undefined && existing.contentDigest !== value.contentDigest) {
      throw new Error(`Suite ${key} is immutable and already registered with a different digest`);
    }
    if (existing === undefined) this.#suites.set(key, immutableCopy(value));
  }

  public getScenario(scenarioId: string, revision?: string): EvaluationScenarioDocumentV1 | undefined {
    if (revision !== undefined) return this.#scenarios.get(scenarioKey(scenarioId, revision));
    const matches = [...this.#scenarios.values()].filter((scenario) => scenario.scenarioId === scenarioId);
    if (matches.length > 1) throw new Error(`Scenario ${scenarioId} has multiple revisions; specify one`);
    return matches[0];
  }

  public getProfile(profileId: string, version?: string): EvaluationExecutionProfileV1 | undefined {
    if (version !== undefined) return this.#profiles.get(profileKey(profileId, version));
    const matches = [...this.#profiles.values()].filter((profile) => profile.profileId === profileId);
    if (matches.length > 1) throw new Error(`Profile ${profileId} has multiple versions; specify one`);
    return matches[0];
  }

  public getSuite(suiteId: string, version?: string): EvaluationSuiteV1 | undefined {
    if (version !== undefined) return this.#suites.get(suiteKey(suiteId, version));
    const matches = [...this.#suites.values()].filter((suite) => suite.suiteId === suiteId);
    if (matches.length > 1) throw new Error(`Suite ${suiteId} has multiple versions; specify one`);
    return matches[0];
  }

  public listScenarios(filter: ScenarioRegistryFilter = {}): EvaluationScenarioDocumentV1[] {
    return [...this.#scenarios.values()]
      .filter((scenario) => filter.suiteId === undefined || scenario.suiteIds.includes(filter.suiteId))
      .filter((scenario) => filter.lifecycle === undefined || scenario.lifecycle === filter.lifecycle)
      .filter((scenario) => filter.adjudication === undefined || scenario.adjudication === filter.adjudication)
      .filter((scenario) => filter.partition === undefined || scenario.partition === filter.partition)
      .filter((scenario) => filter.dataClass === undefined || scenario.dataPolicy.dataClass === filter.dataClass)
      .sort((left, right) => scenarioKey(left.scenarioId, left.revision).localeCompare(scenarioKey(right.scenarioId, right.revision)));
  }

  public listProfiles(): EvaluationExecutionProfileV1[] {
    return [...this.#profiles.values()].sort((left, right) =>
      profileKey(left.profileId, left.version).localeCompare(profileKey(right.profileId, right.version)));
  }

  public listSuites(): EvaluationSuiteV1[] {
    return [...this.#suites.values()].sort((left, right) =>
      suiteKey(left.suiteId, left.version).localeCompare(suiteKey(right.suiteId, right.version)));
  }

  public validateIntegrity(): string[] {
    const issues: string[] = [];
    const partitionsByScenarioId = new Map<string, Set<string>>();
    const partitionsByDigest = new Map<string, Set<string>>();
    for (const scenario of this.#scenarios.values()) {
      const scenarioPartitions = partitionsByScenarioId.get(scenario.scenarioId) ?? new Set<string>();
      scenarioPartitions.add(scenario.partition);
      partitionsByScenarioId.set(scenario.scenarioId, scenarioPartitions);
      const digestPartitions = partitionsByDigest.get(scenario.contentDigest) ?? new Set<string>();
      digestPartitions.add(scenario.partition);
      partitionsByDigest.set(scenario.contentDigest, digestPartitions);
      for (const profileId of scenario.compatibleProfileIds) {
        if (![...this.#profiles.values()].some((profile) => profile.profileId === profileId)) {
          issues.push(`Scenario ${scenario.scenarioId}@${scenario.revision} references missing compatible Profile ${profileId}`);
        }
      }
    }
    for (const [scenarioId, partitions] of partitionsByScenarioId) {
      if (partitions.size > 1) {
        issues.push(`Scenario ${scenarioId} crosses mutually exclusive partitions: ${[...partitions].sort().join(", ")}`);
      }
    }
    for (const [digest, partitions] of partitionsByDigest) {
      if (partitions.size > 1) {
        issues.push(`Scenario content ${digest} crosses mutually exclusive partitions: ${[...partitions].sort().join(", ")}`);
      }
    }
    for (const suite of this.#suites.values()) {
      for (const registration of suite.scenarios) {
        const scenario = this.#scenarios.get(scenarioKey(registration.scenarioId, registration.revision));
        if (scenario === undefined) {
          issues.push(`Suite ${suite.suiteId}@${suite.version} references missing Scenario ${registration.scenarioId}@${registration.revision}`);
          continue;
        }
        if (scenario.contentDigest !== registration.contentDigest) {
          issues.push(`Suite ${suite.suiteId}@${suite.version} has a stale digest for ${registration.scenarioId}@${registration.revision}`);
        }
        if (
          digestCriterionAdjudications(scenario.criterionAdjudications) !==
          registration.criterionAdjudicationDigest
        ) {
          issues.push(`Suite ${suite.suiteId}@${suite.version} has stale atomic adjudication metadata for ${registration.scenarioId}@${registration.revision}`);
        }
        if (suite.suiteId === "p0-release" && registration.partition !== "p0") {
          issues.push(`Suite ${suite.suiteId}@${suite.version} contains non-P0 partition Scenario ${registration.scenarioId}@${registration.revision}`);
        }
        if (
          scenario.lifecycle !== registration.lifecycle ||
          scenario.adjudication !== registration.adjudication ||
          scenario.partition !== registration.partition ||
          scenario.dataPolicy.dataClass !== registration.dataClass
        ) {
          issues.push(`Suite ${suite.suiteId}@${suite.version} has axis metadata that differs from ${registration.scenarioId}@${registration.revision}`);
        }
      }
    }
    return issues;
  }

  public async materialize(
    scenarioId: string,
    revision: string,
    resolver: ScenarioMaterializationResolver,
  ): Promise<EvaluationScenarioV1> {
    const scenario = this.getScenario(scenarioId, revision);
    if (scenario === undefined) throw new Error(`Unknown Scenario ${scenarioId}@${revision}`);
    return materializeScenario(scenario, resolver);
  }
}

export async function adaptLegacyScenarios<TLegacy>(
  values: readonly TLegacy[],
  adapters: readonly LegacyScenarioAdapter<TLegacy>[],
): Promise<EvaluationScenarioDocumentV1[]> {
  const adapted: EvaluationScenarioDocumentV1[] = [];
  for (const [index, value] of values.entries()) {
    const matches = adapters.filter((adapter) => adapter.canAdapt(value));
    if (matches.length !== 1) {
      throw new Error(`Legacy Scenario at index ${index} matched ${matches.length} adapters; exactly one is required`);
    }
    const adapter = matches[0];
    if (adapter === undefined) throw new Error(`Legacy Scenario at index ${index} has no adapter`);
    const scenario = await adapter.adapt(value);
    assertValidScenarioDocument(scenario);
    if (scenario.lineage.sourceKind !== "legacy_adapter") {
      throw new Error(`Adapter ${adapter.adapterId}@${adapter.version} must emit legacy_adapter lineage`);
    }
    adapted.push(scenario);
  }
  return adapted;
}

async function readRepositoryJson(rootDirectory: string, ref: FixtureReferenceV1): Promise<JsonValue> {
  const root = await realpath(rootDirectory);
  const candidate = path.resolve(root, ref.path);
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Fixture ${ref.fixtureId} escapes the repository root`);
  }
  const resolved = await realpath(candidate);
  const resolvedRelative = path.relative(root, resolved);
  if (resolvedRelative.startsWith("..") || path.isAbsolute(resolvedRelative)) {
    throw new Error(`Fixture ${ref.fixtureId} resolves outside the repository root`);
  }
  const text = await readFile(resolved, "utf8");
  try {
    return JSON.parse(text) as JsonValue;
  } catch (error) {
    throw new Error(`Fixture ${ref.fixtureId} is not valid JSON`, { cause: error });
  }
}

export function createRepositoryScenarioResolver(rootDirectory: string): ScenarioMaterializationResolver {
  return {
    readModelInput: (ref) => readRepositoryJson(rootDirectory, ref),
    readInitialState: (ref) => readRepositoryJson(rootDirectory, ref),
    readOracle: (ref) => readRepositoryJson(rootDirectory, ref),
  };
}
