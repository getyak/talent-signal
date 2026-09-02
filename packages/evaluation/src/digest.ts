import { createHash } from "node:crypto";

import type { Sha256Digest } from "./contracts.js";
import { canonicalJson, withoutTopLevelContentDigest } from "./canonicalJson.js";

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function sha256Bytes(value: Uint8Array | string): Sha256Digest {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function digestCanonicalJson(value: unknown): Sha256Digest {
  return sha256Bytes(canonicalJson(value));
}

export function digestContentDocument(value: object): Sha256Digest {
  return digestCanonicalJson(withoutTopLevelContentDigest(value));
}

export function hasValidSha256Format(value: unknown): value is Sha256Digest {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

export function contentDigestMatches(value: object & { contentDigest: Sha256Digest }): boolean {
  return value.contentDigest === digestContentDocument(value);
}

export function withContentDigest<T extends object>(
  value: T,
): Omit<T, "contentDigest"> & { contentDigest: Sha256Digest } {
  const content = withoutTopLevelContentDigest(value);
  return { ...content, contentDigest: digestCanonicalJson(content) };
}
