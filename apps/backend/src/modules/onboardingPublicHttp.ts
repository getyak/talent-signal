import https from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import { resolveMcpServerUrl, type McpResolvedTarget, type McpUrlPolicy } from "./mcpSecurity.js";

export type ProfileResource = { bytes: Uint8Array; headers: IncomingHttpHeaders; status: number; url: URL };
export function validateProfileTarget(url: URL, origin: string) {
  if (url.protocol !== "https:" || url.origin !== origin || url.port || url.username || url.password || url.hostname.endsWith(".")) {
    throw new Error("The page must stay on the approved public HTTPS origin.");
  }
}

/** Resolve once, then pin that address at the TLS connection; never re-resolve in fetch. */
export async function resolveProfileTarget(url: URL, origin: string, resolver?: McpUrlPolicy["resolver"]): Promise<McpResolvedTarget> {
  validateProfileTarget(url, origin);
  const authority = new URL(url.origin);
  const target = await resolveMcpServerUrl(authority.toString(), { allowedOrigins: [], ...(resolver ? { resolver } : {}) });
  return { ...target, url };
}

// https://nodejs.org/api/https.html#httpsrequestoptions-callback
// The connection uses the verified IP. Host and TLS SNI still use the original domain.
export async function pinnedProfileRequest(target: McpResolvedTarget, maxBytes: number, signal: AbortSignal): Promise<ProfileResource> {
  return new Promise((resolve, reject) => {
    // Connect to the validated literal address. DNS cannot change between policy
    // validation and the socket, while Host/SNI retain virtual-host routing and TLS checks.
    const request = https.request({
      hostname: target.address, family: target.family, port: 443,
      path: target.url.pathname + target.url.search,
      agent: false, servername: target.url.hostname, signal, method: "GET",
      headers: { host: target.url.host, accept: "text/html,application/xhtml+xml,text/plain;q=0.9", "accept-encoding": "identity", "user-agent": "TalentSignalResearchBot/0.1" },
    }, response => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        response.destroy();
        resolve({ bytes: new Uint8Array(), status, headers: response.headers, url: target.url });
        return;
      }
      const chunks: Buffer[] = []; let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > maxBytes) { request.destroy(new Error("The profile page is too large.")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({ bytes: Buffer.concat(chunks), status, headers: response.headers, url: target.url }));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end();
  });
}

export async function fetchProfileResource(url: URL, approvedOrigin: string, maxBytes: number, signal: AbortSignal, allowPath: (url: URL) => boolean = () => true): Promise<ProfileResource> {
  let current = new URL(url);
  for (let hop = 0; hop <= 3; hop++) {
    signal.throwIfAborted();
    if (!allowPath(current)) throw new Error("The page is disallowed by its robots policy.");
    const target = await resolveProfileTarget(current, approvedOrigin);
    signal.throwIfAborted();
    const response = await pinnedProfileRequest(target, maxBytes, signal);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      if (!location || hop === 3) throw new Error("The profile redirect could not be followed.");
      current = new URL(location, current);
      continue;
    }
    return response;
  }
  throw new Error("The profile redirect limit was exceeded.");
}
