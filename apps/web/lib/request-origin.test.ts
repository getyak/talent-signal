import { describe, expect, it } from "vitest";

import { isAllowedMutationOrigin } from "./request-origin";

function requestHeaders(origin?: string, host = "127.0.0.1:3008") {
  return new Headers({
    host,
    ...(origin ? { origin } : {}),
  });
}

describe("mutation request origin", () => {
  it("accepts the browser origin that matches the actual Host header", () => {
    expect(
      isAllowedMutationOrigin(
        requestHeaders("http://127.0.0.1:3008"),
        true,
      ),
    ).toBe(true);
  });

  it("does not substitute an internal localhost URL for the Host header", () => {
    expect(
      isAllowedMutationOrigin(
        requestHeaders("http://localhost:3008"),
        true,
      ),
    ).toBe(false);
  });

  it("rejects cross-origin and malformed values", () => {
    expect(
      isAllowedMutationOrigin(
        requestHeaders("https://attacker.example"),
        true,
      ),
    ).toBe(false);
    expect(
      isAllowedMutationOrigin(requestHeaders("not a URL"), true),
    ).toBe(false);
  });

  it("allows a missing Origin only for non-production tooling", () => {
    expect(isAllowedMutationOrigin(requestHeaders(), false)).toBe(true);
    expect(isAllowedMutationOrigin(requestHeaders(), true)).toBe(false);
  });
});
