import { createHash } from "node:crypto";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalize(item)]),
    );
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function digestValue(value: unknown): string {
  return sha256(stableStringify(value));
}
