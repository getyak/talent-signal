import "server-only";

import {
  TalentSignalHttpError,
  type McpClientGrant,
  type McpConnection,
  type McpEndpointsResponse,
} from "@talent-signal/contracts";

import { authenticatedBackendClient } from "./backendAuth";

export type McpExtensionSnapshot = {
  connections: McpConnection[];
  endpoints: McpEndpointsResponse;
  grants: McpClientGrant[];
};

export const MCP_SNAPSHOT_TIMEOUT_MS = 8_000;

async function extensionsBackend() {
  const client = await authenticatedBackendClient();
  if (!client) {
    throw new TalentSignalHttpError(401, "AUTH_REQUIRED", "请重新登录。", null);
  }
  return client;
}

export async function loadMcpExtensionSnapshot(): Promise<McpExtensionSnapshot> {
  const client = await extensionsBackend();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MCP_SNAPSHOT_TIMEOUT_MS);
  try {
    const [connections, grants, endpoints] = await Promise.all([
      client.listMcpConnections(controller.signal),
      client.listMcpClientGrants(controller.signal),
      client.getMcpEndpoints(controller.signal),
    ]);
    return {
      connections: connections.connections,
      endpoints,
      grants: grants.grants,
    };
  } finally {
    clearTimeout(timer);
  }
}
