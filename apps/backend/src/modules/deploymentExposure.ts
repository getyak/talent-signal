import type { loadedRelationshipTaskConfiguration } from "@talent-signal/agent";

export interface DeploymentExposure {
  schemaVersion: "phase-one-deployment-exposure.v1";
  workspaceIds: readonly string[];
  percentage: 100;
}

/** Capture a concrete deployment audience at startup. There is no percentage
 * rollout in phase one: every admitted workspace receives the installed build. */
export function captureDeploymentExposure(environment: NodeJS.ProcessEnv = process.env): DeploymentExposure | null {
  const text = environment.TALENT_SIGNAL_DEPLOYMENT_EXPOSURE;
  if (text === undefined || text.trim() === "") return null;
  const value = JSON.parse(text) as Record<string, unknown>;
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== "percentage,schemaVersion,workspaceIds"
    || value.schemaVersion !== "phase-one-deployment-exposure.v1" || value.percentage !== 100
    || !Array.isArray(value.workspaceIds) || value.workspaceIds.length < 1 || value.workspaceIds.length > 500
    || value.workspaceIds.some(id => typeof id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id))) {
    throw new Error("DEPLOYMENT_EXPOSURE_INVALID");
  }
  const workspaceIds = value.workspaceIds.map(id => (id as string).toLowerCase()).sort();
  if (new Set(workspaceIds).size !== workspaceIds.length) throw new Error("DEPLOYMENT_EXPOSURE_INVALID");
  return Object.freeze({ schemaVersion: "phase-one-deployment-exposure.v1", percentage: 100,
    workspaceIds: Object.freeze(workspaceIds) });
}

export function assertCandidateDeploymentExposure(exposure: DeploymentExposure | null,
  loaded: ReturnType<typeof loadedRelationshipTaskConfiguration> | undefined): void {
  if (!loaded) return; // An unreported provider cannot supply release readback.
  const parameters = loaded.configuration.parameters as { taskFragmentId?: string; exampleIds?: string[] };
  if (!exposure && (parameters.taskFragmentId !== "baseline" || parameters.exampleIds?.length !== 0)) {
    throw new Error("CANDIDATE_DEPLOYMENT_EXPOSURE_REQUIRED");
  }
}
