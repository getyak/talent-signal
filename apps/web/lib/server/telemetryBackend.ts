import "server-only";

import {
  TalentSignalClient,
  type AppendTelemetryBatchRequest,
  type CompleteTelemetryTraceRequest,
  type CreateTelemetryTraceRequest,
} from "@talent-signal/contracts";

import { authenticatedBackendClient as signedInBackendClient } from "./backendAuth";
import { isPursuitIntegrationMode } from "./pursuitBackend";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const DEFAULT_ACCOUNT_SLUG = "fixture-alpha";
const DEFAULT_USER_EMAIL = "recruiter@alpha.local";

function backendUrl(): URL {
  const parsed = new URL(
    process.env.TALENT_SIGNAL_BACKEND_URL?.trim() ??
      "http://127.0.0.1:4317",
  );
  if (parsed.protocol === "https:") return parsed;
  if (parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname)) {
    return parsed;
  }
  throw new Error(
    "The telemetry backend must use HTTPS, except for an explicit loopback integration.",
  );
}

async function authenticatedClient(label: string): Promise<TalentSignalClient> {
  const signedIn = await signedInBackendClient();
  if (signedIn) return signedIn;

  const url = backendUrl();
  if (!LOOPBACK_HOSTS.has(url.hostname) || !isPursuitIntegrationMode()) {
    throw new Error(
      "Production Web-to-backend identity exchange is not configured for telemetry.",
    );
  }
  const client = new TalentSignalClient(url.origin);
  await client.login({
    account_slug:
      process.env.TALENT_SIGNAL_BACKEND_ACCOUNT_SLUG ?? DEFAULT_ACCOUNT_SLUG,
    user_email:
      process.env.TALENT_SIGNAL_BACKEND_USER_EMAIL ?? DEFAULT_USER_EMAIL,
    client_label: label,
  });
  return client;
}

export async function createWebTelemetryTrace(
  request: CreateTelemetryTraceRequest,
) {
  return (await authenticatedClient("web-telemetry-ingest")).createTelemetryTrace(
    request,
  );
}

export async function appendWebTelemetryBatch(
  traceId: string,
  request: AppendTelemetryBatchRequest,
) {
  return (await authenticatedClient("web-telemetry-batch")).appendTelemetryBatch(
    traceId,
    request,
  );
}

export async function completeWebTelemetryTrace(
  traceId: string,
  request: CompleteTelemetryTraceRequest,
) {
  return (await authenticatedClient("web-telemetry-complete")).completeTelemetryTrace(
    traceId,
    request,
  );
}

export async function loadTelemetryTraces(limit = 100) {
  return (await authenticatedClient("web-eval-traces")).listTelemetryTraces(
    limit,
  );
}

export async function loadTelemetryTrace(traceId: string) {
  return (await authenticatedClient("web-eval-trace-detail")).getTelemetryTrace(
    traceId,
  );
}

export async function loadTelemetryArtifact(artifactId: string) {
  return (await authenticatedClient("web-eval-artifact")).getTelemetryArtifactContent(
    artifactId,
  );
}
