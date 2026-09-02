import type { JsonValue } from "./contracts.js";

export class CanonicalJsonError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CanonicalJsonError";
  }
}

function canonicalizeInternal(value: unknown, seen: Set<object>, path: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CanonicalJsonError(`${path} contains a non-finite number`);
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new CanonicalJsonError(`${path} contains a cycle`);
    }
    seen.add(value);
    const result = value.map((item, index) => canonicalizeInternal(item, seen, `${path}/${index}`));
    seen.delete(value);
    return result;
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      throw new CanonicalJsonError(`${path} contains a cycle`);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CanonicalJsonError(`${path} contains a non-plain object`);
    }

    seen.add(value);
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined) {
        throw new CanonicalJsonError(`${path}/${key} is undefined`);
      }
      result[key] = canonicalizeInternal(item, seen, `${path}/${key}`);
    }
    seen.delete(value);
    return result;
  }

  throw new CanonicalJsonError(`${path} contains unsupported ${typeof value}`);
}

export function canonicalizeJson(value: unknown): JsonValue {
  return canonicalizeInternal(value, new Set<object>(), "$");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value));
}

export function withoutTopLevelContentDigest<T extends object>(value: T): Omit<T, "contentDigest"> {
  const { contentDigest: _contentDigest, ...content } = value as T & { contentDigest?: unknown };
  return content;
}
