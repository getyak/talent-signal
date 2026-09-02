import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  LocalJsonReporter,
  digestCanonicalJson,
  type AgentDefinitionReferenceV1,
  type ContentIdentityV1,
  type EvaluationReporter,
  type Sha256Digest,
} from "@talent-signal/evaluation";

import {
  summarizeModelJudgeCalibration,
  type CalibrationDecisionV1,
} from "./calibration.js";
import {
  adjudicateAnnotationProposals,
  importAnnotationProposals,
  type AnnotationAdjudicationDecisionV1,
  type AnnotationImportBatchV1,
} from "./opik/importAnnotations.js";
import {
  bootstrapHumanWorkflowAnnotationQueue,
  type HumanReviewDefinitionV1,
  type HumanWorkflowRubricV1,
} from "./opik/bootstrapAnnotationQueue.js";
import {
  OpikReporter,
  checkOpikConfiguration,
  deleteOpikProjection,
} from "./opik/opikReporter.js";
import { RestOpikAnnotationTransport } from "./opik/opikAnnotationTransport.js";
import { SdkOpikTransport, type OpikConnectionOptions } from "./opik/opikTransport.js";
import { createDatasetSyncPlan } from "./opik/syncDataset.js";
import { createDefaultModeDispatcher } from "./builtinExecutors.js";
import { ProjectionLedger } from "./projectionLedger.js";
import { createRuntimeForProfile, runtimeDispatchClock } from "./profileRuntime.js";
import {
  findProfile,
  findScenario,
  findSuite,
  loadEvaluationRepository,
  safeScenarioSummary,
} from "./repository.js";
import { renderEvaluationMarkdown, summarizeEvaluationResults } from "./report.js";
import { runEvaluationCase, type RunEvaluationCaseOutputV1 } from "./runSuite.js";

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function argumentsFor(name: string): string[] {
  return process.argv.flatMap((value, index) => {
    if (value !== name) return [];
    const candidate = process.argv[index + 1];
    return candidate && !candidate.startsWith("--") ? [candidate] : [];
  });
}

function requiredArgument(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`Missing required argument ${name}`);
  return value;
}

function positiveIntegerArgument(name: string, fallback: number): number {
  const raw = argument(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
}

function repositoryRoot(): string {
  return resolve(workspaceRoot, argument("--root") ?? "evals/v2");
}

function artifactDirectory(): string {
  return resolve(
    workspaceRoot,
    argument("--artifact-dir") ?? "docs/evaluations/2026-09-01-evaluation-platform",
  );
}

function projectionLedgerDirectory(): string {
  const configured = argument("--ledger-dir");
  return configured === undefined
    ? resolve(artifactDirectory(), "projection-ledger")
    : resolve(workspaceRoot, configured);
}

function agentDefinition(git: string, requireExplicit: boolean): AgentDefinitionReferenceV1 {
  const definitionId = argument("--agent-definition-id");
  const version = argument("--agent-definition-version");
  if (requireExplicit && (!definitionId || !version)) {
    throw new Error(
      "Opik projection requires --agent-definition-id and --agent-definition-version",
    );
  }
  const resolvedId = definitionId ?? "evaluation-runner-control-plane";
  const resolvedVersion = version ?? "0.1.0";
  const suppliedDigest = argument("--agent-definition-digest");
  if (requireExplicit && !suppliedDigest) {
    throw new Error("Opik projection requires --agent-definition-digest");
  }
  if (suppliedDigest && !/^sha256:[a-f0-9]{64}$/.test(suppliedDigest)) {
    throw new Error("--agent-definition-digest must be a SHA-256 content digest");
  }
  return {
    definitionId: resolvedId,
    version: resolvedVersion,
    contentDigest:
      (suppliedDigest as Sha256Digest | undefined) ??
      digestCanonicalJson({ definitionId: resolvedId, version: resolvedVersion, gitSha: git }),
  };
}

function opikOptions(): OpikConnectionOptions {
  return {
    projectName: process.env.OPIK_PROJECT_NAME ?? "talent-signal-pursuit-agent",
    environment: process.env.OPIK_ENVIRONMENT ?? "development",
    ...(process.env.OPIK_API_KEY ? { apiKey: process.env.OPIK_API_KEY } : {}),
    ...(process.env.OPIK_URL_OVERRIDE
      ? { apiUrl: process.env.OPIK_URL_OVERRIDE }
      : { apiUrl: "http://localhost:5173/api" }),
    ...(process.env.OPIK_WORKSPACE ? { workspaceName: process.env.OPIK_WORKSPACE } : {}),
  };
}

async function gitSha(): Promise<string> {
  if (process.env.GIT_SHA) return process.env.GIT_SHA;
  try {
    return (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: workspaceRoot })).stdout.trim();
  } catch {
    return "unknown-git-sha";
  }
}

async function evaluationRuntimeFingerprint(): Promise<ContentIdentityV1> {
  const roots = [
    resolve(workspaceRoot, "packages/evaluation/src"),
    resolve(workspaceRoot, "apps/eval-runner/src"),
  ];
  const sourceFiles = (
    await Promise.all(
      roots.map(async (root) =>
        (await readdir(root, { recursive: true }))
          .filter(
            (entry) =>
              entry.endsWith(".ts") &&
              !entry.endsWith(".test.ts") &&
              !entry.endsWith(".testHelper.ts"),
          )
          .map((entry) => resolve(root, entry)),
      ),
    )
  )
    .flat()
    .sort((left, right) => left.localeCompare(right));
  const files = await Promise.all(
    sourceFiles.map(async (path) => ({
      path: relative(workspaceRoot, path),
      content: await readFile(path, "utf8"),
    })),
  );
  return {
    identityId: "evaluation-runtime",
    version: "source-tree.v1",
    contentDigest: digestCanonicalJson({ files }),
  };
}

async function validateCommand(): Promise<unknown> {
  const repository = await loadEvaluationRepository(repositoryRoot(), workspaceRoot);
  return {
    status: "pass",
    rootDirectory: repository.rootDirectory,
    suiteCount: repository.suites.length,
    profileCount: repository.profiles.length,
    scenarioCount: repository.scenarios.length,
    p0Count: repository.scenarios.filter((item) => item.riskTier === "p0_blocker").length,
    partitions: Object.fromEntries(
      ["p0", "dev", "held_out", "red_team"].map((partition) => [
        partition,
        repository.scenarios.filter((item) => item.partition === partition).length,
      ]),
    ),
    contaminationFindingCount: repository.contaminationFindings.length,
  };
}

async function listCommand(): Promise<unknown> {
  const repository = await loadEvaluationRepository(repositoryRoot(), workspaceRoot);
  return {
    suites: repository.suites.map((item) => ({
      suiteId: item.suiteId,
      version: item.version,
      contentDigest: item.contentDigest,
      scenarioCount: item.scenarios.length,
    })),
    profiles: repository.profiles.map((item) => ({
      profileId: item.profileId,
      version: item.version,
      mode: item.mode,
      systemUnderTest: item.systemUnderTest,
    })),
    scenarios: repository.scenarios.map(safeScenarioSummary),
  };
}

async function caseCommand(): Promise<unknown> {
  const repository = await loadEvaluationRepository(repositoryRoot(), workspaceRoot);
  return safeScenarioSummary(findScenario(repository, requiredArgument("--id")));
}

async function replayCommand(): Promise<RunEvaluationCaseOutputV1> {
  const repository = await loadEvaluationRepository(repositoryRoot(), workspaceRoot);
  const scenario = findScenario(repository, requiredArgument("--id"));
  const profileId = argument("--profile") ?? scenario.slices.defaultProfileId;
  if (!profileId) throw new Error(`Scenario ${scenario.scenarioId} has no default profile`);
  const profile = findProfile(repository, profileId);
  const suiteId = argument("--suite") ?? scenario.suiteIds[0];
  if (!suiteId) throw new Error(`Scenario ${scenario.scenarioId} has no suite`);
  const suite = findSuite(repository, suiteId);
  const outputDirectory = artifactDirectory();
  const runtime = createRuntimeForProfile(profile, scenario.contentDigest);
  const trialNumber = positiveIntegerArgument("--trial-number", 1);
  const git = await gitSha();
  const runtimeFingerprint = await evaluationRuntimeFingerprint();
  const withOpik = process.argv.includes("--opik");
  const definition = agentDefinition(git, withOpik);
  const projectionReporters: EvaluationReporter[] = [];
  if (withOpik) {
    const options = opikOptions();
    const transport = new SdkOpikTransport(options);
    const datasetName = argument("--dataset") ?? suite.suiteId;
    const remoteDigest = await transport.readDatasetDigest(datasetName);
    const plan = createDatasetSyncPlan({
      projectName: options.projectName,
      datasetName,
      suite,
      scenarios: repository.scenarios,
      ownerControlledInstance: process.argv.includes("--owner-controlled"),
      dryRun: false,
      ...(remoteDigest === undefined ? {} : { remote: { datasetDigest: remoteDigest } }),
    });
    if (plan.operation !== "noop") {
      throw new Error("OPIK_DATASET_NOT_SYNCED: run opik-sync before projecting an experiment");
    }
    projectionReporters.push(
      new OpikReporter({
        projectName: options.projectName,
        datasetName,
        datasetDigest: plan.desiredDatasetDigest,
        scenario,
        ownerControlledInstance: process.argv.includes("--owner-controlled"),
        ledger: new ProjectionLedger(projectionLedgerDirectory()),
        transport,
      }),
    );
  }
  return runEvaluationCase({
    scenario,
    profile,
    suite,
    dispatcher: createDefaultModeDispatcher(process.env, runtimeDispatchClock(runtime)),
    localReporter: new LocalJsonReporter({ outputDirectory, runtime }),
    projectionReporters,
    gitSha: git,
    agentDefinition: definition,
    fingerprints: { sdk: runtimeFingerprint },
    runtime,
    trialNumber,
  });
}

async function reportCommand(): Promise<string | unknown> {
  const inputPath = resolve(process.cwd(), requiredArgument("--input"));
  const parsed = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
  const values = Array.isArray(parsed) ? parsed : [parsed];
  const summary = summarizeEvaluationResults(values as RunEvaluationCaseOutputV1[]);
  return process.argv.includes("--markdown") ? renderEvaluationMarkdown(summary) : summary;
}

async function p0Command(): Promise<unknown> {
  const repository = await loadEvaluationRepository(repositoryRoot(), workspaceRoot);
  const suite = findSuite(repository, argument("--suite") ?? "p0-release");
  const selected = suite.scenarios.map((registration) =>
    findScenario(repository, registration.scenarioId),
  );
  const outputDirectory = resolve(
    workspaceRoot,
    argument("--artifact-dir") ?? "tmp/evaluation-v2-p0",
  );
  const git = await gitSha();
  const runtimeFingerprint = await evaluationRuntimeFingerprint();
  const definition = agentDefinition(git, false);
  const results: RunEvaluationCaseOutputV1[] = [];
  for (const scenario of selected) {
    const profileId = scenario.slices.defaultProfileId;
    if (!profileId) throw new Error(`Scenario ${scenario.scenarioId} has no default profile`);
    results.push(
      await (async () => {
        const profile = findProfile(repository, profileId);
        const runtime = createRuntimeForProfile(profile, scenario.contentDigest);
        return runEvaluationCase({
        scenario,
        profile,
        suite,
        dispatcher: createDefaultModeDispatcher(process.env, runtimeDispatchClock(runtime)),
        localReporter: new LocalJsonReporter({ outputDirectory, runtime }),
        gitSha: git,
        agentDefinition: definition,
        fingerprints: { sdk: runtimeFingerprint },
        runtime,
        });
      })(),
    );
  }
  const summary = summarizeEvaluationResults(results);
  const scenarioResults = results.map((item) => {
    const deterministicScores = item.gate.scores.filter(
      (score) => score.evaluatorId === "deterministic-safety",
    );
    const deterministicSafetyStatus = deterministicScores.some((score) => score.status === "fail")
      ? "fail"
      : deterministicScores.length > 0 && deterministicScores.every((score) => score.status === "pass")
        ? "pass"
        : "not_run";
    return {
      scenarioId: item.manifest.attempt.scenario.identityId,
      gateStatus: item.gate.status,
      deterministicSafetyStatus,
      releaseReadinessStatus: item.gate.status,
      terminalStatus: item.observation.terminalStatus,
      terminalReasonCode: item.observation.terminalReasonCode,
      manifestDigest: item.manifest.contentDigest,
      resultDigest: item.result.contentDigest,
      gateDigest: item.gate.contentDigest,
    };
  });
  return {
    ...summary,
    suiteId: suite.suiteId,
    deterministicSafetySummary: {
      pass: scenarioResults.filter((item) => item.deterministicSafetyStatus === "pass").length,
      fail: scenarioResults.filter((item) => item.deterministicSafetyStatus === "fail").length,
      notRun: scenarioResults.filter((item) => item.deterministicSafetyStatus === "not_run").length,
      semantic: "deterministic_safety_only_not_release_approval",
    },
    scenarioResults,
  };
}

async function opikSyncCommand(): Promise<unknown> {
  const repository = await loadEvaluationRepository(repositoryRoot(), workspaceRoot);
  const suite = findSuite(repository, requiredArgument("--suite"));
  const transport = new SdkOpikTransport(opikOptions());
  const dryRun = process.argv.includes("--dry-run");
  const remoteDigest = argument("--remote-digest") as `sha256:${string}` | undefined;
  const plan = createDatasetSyncPlan({
    projectName: opikOptions().projectName,
    datasetName: argument("--dataset") ?? suite.suiteId,
    suite,
    scenarios: repository.scenarios,
    ownerControlledInstance: process.argv.includes("--owner-controlled"),
    dryRun,
    ...(remoteDigest === undefined ? {} : { remote: { datasetDigest: remoteDigest } }),
  });
  if (dryRun) return plan;
  const currentDigest = await transport.readDatasetDigest(plan.datasetName);
  const executablePlan = createDatasetSyncPlan({
    projectName: plan.projectName,
    datasetName: plan.datasetName,
    suite,
    scenarios: repository.scenarios,
    ownerControlledInstance: process.argv.includes("--owner-controlled"),
    dryRun: false,
    ...(currentDigest === undefined ? {} : { remote: { datasetDigest: currentDigest } }),
  });
  return transport.syncDataset(executablePlan);
}

async function annotationImportCommand(): Promise<unknown> {
  const inputPath = resolve(process.cwd(), requiredArgument("--input"));
  const annotations = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
  const expectedRubricVersion = argument("--rubric-version");
  return importAnnotationProposals({
    annotations,
    importedAt: new Date().toISOString(),
    ...(expectedRubricVersion === undefined ? {} : { expectedRubricVersion }),
  });
}

async function opikAnnotationBootstrapCommand(): Promise<unknown> {
  if (!process.argv.includes("--owner-controlled")) {
    throw new Error("Opik annotation bootstrap requires --owner-controlled");
  }
  const repository = await loadEvaluationRepository(repositoryRoot(), workspaceRoot);
  const scenario = findScenario(repository, requiredArgument("--id"));
  const traceIds = argumentsFor("--trace-id");
  if (traceIds.length === 0) throw new Error("Opik annotation bootstrap requires --trace-id");
  const root = repositoryRoot();
  const [definition, rubric] = await Promise.all([
    readFile(resolve(root, "review/feedback-definitions.v1.json"), "utf8").then(
      (value) => JSON.parse(value) as HumanReviewDefinitionV1,
    ),
    readFile(resolve(root, "rubrics/human-workflow.v1.json"), "utf8").then(
      (value) => JSON.parse(value) as HumanWorkflowRubricV1,
    ),
  ]);
  const options = opikOptions();
  return bootstrapHumanWorkflowAnnotationQueue({
    projectId: requiredArgument("--project-id"),
    queueName: argument("--queue") ?? `${scenario.scenarioId.toLowerCase()}-human-workflow-v1`,
    scenario,
    traceIds,
    definition,
    rubric,
    transport: new RestOpikAnnotationTransport({
      apiUrl: options.apiUrl ?? "http://localhost:5173/api",
      ...(options.apiKey ? { apiKey: options.apiKey } : {}),
      ...(options.workspaceName ? { workspaceName: options.workspaceName } : {}),
    }),
  });
}

async function annotationAdjudicateCommand(): Promise<unknown> {
  const batch = JSON.parse(
    await readFile(resolve(process.cwd(), requiredArgument("--input")), "utf8"),
  ) as AnnotationImportBatchV1;
  const decisions = JSON.parse(
    await readFile(resolve(process.cwd(), requiredArgument("--decisions")), "utf8"),
  ) as AnnotationAdjudicationDecisionV1[];
  return adjudicateAnnotationProposals({ batch, decisions });
}

async function calibrationCommand(): Promise<unknown> {
  const inputPath = resolve(process.cwd(), requiredArgument("--input"));
  const decisions = JSON.parse(await readFile(inputPath, "utf8")) as CalibrationDecisionV1[];
  return summarizeModelJudgeCalibration(decisions);
}

async function opikDeleteCommand(): Promise<unknown> {
  const projectionId = requiredArgument("--projection-id");
  return deleteOpikProjection({
    ref: {
      reporterId: "opik",
      runId: argument("--run-id") ?? "unknown-local-run",
      projectionId,
    },
    ledger: new ProjectionLedger(projectionLedgerDirectory()),
    transport: new SdkOpikTransport(opikOptions()),
  });
}

async function opikLedgerCommand(): Promise<unknown> {
  return new ProjectionLedger(projectionLedgerDirectory()).readEvents(
    requiredArgument("--projection-id"),
  );
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "validate";
  let output: unknown;
  if (command === "validate") output = await validateCommand();
  else if (command === "list") output = await listCommand();
  else if (command === "case") output = await caseCommand();
  else if (command === "replay") output = await replayCommand();
  else if (command === "p0") output = await p0Command();
  else if (command === "report") output = await reportCommand();
  else if (command === "opik-check") {
    output = await checkOpikConfiguration(new SdkOpikTransport(opikOptions()));
  } else if (command === "opik-sync") output = await opikSyncCommand();
  else if (command === "opik-annotation-bootstrap") output = await opikAnnotationBootstrapCommand();
  else if (command === "opik-delete") output = await opikDeleteCommand();
  else if (command === "opik-ledger") output = await opikLedgerCommand();
  else if (command === "annotations-import") output = await annotationImportCommand();
  else if (command === "annotations-adjudicate") output = await annotationAdjudicateCommand();
  else if (command === "calibrate") output = await calibrationCommand();
  else throw new Error(`Unknown evaluation command: ${command}`);

  process.stdout.write(typeof output === "string" ? `${output}\n` : `${JSON.stringify(output, null, 2)}\n`);
  if (
    ((command === "replay" &&
      ["fail", "not_run"].includes((output as RunEvaluationCaseOutputV1).gate.status)) ||
      (command === "p0" &&
        (output as { scenarioResults: Array<{ gateStatus: string }> }).scenarioResults.some(
          (item) => item.gateStatus === "fail" || item.gateStatus === "not_run",
        )))
  ) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

// The Opik SDK keeps background HTTP resources alive after all awaited writes
// have flushed. This executable owns no reusable server state, so terminate at
// the explicit CLI boundary instead of leaving completed automation hanging.
process.exit(process.exitCode ?? 0);
