import { Type } from "@sinclair/typebox";
import { CONTRACT_VERSION } from "@talent-signal/contracts";
import { digestCanonicalJson, phaseOneRuntimeBuildDigest } from "@talent-signal/evaluation";
import { PROMPT_DEFINITIONS, type ProductPromptName } from "@talent-signal/agent/prompts";
import { bundledPrompt, promptReference } from "@talent-signal/agent/prompt-registry";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { loadedRelationshipTaskConfiguration } from "@talent-signal/agent";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { BackendConfig } from "../config.js";
import { ApiError } from "../lib/apiError.js";
import type { DeploymentExposure } from "./deploymentExposure.js";

// These references come from the eager compiled catalogue used by actual tasks.
// Environment labels and source files edited after startup cannot change them.
const loadedPrompts = Object.freeze(
  (Object.keys(PROMPT_DEFINITIONS) as ProductPromptName[]).sort().map(name =>
    Object.freeze(promptReference(bundledPrompt(name)))),
);
const processInstanceId = randomUUID();
const configurationInitializedAt = new Date().toISOString();
// A source-mode process is not evidence that the emitted application is loaded.
// Missing or nonstandard build trees remain unavailable and cannot pass release readback.
const loadedBuildSourceDigest = (() => {
  const modulePath = fileURLToPath(import.meta.url);
  if (!modulePath.endsWith("/apps/backend/dist/modules/runtimeManifest.js")) return null;
  try {
    return phaseOneRuntimeBuildDigest(resolve(dirname(modulePath), "../../../.."));
  } catch {
    return null;
  }
})();

export function loadedRuntimeConfiguration(config: BackendConfig,
  relationshipConfiguration?: ReturnType<typeof loadedRelationshipTaskConfiguration>, deploymentExposure: DeploymentExposure | null = null) {
  return {
    schema_version: "loaded-runtime-configuration.v1" as const,
    ...runtimeManifest(config),
    process_instance_id: processInstanceId,
    configuration_initialized_at: configurationInitializedAt,
    build_source_digest: loadedBuildSourceDigest,
    prompt_catalogue_digest: digestCanonicalJson(loadedPrompts),
    prompts: loadedPrompts,
    relationship_task: relationshipConfiguration ?? null,
    deployment_exposure: deploymentExposure,
    deployment_exposure_digest: deploymentExposure ? digestCanonicalJson(deploymentExposure) : null,
    loading_policy: "bundled_at_startup" as const,
    in_flight_policy: "retain_captured_snapshot" as const,
    release_authority: "none" as const,
  };
}

export function registerLoadedRuntimeConfiguration(app: FastifyInstance, config: BackendConfig,
  authenticate: preHandlerHookHandler, relationshipConfiguration?: ReturnType<typeof loadedRelationshipTaskConfiguration>,
  deploymentExposure: DeploymentExposure | null = null) {
  const loaded = loadedRuntimeConfiguration(config, relationshipConfiguration, deploymentExposure);
  app.get("/v1/lab/runtime-configuration", {
    preHandler: [authenticate, async () => {
      if (config.internalLabEnabled !== true) {
        throw new ApiError(403, "LAB_CAPABILITY_DENIED", "Internal runtime configuration is disabled.");
      }
    }],
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    schema: { security: [{ bearerSession: [] }], tags: ["lab", "evaluation"] },
  }, async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
    return loaded;
  });
}

export function runtimeManifest(config: BackendConfig, environment: NodeJS.ProcessEnv = process.env) {
  const configuredID = environment.TALENT_SIGNAL_DEPLOYMENT_ID?.trim();
  return {
    service: "talent-signal" as const,
    contract_version: CONTRACT_VERSION,
    deployment_id: configuredID || (environment.NODE_ENV === "production" ? null : `local-${config.port}`),
    revision: environment.TALENT_SIGNAL_BACKEND_REVISION?.trim() || null,
    data_domain: environment.TALENT_SIGNAL_DATA_DOMAIN?.trim() || "unreported",
    internal_lab_enabled: config.internalLabEnabled === true,
    authentication: {
      apple: config.appleSignInEnabled,
      password: config.passwordAuthEnabled,
      simulated: config.simulatedAuthEnabled,
    },
  };
}

export function registerRuntimeManifest(app: FastifyInstance, config: BackendConfig) {
  app.get("/v1/runtime/manifest", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    schema: { response: { 200: Type.Object({
      service: Type.Literal("talent-signal"), contract_version: Type.Literal(CONTRACT_VERSION),
      deployment_id: Type.Union([Type.String(), Type.Null()]),
      revision: Type.Union([Type.String(), Type.Null()]), data_domain: Type.String(),
      internal_lab_enabled: Type.Boolean(),
      authentication: Type.Object({ apple: Type.Boolean(), password: Type.Boolean(), simulated: Type.Boolean() }),
    }) } },
  }, async (_request, reply) => {
    reply.header("cache-control", "no-store");
    return runtimeManifest(config);
  });
}
