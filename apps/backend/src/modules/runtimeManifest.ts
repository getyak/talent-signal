import { Type } from "@sinclair/typebox";
import { CONTRACT_VERSION } from "@talent-signal/contracts";
import type { FastifyInstance } from "fastify";
import type { BackendConfig } from "../config.js";

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
