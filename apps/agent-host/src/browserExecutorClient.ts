import { request as httpRequest } from "node:http";
import { isIP } from "node:net";
import { BROWSER_EXECUTOR_PATH, BROWSER_REQUEST_BYTES, BROWSER_RESPONSE_BYTES,
  parseBrowserRequest, parseBrowserResponse, type BrowserExecutorRequest } from "./browserExecutorProtocol.js";
import type { PublicBrowserObservation } from "./isolatedPublicBrowser.js";

/** Operator-configured private IP only; no DNS, proxy environment, or redirects.
 * The caller sends a discovered URL and opaque execution IDs, never anchors. */
export async function browseViaExecutor(input: BrowserExecutorRequest, signal: AbortSignal,
  environment: NodeJS.ProcessEnv): Promise<PublicBrowserObservation> {
  const raw = environment.TALENT_SIGNAL_BROWSER_EXECUTOR_URL;
  const token = environment.TALENT_SIGNAL_BROWSER_EXECUTOR_TOKEN;
  if (!raw || !token || !/^[a-f0-9]{64}$/u.test(token)) throw new Error("BROWSER_EXECUTOR_NOT_CONFIGURED");
  const endpoint = new URL(raw);
  const parts = endpoint.hostname.split(".").map(Number);
  const privateIPv4 = isIP(endpoint.hostname) === 4 && (parts[0] === 127 || parts[0] === 10
    || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31));
  if (endpoint.protocol !== "http:" || !privateIPv4 || endpoint.username || endpoint.password
    || endpoint.pathname !== "/" || endpoint.search || endpoint.hash) throw new Error("BROWSER_EXECUTOR_ENDPOINT_INVALID");
  const parsed = parseBrowserRequest(input);
  if (parsed.deadline <= Date.now() || parsed.deadline > Date.now() + 30_000) throw new Error("BROWSER_DEADLINE_INVALID");
  signal = AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, parsed.deadline - Date.now()))]);
  const bytes = Buffer.from(JSON.stringify(parsed));
  if (bytes.length > BROWSER_REQUEST_BYTES) throw new Error("BROWSER_REQUEST_TOO_LARGE");
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const request = httpRequest(new URL(BROWSER_EXECUTOR_PATH, endpoint), {
      method: "POST", agent: false, signal,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "content-length": bytes.length },
    }, response => {
      let size = 0;
      const chunks: Buffer[] = [];
      response.on("error", reject);
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > BROWSER_RESPONSE_BYTES) { response.destroy(new Error("BROWSER_RESPONSE_TOO_LARGE")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => {
        try {
          signal.throwIfAborted();
          if (response.statusCode !== 200 || response.headers["content-type"] !== "application/json") throw new Error("BROWSER_EXECUTOR_UNAVAILABLE");
          resolve(parseBrowserResponse(JSON.parse(Buffer.concat(chunks).toString("utf8")), parsed));
        } catch (error) { reject(error); }
      });
    });
    request.on("error", reject);
    request.end(bytes);
  });
}
