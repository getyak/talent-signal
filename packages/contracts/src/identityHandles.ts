import { IDENTITY_HANDLE_TYPES } from "./constants.js";

export type IdentityHandleType = (typeof IDENTITY_HANDLE_TYPES)[number];

export type ParsedIdentityHandle = {
  type: IdentityHandleType;
  value: string;
};

const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
]);

function normalizeUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (
        key.toLowerCase().startsWith("utm_") ||
        TRACKING_PARAMETERS.has(key)
      ) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeIdentityHandle(
  type: IdentityHandleType,
  value: string,
): string | null {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized) {
    return null;
  }
  switch (type) {
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
        ? normalized.toLowerCase()
        : null;
    case "phone": {
      const phone = normalized
        .replace(/^00/, "+")
        .replace(/[\s().-]/g, "");
      return /^\+?[0-9]{6,20}$/.test(phone) ? phone : null;
    }
    case "linkedin_url":
    case "public_profile_url":
      return normalizeUrl(normalized);
    case "wechat":
    case "source_native_id":
      return normalized;
  }
}

function prefixedHandle(value: string): ParsedIdentityHandle | null {
  const separator = value.indexOf(":");
  if (separator <= 0) {
    return null;
  }
  const prefix = value.slice(0, separator).trim().toLowerCase();
  const rawValue = value.slice(separator + 1).trim();
  const type =
    prefix === "email" || prefix === "邮箱"
      ? "email"
      : prefix === "phone" || prefix === "tel" || prefix === "手机"
        ? "phone"
        : prefix === "wechat" || prefix === "weixin" || prefix === "微信"
          ? "wechat"
          : prefix === "linkedin"
            ? "linkedin_url"
            : prefix === "profile" || prefix === "url"
              ? "public_profile_url"
              : prefix === "source"
                ? "source_native_id"
                : null;
  if (!type || !normalizeIdentityHandle(type, rawValue)) {
    return null;
  }
  return { type, value: rawValue };
}

export function parseIdentityHandleQuery(
  value: string,
): ParsedIdentityHandle | null {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized) {
    return null;
  }
  const prefixed = prefixedHandle(normalized);
  if (prefixed) {
    return prefixed;
  }
  if (normalizeIdentityHandle("email", normalized)) {
    return { type: "email", value: normalized };
  }
  if (normalizeIdentityHandle("phone", normalized)) {
    return { type: "phone", value: normalized };
  }
  const url = normalizeUrl(normalized);
  if (url) {
    return {
      type: new URL(url).hostname.includes("linkedin.com")
        ? "linkedin_url"
        : "public_profile_url",
      value: normalized,
    };
  }
  return null;
}

export function maskIdentityHandle(
  type: IdentityHandleType,
  value: string,
): string | null {
  const normalized = normalizeIdentityHandle(type, value);
  if (!normalized) {
    return null;
  }
  switch (type) {
    case "email": {
      const [local, domain] = normalized.split("@");
      return `${local?.slice(0, 1) ?? ""}•••@${domain ?? ""}`;
    }
    case "phone":
      return `•••• ${normalized.slice(-4)}`;
    case "wechat":
      return normalized.length <= 3
        ? `${normalized.slice(0, 1)}•••`
        : `${normalized.slice(0, 2)}•••${normalized.slice(-2)}`;
    case "linkedin_url":
    case "public_profile_url": {
      const url = new URL(normalized);
      const segments = url.pathname.split("/").filter(Boolean);
      return segments.length > 0
        ? `${url.hostname}/${segments[0]}/…`
        : `${url.hostname}/…`;
    }
    case "source_native_id":
      return `••••${normalized.slice(-4)}`;
  }
}
