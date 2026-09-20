import { randomUUID } from "node:crypto";

import type {
  McpConnection,
  McpConnectionActionRequest,
  McpConnectionCreateRequest,
  McpConnectionListResponse,
  McpConnectionResponse,
  McpConnectionUpdateRequest,
} from "@talent-signal/contracts";
import {
  CONTRACT_VERSION,
  MCP_CONNECTION_ERROR_CODE_SET,
  type McpConnectionErrorCode,
} from "@talent-signal/contracts";
import type { Pool } from "pg";

import { inTransaction, type DatabaseClient } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { appendAudit } from "../lib/audit.js";
import {
  claimIdempotency,
  completeIdempotency,
} from "../lib/idempotency.js";
import type { AuthContext } from "./auth.js";
import {
  performMcpHandshake,
  mcpErrorCodeMessage,
  type McpDiscoveredTool,
} from "./mcpClient.js";
import { mcpPinnedExchange } from "./mcpHttp.js";
import {
  decryptMcpCredential,
  encryptMcpCredential,
  loadMcpEncryptionKey,
  parseAllowedMcpOrigins,
  resolveMcpServerUrl,
  McpUrlRejectedError,
  type McpEncryptionKey,
  type McpResolvedTarget,
} from "./mcpSecurity.js";

/**
 * Account-scoped persistence for inbound MCP connections. The stored
 * credential is only ever written as ciphertext and is never part of a read
 * response. Status becomes verified only after a genuine handshake.
 */

interface McpConnectionRow {
  credential_ciphertext: string | null;
  created_at: Date;
  discovered_tools: unknown;
  friendly_name: string;
  id: string;
  last_checked_at: Date | null;
  last_error_code: string | null;
  last_error_message: string | null;
  revision: number;
  server_url: string;
  status: McpConnection["status"];
  tools_count: number;
  updated_at: Date;
}

export interface McpInboundDependencies {
  allowInsecureTls?: boolean;
  allowedOrigins?: string[];
  encryptionKey?: McpEncryptionKey | null;
  exchange?: typeof mcpPinnedExchange;
  resolver?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
}

export const MCP_CREDENTIAL_UNAVAILABLE_CODE =
  "MCP_CREDENTIAL_UNAVAILABLE" as const satisfies McpConnectionErrorCode;

export function inboundDependencies(
  overrides: McpInboundDependencies = {},
): McpInboundDependencies {
  return {
    allowInsecureTls: false,
    allowedOrigins: parseAllowedMcpOrigins(),
    encryptionKey: loadMcpEncryptionKey(),
    ...overrides,
  };
}

function safeErrorCode(value: string | null): McpConnectionErrorCode | null {
  return value && MCP_CONNECTION_ERROR_CODE_SET.has(value)
    ? (value as McpConnectionErrorCode)
    : null;
}

function discoveredTools(value: unknown): McpDiscoveredTool[] {
  if (!Array.isArray(value)) return [];
  const tools: McpDiscoveredTool[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<McpDiscoveredTool>;
    if (typeof candidate.name !== "string") continue;
    tools.push({
      description:
        typeof candidate.description === "string"
          ? candidate.description.slice(0, 2_000)
          : "",
      name: candidate.name.slice(0, 128),
      read_only: candidate.read_only === true,
    });
    if (tools.length >= 100) break;
  }
  return tools;
}

function record(row: McpConnectionRow): McpConnection {
  const tools = discoveredTools(row.discovered_tools);
  return {
    created_at: row.created_at.toISOString(),
    credential_configured: Boolean(row.credential_ciphertext),
    friendly_name: row.friendly_name,
    id: row.id,
    last_checked_at: row.last_checked_at?.toISOString() ?? null,
    last_error_code: safeErrorCode(row.last_error_code),
    last_error_message: row.last_error_message,
    revision: row.revision,
    server_url: row.server_url,
    status: row.status,
    tools,
    tools_count: tools.length,
    updated_at: row.updated_at.toISOString(),
  };
}

const CONNECTION_COLUMNS = `id, friendly_name, server_url, credential_ciphertext,
  status, last_checked_at, last_error_code, last_error_message,
  discovered_tools, tools_count, revision, created_at, updated_at`;

async function readConnection(
  client: DatabaseClient,
  auth: AuthContext,
  id: string,
): Promise<McpConnectionRow | null> {
  const result = await client.query<McpConnectionRow>(
    `SELECT ${CONNECTION_COLUMNS} FROM mcp_connections
     WHERE account_id = $1 AND id = $2`,
    [auth.accountId, id],
  );
  return result.rows[0] ?? null;
}

export async function listMcpConnections(
  pool: Pool,
  auth: AuthContext,
): Promise<McpConnectionListResponse> {
  const result = await pool.query<McpConnectionRow>(
    `SELECT ${CONNECTION_COLUMNS} FROM mcp_connections
     WHERE account_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 100`,
    [auth.accountId],
  );
  return {
    connections: result.rows.map(record),
    contract_version: CONTRACT_VERSION,
  };
}

async function validateUrl(
  raw: string,
  dependencies: McpInboundDependencies,
): Promise<McpResolvedTarget> {
  try {
    return await resolveMcpServerUrl(raw, {
      allowedOrigins: dependencies.allowedOrigins ?? [],
      ...(dependencies.resolver ? { resolver: dependencies.resolver } : {}),
    });
  } catch (error) {
    if (error instanceof McpUrlRejectedError) {
      throw new ApiError(400, error.code, error.message);
    }
    throw new ApiError(
      400,
      "MCP_ENDPOINT_REJECTED",
      "The MCP server URL could not be validated.",
    );
  }
}

function credentialCiphertext(
  secret: string | null | undefined,
  dependencies: McpInboundDependencies,
): string | null {
  if (secret === null || secret === undefined) return null;
  const key = dependencies.encryptionKey;
  if (!key) {
    throw new ApiError(
      409,
      MCP_CREDENTIAL_UNAVAILABLE_CODE,
      "This deployment has not enabled credential storage, so a bearer secret cannot be saved yet. Ask the operator to enable MCP credential encryption before saving a credential.",
    );
  }
  return encryptMcpCredential(secret, key);
}

export async function createMcpConnection(
  pool: Pool,
  auth: AuthContext,
  input: McpConnectionCreateRequest,
  dependencies: McpInboundDependencies = inboundDependencies(),
): Promise<McpConnectionResponse> {
  await validateUrl(input.server_url, dependencies);
  const ciphertext = credentialCiphertext(input.bearer_secret, dependencies);
  return inTransaction(pool, async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('talent-signal-mcp-connection'),hashtext($1))",
      [auth.accountId],
    );
    const actor = { accountId: auth.accountId, actorUserId: auth.userId };
    const claim = await claimIdempotency(
      client,
      actor,
      "create_mcp_connection",
      input.idempotency_key,
      input,
    );
    if (claim.replay) {
      return claim.replay.body as McpConnectionResponse;
    }
    const id = randomUUID();
    const inserted = (
      await client.query<McpConnectionRow>(
        `INSERT INTO mcp_connections(
           account_id, id, created_by_user_id, friendly_name, server_url,
           credential_ciphertext, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'disconnected')
         RETURNING ${CONNECTION_COLUMNS}`,
        [
          auth.accountId,
          id,
          auth.userId,
          input.friendly_name,
          input.server_url,
          ciphertext,
        ],
      )
    ).rows[0];
    if (!inserted) {
      throw new ApiError(
        500,
        "MCP_CONNECTION_WRITE_FAILED",
        "The connection could not be saved.",
      );
    }
    const row = inserted;
    const response: McpConnectionResponse = {
      connection: record(row),
      contract_version: CONTRACT_VERSION,
    };
    await appendAudit(
      client,
      actor,
      "mcp_connection.created",
      "mcp_connection",
      id,
      {
        credential_configured: Boolean(ciphertext),
        external_effect_count: 0,
        revision: response.connection.revision,
      },
    );
    await completeIdempotency(client, claim, 201, response);
    return response;
  });
}

export async function updateMcpConnection(
  pool: Pool,
  auth: AuthContext,
  id: string,
  input: McpConnectionUpdateRequest,
  dependencies: McpInboundDependencies = inboundDependencies(),
): Promise<McpConnectionResponse> {
  await validateUrl(input.server_url, dependencies);
  const explicitCredential = input.bearer_secret !== undefined;
  const ciphertext = explicitCredential
    ? credentialCiphertext(input.bearer_secret, dependencies)
    : null;
  return inTransaction(pool, async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('talent-signal-mcp-connection'),hashtext($1))",
      [auth.accountId],
    );
    const actor = { accountId: auth.accountId, actorUserId: auth.userId };
    const claim = await claimIdempotency(
      client,
      actor,
      `update_mcp_connection:${id}`,
      input.idempotency_key,
      input,
    );
    if (claim.replay) {
      return claim.replay.body as McpConnectionResponse;
    }
    const current = await readConnection(client, auth, id);
    if (!current) {
      throw new ApiError(404, "MCP_CONNECTION_NOT_FOUND", "This connection no longer exists.");
    }
    if (current.revision !== input.expected_revision) {
      throw new ApiError(
        409,
        "MCP_CONNECTION_CHANGED",
        "Read the current connection before saving your change.",
      );
    }
    const row = (
      await client.query<McpConnectionRow>(
        `UPDATE mcp_connections
         SET friendly_name = $3,
             server_url = $4,
             -- An explicit value replaces or clears the credential. When the
             -- endpoint changes without one, the old origin's credential must
             -- never be sent to the new origin, so it is cleared.
             credential_ciphertext = CASE
               WHEN $5::boolean THEN $6
               WHEN server_url IS DISTINCT FROM $4 THEN NULL
               ELSE credential_ciphertext
             END,
             status = 'disconnected',
             last_checked_at = NULL,
             last_error_code = NULL,
             last_error_message = NULL,
             discovered_tools = '[]'::jsonb,
             tools_count = 0,
             revision = revision + 1,
             updated_at = clock_timestamp()
         WHERE account_id = $1 AND id = $2 AND revision = $7
         RETURNING ${CONNECTION_COLUMNS}`,
        [
          auth.accountId,
          id,
          input.friendly_name,
          input.server_url,
          explicitCredential,
          ciphertext,
          input.expected_revision,
        ],
      )
    ).rows[0];
    if (!row) {
      throw new ApiError(
        409,
        "MCP_CONNECTION_CHANGED",
        "The connection changed while saving. Read it again.",
      );
    }
    const response: McpConnectionResponse = {
      connection: record(row),
      contract_version: CONTRACT_VERSION,
    };
    await appendAudit(client, actor, "mcp_connection.updated", "mcp_connection", id, {
      credential_configured: Boolean(row.credential_ciphertext),
      external_effect_count: 0,
      revision: row.revision,
    });
    await completeIdempotency(client, claim, 200, response);
    return response;
  });
}

export async function connectMcpConnection(
  pool: Pool,
  auth: AuthContext,
  id: string,
  input: McpConnectionActionRequest,
  dependencies: McpInboundDependencies = inboundDependencies(),
): Promise<McpConnectionResponse> {
  const current = await readConnection(pool, auth, id);
  if (!current) {
    throw new ApiError(404, "MCP_CONNECTION_NOT_FOUND", "This connection no longer exists.");
  }
  if (current.revision !== input.expected_revision) {
    throw new ApiError(
      409,
      "MCP_CONNECTION_CHANGED",
      "The connection changed before the check started. Read it again.",
    );
  }

  const deadline = Date.now() + 10_000;
  const target = await validateUrl(current.server_url, dependencies);
  let secret: string | null = null;
  if (current.credential_ciphertext) {
    const key = dependencies.encryptionKey;
    if (!key) {
      return await settleHandshake(pool, auth, id, input, current, {
        errorCode: MCP_CREDENTIAL_UNAVAILABLE_CODE,
        status: "failed",
        tools: [],
      });
    }
    try {
      secret = decryptMcpCredential(current.credential_ciphertext, key);
    } catch {
      return await settleHandshake(pool, auth, id, input, current, {
        errorCode: "MCP_HANDSHAKE_FAILED",
        status: "failed",
        tools: [],
      });
    }
  }

  const handshake = await performMcpHandshake({
    allowInsecureTls: dependencies.allowInsecureTls === true,
    bearerSecret: secret,
    timeoutMs: Math.max(0, deadline - Date.now()),
    ...(dependencies.exchange ? { exchange: dependencies.exchange } : {}),
    target,
  });
  return await settleHandshake(pool, auth, id, input, current, {
    errorCode: handshake.errorCode,
    status: handshake.status,
    tools: handshake.tools,
  });
}

interface HandshakeOutcome {
  errorCode: McpConnectionErrorCode | null;
  status: "failed" | "unauthorized" | "verified";
  tools: McpDiscoveredTool[];
}

async function settleHandshake(
  pool: Pool,
  auth: AuthContext,
  id: string,
  input: McpConnectionActionRequest,
  current: McpConnectionRow,
  outcome: HandshakeOutcome,
): Promise<McpConnectionResponse> {
  return inTransaction(pool, async (client) => {
    const actor = { accountId: auth.accountId, actorUserId: auth.userId };
    const claim = await claimIdempotency(
      client,
      actor,
      `connect_mcp_connection:${id}`,
      input.idempotency_key,
      input,
    );
    if (claim.replay) return claim.replay.body as McpConnectionResponse;

    const storedCode = safeErrorCode(outcome.errorCode);
    const storedMessage = storedCode ? mcpErrorCodeMessage(storedCode) : null;
    let row = (
      await client.query<McpConnectionRow>(
        `UPDATE mcp_connections
         SET status = $4,
             last_checked_at = clock_timestamp(),
             last_error_code = $5,
             last_error_message = $6,
             discovered_tools = $7::jsonb,
             tools_count = $8,
             revision = revision + 1,
             updated_at = clock_timestamp()
         WHERE account_id = $1 AND id = $2 AND revision = $3
         RETURNING ${CONNECTION_COLUMNS}`,
        [
          auth.accountId,
          id,
          current.revision,
          outcome.status,
          storedCode,
          storedMessage,
          JSON.stringify(outcome.tools),
          outcome.tools.length,
        ],
      )
    ).rows[0];
    if (!row) {
      // A concurrent disconnect or edit won the revision guard. Discard the
      // late network result instead of resurrecting cleared discovery.
      const latest = await readConnection(client, auth, id);
      if (!latest) {
        throw new ApiError(404, "MCP_CONNECTION_NOT_FOUND", "This connection no longer exists.");
      }
      row = latest;
    } else {
      await appendAudit(client, actor, "mcp_connection.checked", "mcp_connection", id, {
        error_code: storedCode,
        external_effect_count: 0,
        revision: row.revision,
        status: outcome.status,
        tools_count: outcome.tools.length,
      });
    }
    const body: McpConnectionResponse = {
      connection: record(row),
      contract_version: CONTRACT_VERSION,
    };
    await completeIdempotency(client, claim, 200, body);
    return body;
  });
}

export async function disconnectMcpConnection(
  pool: Pool,
  auth: AuthContext,
  id: string,
  input: McpConnectionActionRequest,
): Promise<McpConnectionResponse> {
  return inTransaction(pool, async (client) => {
    const actor = { accountId: auth.accountId, actorUserId: auth.userId };
    const claim = await claimIdempotency(
      client,
      actor,
      `disconnect_mcp_connection:${id}`,
      input.idempotency_key,
      input,
    );
    if (claim.replay) return claim.replay.body as McpConnectionResponse;
    const row = (
      await client.query<McpConnectionRow>(
        `UPDATE mcp_connections
         SET status = 'disconnected',
             credential_ciphertext = NULL,
             last_checked_at = NULL,
             last_error_code = NULL,
             last_error_message = NULL,
             discovered_tools = '[]'::jsonb,
             tools_count = 0,
             revision = revision + 1,
             updated_at = clock_timestamp()
         WHERE account_id = $1 AND id = $2 AND revision = $3
         RETURNING ${CONNECTION_COLUMNS}`,
        [auth.accountId, id, input.expected_revision],
      )
    ).rows[0];
    if (!row) {
      const exists = await readConnection(client, auth, id);
      if (!exists) {
        throw new ApiError(404, "MCP_CONNECTION_NOT_FOUND", "This connection no longer exists.");
      }
      throw new ApiError(
        409,
        "MCP_CONNECTION_CHANGED",
        "The connection changed before it could be disconnected. Read it again.",
      );
    }
    await appendAudit(client, actor, "mcp_connection.disconnected", "mcp_connection", id, {
      credential_cleared: true,
      external_effect_count: 0,
      revision: row.revision,
    });
    const body: McpConnectionResponse = {
      connection: record(row),
      contract_version: CONTRACT_VERSION,
    };
    await completeIdempotency(client, claim, 200, body);
    return body;
  });
}
