import { createHash } from "node:crypto";
import { promises as dns } from "node:dns";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

import { Parser } from "htmlparser2";

import {
  publicResearchDomainAllowed,
  type AgentFetchedWebPage,
  type AgentPublicResearchScope,
  type AgentWebSearchResult,
} from "@talent-signal/agent";

const PAGE_BYTE_LIMIT = 1_000_000;
const ROBOTS_BYTE_LIMIT = 200_000;
const PAGE_TEXT_LIMIT = 35_000;
const FETCH_TIMEOUT_MS = 8_000;

export class AgentSafeWebFetchError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AgentSafeWebFetchError";
  }
}

function isBlockedIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a = 0, b = 0, c = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/u.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:")
  );
}

export function isBlockedWebAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
}

type HostLookup = typeof dns.lookup;

function pinnedHttpsFetcher(lookup: HostLookup): typeof fetch {
  return ((input: URL | RequestInfo, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(String(input));
    return new Promise<Response>((resolve, reject) => {
      const pinnedLookup: NonNullable<RequestOptions["lookup"]> = (
        hostname,
        options,
        callback,
      ) => {
        void lookup(hostname, { all: true, verbatim: true }).then(
          (addresses) => {
            if (
              addresses.length === 0 ||
              addresses.some(({ address }) => isBlockedWebAddress(address))
            ) {
              const error = new Error(
                "The public host resolves to a private or reserved address.",
              ) as NodeJS.ErrnoException;
              error.code = "WEB_FETCH_HOST_BLOCKED";
              callback(error, "", 0);
              return;
            }
            if (options.all) {
              callback(null, addresses);
              return;
            }
            const selected = addresses[0];
            if (!selected) {
              callback(new Error("The public host has no address."), "", 0);
              return;
            }
            callback(null, selected.address, selected.family);
          },
          (error: unknown) =>
            callback(
              error instanceof Error ? error : new Error(String(error)),
              "",
              0,
            ),
        );
      };
      const request = httpsRequest(
        url,
        {
          method: init?.method ?? "GET",
          headers: init?.headers as RequestOptions["headers"],
          signal: init?.signal ?? undefined,
          lookup: pinnedLookup,
        },
        (response) => {
          const headers = new Headers();
          for (const [name, raw] of Object.entries(response.headers)) {
            if (Array.isArray(raw)) {
              for (const item of raw) headers.append(name, item);
            } else if (raw !== undefined) {
              headers.set(name, String(raw));
            }
          }
          resolve(
            new Response(
              Readable.toWeb(response) as ReadableStream<Uint8Array>,
              {
                status: response.statusCode ?? 500,
                headers,
                ...(response.statusMessage
                  ? { statusText: response.statusMessage }
                  : {}),
              },
            ),
          );
        },
      );
      request.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "WEB_FETCH_HOST_BLOCKED") {
          reject(
            new AgentSafeWebFetchError(
              error.code,
              "The public host resolves to a private or reserved address.",
            ),
          );
          return;
        }
        reject(error);
      });
      request.end();
    });
  }) as typeof fetch;
}

async function assertPublicHostname(
  hostname: string,
  lookup: HostLookup,
): Promise<void> {
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new AgentSafeWebFetchError(
      "WEB_FETCH_HOST_BLOCKED",
      "Local and private hosts cannot be fetched by the Agent.",
    );
  }
  const directIp = isIP(hostname);
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses =
      directIp === 0
        ? await lookup(hostname, { all: true, verbatim: true })
        : [{ address: hostname, family: directIp }];
  } catch {
    throw new AgentSafeWebFetchError(
      "WEB_FETCH_DNS_FAILED",
      "The public host could not be resolved safely.",
    );
  }
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isBlockedWebAddress(address))
  ) {
    throw new AgentSafeWebFetchError(
      "WEB_FETCH_HOST_BLOCKED",
      "The public host resolves to a private or reserved address.",
    );
  }
}

async function responseBytes(response: Response, maximumBytes: number) {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maximumBytes) {
    throw new AgentSafeWebFetchError(
      "WEB_FETCH_RESPONSE_TOO_LARGE",
      "The public page exceeds the bounded fetch size.",
    );
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new AgentSafeWebFetchError(
        "WEB_FETCH_RESPONSE_TOO_LARGE",
        "The public page exceeds the bounded fetch size.",
      );
    }
    chunks.push(chunk.value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function fetchBounded(
  input: URL,
  allowedHostname: string,
  maximumBytes: number,
  signal: AbortSignal,
  fetcher: typeof fetch,
  lookup: HostLookup,
) {
  let current = new URL(input);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    if (
      current.protocol !== "https:" ||
      current.username ||
      current.password ||
      current.hostname.toLowerCase() !== allowedHostname
    ) {
      throw new AgentSafeWebFetchError(
        "WEB_FETCH_REDIRECT_OUT_OF_SCOPE",
        "A public-page redirect left the discovered HTTPS host.",
      );
    }
    await assertPublicHostname(current.hostname, lookup);
    let response: Response;
    try {
      response = await fetcher(current, {
        headers: {
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
          "user-agent": "TalentSignalLocalAgent/0.1",
        },
        redirect: "manual",
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(FETCH_TIMEOUT_MS),
        ]),
      });
    } catch (error) {
      if (error instanceof AgentSafeWebFetchError) throw error;
      throw new AgentSafeWebFetchError(
        "WEB_FETCH_UNAVAILABLE",
        error instanceof Error
          ? `The public page could not be reached: ${error.message}`
          : "The public page could not be reached.",
      );
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new AgentSafeWebFetchError(
          "WEB_FETCH_REDIRECT_INVALID",
          "The public-page redirect has no location.",
        );
      }
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) {
      throw new AgentSafeWebFetchError(
        "WEB_FETCH_PROVIDER_FAILED",
        `The public page returned HTTP ${response.status}.`,
      );
    }
    return {
      response,
      finalUrl: current,
      bytes: await responseBytes(response, maximumBytes),
    };
  }
  throw new AgentSafeWebFetchError(
    "WEB_FETCH_REDIRECT_LIMIT_EXCEEDED",
    "The public-page redirect limit was exceeded.",
  );
}

function robotsAllows(robotsText: string, pathname: string): boolean {
  const lines = robotsText
    .split(/\r?\n/u)
    .map((line) => line.replace(/#.*$/u, "").trim())
    .filter(Boolean);
  let applies = false;
  const rules: Array<{ allow: boolean; path: string }> = [];
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      applies = value === "*";
      continue;
    }
    if (
      applies &&
      (field === "allow" || field === "disallow") &&
      value
    ) {
      rules.push({ allow: field === "allow", path: value });
    }
  }
  const matching = rules
    .filter((rule) => pathname.startsWith(rule.path))
    .sort((left, right) => right.path.length - left.path.length);
  return matching[0]?.allow ?? true;
}

async function assertRobotsAllowed(
  url: URL,
  allowedHostname: string,
  signal: AbortSignal,
  fetcher: typeof fetch,
  lookup: HostLookup,
) {
  try {
    const result = await fetchBounded(
      new URL("/robots.txt", url.origin),
      allowedHostname,
      ROBOTS_BYTE_LIMIT,
      signal,
      fetcher,
      lookup,
    );
    if (
      !robotsAllows(
        new TextDecoder().decode(result.bytes),
        url.pathname || "/",
      )
    ) {
      throw new AgentSafeWebFetchError(
        "WEB_FETCH_ROBOTS_DISALLOWED",
        "The discovered public page is disallowed by robots.txt.",
      );
    }
  } catch (error) {
    if (
      error instanceof AgentSafeWebFetchError &&
      error.code === "WEB_FETCH_ROBOTS_DISALLOWED"
    ) {
      throw error;
    }
    // Unavailable robots does not broaden scope: only the exact discovered
    // page and host remain eligible.
  }
}

function extractText(contentType: string, bytes: Uint8Array): string {
  const decoded = new TextDecoder().decode(bytes);
  if (!contentType.includes("html") && !contentType.startsWith("text/plain")) {
    throw new AgentSafeWebFetchError(
      "WEB_FETCH_CONTENT_TYPE_UNSUPPORTED",
      "The public page is not readable text or HTML.",
    );
  }
  if (contentType.startsWith("text/plain")) {
    return decoded.normalize("NFKC").trim().slice(0, PAGE_TEXT_LIMIT);
  }
  const textParts: string[] = [];
  const ignoredTags = new Set(["noscript", "script", "style"]);
  const lineBreakTags = new Set([
    "article",
    "aside",
    "blockquote",
    "br",
    "div",
    "footer",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "li",
    "main",
    "nav",
    "p",
    "section",
    "table",
    "td",
    "th",
    "tr",
  ]);
  let ignoredDepth = 0;
  const parser = new Parser(
    {
      onopentag(name) {
        if (ignoredTags.has(name)) ignoredDepth += 1;
        else if (ignoredDepth === 0 && lineBreakTags.has(name)) {
          textParts.push("\n");
        }
      },
      ontext(value) {
        if (ignoredDepth === 0) textParts.push(value);
      },
      onclosetag(name) {
        if (ignoredTags.has(name)) ignoredDepth = Math.max(0, ignoredDepth - 1);
        else if (ignoredDepth === 0 && lineBreakTags.has(name)) {
          textParts.push("\n");
        }
      },
    },
    { decodeEntities: true },
  );
  parser.end(decoded);
  const text = textParts
    .join("")
    .normalize("NFKC")
    .split(/\r?\n/u)
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, PAGE_TEXT_LIMIT);
  if (!text) {
    throw new AgentSafeWebFetchError(
      "WEB_FETCH_CONTENT_EMPTY",
      "The public page contained no readable text.",
    );
  }
  return text;
}

export async function fetchDiscoveredPublicPage(
  scope: AgentPublicResearchScope,
  result: AgentWebSearchResult,
  signal: AbortSignal,
  options: { fetcher?: typeof fetch; lookup?: HostLookup } = {},
): Promise<Omit<AgentFetchedWebPage, "resultID">> {
  const lookup = options.lookup ?? dns.lookup;
  const fetcher = options.fetcher ?? pinnedHttpsFetcher(lookup);
  if (result.providerID !== scope.providerID) {
    throw new AgentSafeWebFetchError(
      "WEB_FETCH_PROVIDER_MISMATCH",
      "The discovered page belongs to a different search provider.",
    );
  }
  const url = new URL(result.url);
  if (
    url.protocol !== "https:" ||
    !publicResearchDomainAllowed(url.hostname, scope.authorization)
  ) {
    throw new AgentSafeWebFetchError(
      "WEB_FETCH_DOMAIN_OUT_OF_SCOPE",
      "The discovered page is outside the explicit research authorization.",
    );
  }
  const allowedHostname = url.hostname.toLowerCase();
  await assertRobotsAllowed(url, allowedHostname, signal, fetcher, lookup);
  const fetched = await fetchBounded(
    url,
    allowedHostname,
    PAGE_BYTE_LIMIT,
    signal,
    fetcher,
    lookup,
  );
  const text = extractText(
    fetched.response.headers.get("content-type")?.toLowerCase() ??
      "application/octet-stream",
    fetched.bytes,
  );
  return {
    canonicalUrl: fetched.finalUrl.toString(),
    title: result.title,
    text: text.slice(0, 20_000),
    contentHash: createHash("sha256").update(fetched.bytes).digest("hex"),
    retrievedAt: new Date().toISOString(),
    providerID: result.providerID,
  };
}
