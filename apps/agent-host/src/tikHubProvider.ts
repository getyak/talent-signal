import { createHash } from "node:crypto";

export type TikHubProfilePlatform = "douyin" | "threads" | "tiktok" | "weibo";

export interface TikHubPublicProfileObservation {
  platform: TikHubProfilePlatform;
  providerID: "tikhub";
  providerRequestID: string | null;
  profileID: string;
  displayName: string;
  handle: string | null;
  biography: string | null;
  profileUrl: string;
  avatarUrl: string | null;
  verified: boolean | null;
  contentHash: string;
  retrievedAt: string;
}

export class TikHubProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TikHubProviderError";
  }
}

interface TikHubProviderOptions {
  apiKey: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

type JsonRecord = Record<string, unknown>;

const DEFAULT_BASE_URL = "https://api.tikhub.dev";
const MAX_RESPONSE_BYTES = 5_000_000;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function boolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 0 || value === "0") return false;
  if (value === 1 || value === "1") return true;
  return null;
}

function firstString(source: JsonRecord, names: readonly string[]): string | null {
  for (const name of names) {
    const found = string(source[name]);
    if (found) return found;
  }
  return null;
}

function firstBoolean(
  source: JsonRecord,
  names: readonly string[],
): boolean | null {
  for (const name of names) {
    const found = boolean(source[name]);
    if (found !== null) return found;
  }
  return null;
}

function nestedAvatar(source: JsonRecord): string | null {
  const direct = firstString(source, [
    "profile_pic_url",
    "avatar_url",
    "avatar",
    "avatar_hd",
  ]);
  if (direct) return direct;
  for (const name of ["avatar_larger", "avatar_medium", "avatar_thumb"]) {
    const value = record(source[name]);
    const url = string(array(value?.url_list)[0]);
    if (url) return url;
  }
  return null;
}

function profileUrl(
  platform: TikHubProfilePlatform,
  profileID: string,
  handle: string | null,
  source: JsonRecord,
): string {
  const supplied = firstString(source, [
    "profile_url",
    "url",
    "share_url",
    "user_url",
  ]);
  if (supplied) {
    try {
      const parsed = new URL(supplied);
      if (parsed.protocol === "https:") return parsed.toString();
    } catch {
      // Fall through to a platform-owned canonical URL.
    }
  }
  if (platform === "douyin") {
    const secured = firstString(source, ["sec_uid", "sec_user_id"]);
    return secured
      ? `https://www.douyin.com/user/${encodeURIComponent(secured)}`
      : `https://www.douyin.com/search/${encodeURIComponent(handle ?? profileID)}`;
  }
  if (platform === "tiktok") {
    return `https://www.tiktok.com/@${encodeURIComponent(handle ?? profileID)}`;
  }
  if (platform === "weibo") {
    return `https://weibo.com/u/${encodeURIComponent(profileID)}`;
  }
  return `https://www.threads.net/@${encodeURIComponent(handle ?? profileID)}`;
}

function candidateRecords(payload: JsonRecord, platform: TikHubProfilePlatform) {
  const data = record(payload.data) ?? payload;
  const lists =
    platform === "threads"
      ? [data.users, record(data.data)?.users]
      : platform === "weibo"
        ? [data.users, data.user_list, data.list, record(data.data)?.users]
        : [data.user_list, data.users, data.items, record(data.data)?.user_list];
  const candidates = lists.flatMap(array).map((item) => {
    const wrapper = record(item);
    return record(wrapper?.user_info) ?? record(wrapper?.user) ?? wrapper;
  });
  return candidates.filter((item): item is JsonRecord => item !== null);
}

function normalizeProfile(
  source: JsonRecord,
  platform: TikHubProfilePlatform,
  providerRequestID: string | null,
  retrievedAt: string,
): TikHubPublicProfileObservation | null {
  const profileID = firstString(source, [
    "uid",
    "user_id",
    "id",
    "pk",
    "pk_id",
    "sec_uid",
    "sec_user_id",
    "unique_id",
    "username",
  ]);
  const displayName = firstString(source, [
    "nickname",
    "full_name",
    "display_name",
    "name",
    "username",
    "unique_id",
  ]);
  if (!profileID || !displayName) return null;
  const handle = firstString(source, [
    "unique_id",
    "username",
    "screen_name",
    "user_name",
  ]);
  const observedContent = {
    platform,
    providerID: "tikhub" as const,
    providerRequestID,
    profileID,
    displayName,
    handle,
    biography: firstString(source, ["signature", "biography", "description", "bio"]),
    profileUrl: profileUrl(platform, profileID, handle, source),
    avatarUrl: nestedAvatar(source),
    verified: firstBoolean(source, ["is_verified", "verified"]),
  };
  return {
    ...observedContent,
    contentHash: createHash("sha256")
      .update(JSON.stringify(observedContent))
      .digest("hex"),
    retrievedAt,
  };
}

function validatedBaseUrl(value: string): string {
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    !new Set(["api.tikhub.dev", "api.tikhub.io"]).has(parsed.hostname) ||
    !["", "/"].includes(parsed.pathname) ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(
      "TikHub base URL must be the HTTPS origin api.tikhub.dev or api.tikhub.io.",
    );
  }
  return parsed.origin;
}

function validatedQuery(value: string): string {
  const normalized = value.normalize("NFKC").trim();
  if (normalized.length < 2 || normalized.length > 100) {
    throw new TikHubProviderError(
      "TIKHUB_QUERY_INVALID",
      "TikHub public-profile search requires 2-100 characters.",
    );
  }
  if (
    /\b(?:email|e-mail|phone|mobile|address|background\s+check)\b|邮箱|手机号|家庭住址|背调/iu.test(
      normalized,
    ) ||
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(normalized) ||
    /(?:\+?\d[\d\s().-]{7,}\d)/u.test(normalized)
  ) {
    throw new TikHubProviderError(
      "TIKHUB_SENSITIVE_QUERY_PROHIBITED",
      "TikHub research cannot search for contact details, addresses, or background checks.",
    );
  }
  return normalized;
}

export class TikHubProvider {
  readonly id = "tikhub" as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: TikHubProviderOptions) {
    this.apiKey = options.apiKey.trim();
    if (!this.apiKey) throw new Error("A TikHub API key is required.");
    this.baseUrl = validatedBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1_000 || this.timeoutMs > 60_000) {
      throw new Error("TikHub timeout must be from 1000 to 60000 milliseconds.");
    }
  }

  private async request(
    path: string,
    init: RequestInit,
    signal?: AbortSignal,
    authenticated = true,
  ): Promise<JsonRecord> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          ...(authenticated ? { authorization: `Bearer ${this.apiKey}` } : {}),
          accept: "application/json",
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
        redirect: "error",
        signal: combined,
      });
    } catch (error) {
      throw new TikHubProviderError(
        "TIKHUB_UNAVAILABLE",
        error instanceof Error && error.name === "TimeoutError"
          ? "TikHub request timed out."
          : "TikHub request failed before a response was received.",
      );
    }
    if (!response.ok) {
      throw new TikHubProviderError(
        response.status === 401 || response.status === 403
          ? "TIKHUB_AUTH_FAILED"
          : response.status === 429
            ? "TIKHUB_RATE_LIMITED"
            : "TIKHUB_REQUEST_FAILED",
        `TikHub request failed with HTTP ${response.status}.`,
      );
    }
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_RESPONSE_BYTES) {
      throw new TikHubProviderError(
        "TIKHUB_RESPONSE_TOO_LARGE",
        "TikHub response exceeded the local Agent limit.",
      );
    }
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
      throw new TikHubProviderError(
        "TIKHUB_RESPONSE_TOO_LARGE",
        "TikHub response exceeded the local Agent limit.",
      );
    }
    const payload = record(JSON.parse(text));
    if (!payload) {
      throw new TikHubProviderError(
        "TIKHUB_RESPONSE_INVALID",
        "TikHub returned an invalid JSON object.",
      );
    }
    const code = number(payload.code);
    if (code !== null && code !== 0 && code !== 200) {
      throw new TikHubProviderError(
        "TIKHUB_PROVIDER_REJECTED",
        `TikHub rejected the provider request with code ${code}.`,
      );
    }
    return payload;
  }

  async checkHealth(signal?: AbortSignal): Promise<{ status: "ok" }> {
    const payload = await this.request(
      "/api/v1/health/check",
      { method: "GET" },
      signal,
      false,
    );
    if (payload.status !== "ok") {
      throw new TikHubProviderError(
        "TIKHUB_HEALTH_FAILED",
        "TikHub liveness readback did not report ok.",
      );
    }
    return { status: "ok" };
  }

  async checkCredential(signal?: AbortSignal): Promise<{ authorized: true }> {
    const payload = await this.request(
      "/api/v1/tikhub/user/get_user_info",
      { method: "GET" },
      signal,
    );
    if (!record(payload.api_key_data) || !record(payload.user_data)) {
      throw new TikHubProviderError(
        "TIKHUB_CREDENTIAL_READBACK_INVALID",
        "TikHub credential readback did not contain the expected account envelope.",
      );
    }
    return { authorized: true };
  }

  async searchProfiles(
    input: {
      platform: TikHubProfilePlatform;
      query: string;
      maximumResults: number;
    },
    signal: AbortSignal,
  ): Promise<readonly TikHubPublicProfileObservation[]> {
    const query = validatedQuery(input.query);
    if (
      !Number.isInteger(input.maximumResults) ||
      input.maximumResults < 1 ||
      input.maximumResults > 10
    ) {
      throw new TikHubProviderError(
        "TIKHUB_RESULT_LIMIT_INVALID",
        "TikHub profile search permits 1-10 normalized results.",
      );
    }
    const encoded = encodeURIComponent(query);
    const request =
      input.platform === "douyin"
        ? {
            path: "/api/v1/douyin/search/fetch_user_search",
            init: {
              method: "POST",
              body: JSON.stringify({
                keyword: query,
                cursor: 0,
                douyin_user_fans: "",
                douyin_user_type: "",
                search_id: "",
              }),
            },
          }
        : input.platform === "tiktok"
          ? {
              path: `/api/v1/tiktok/web/fetch_search_user?keyword=${encoded}&cursor=0&search_id=`,
              init: { method: "GET" },
            }
          : input.platform === "weibo"
            ? {
                path: `/api/v1/weibo/web_v2/fetch_user_search?query=${encoded}&page=1`,
                init: { method: "GET" },
              }
            : {
                path: `/api/v1/threads/web/search_profiles?query=${encoded}`,
                init: { method: "GET" },
              };
    const retrievedAt = new Date().toISOString();
    const payload = await this.request(request.path, request.init, signal);
    const providerRequestID = firstString(payload, ["request_id"]);
    return candidateRecords(payload, input.platform)
      .map((item) =>
        normalizeProfile(item, input.platform, providerRequestID, retrievedAt),
      )
      .filter((item): item is TikHubPublicProfileObservation => item !== null)
      .slice(0, input.maximumResults);
  }
}
