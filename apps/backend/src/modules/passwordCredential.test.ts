import { describe, expect, it } from "vitest";

import {
  encodePasswordCredential,
  verifyPasswordCredential,
} from "./passwordCredential.js";

describe("password credentials", () => {
  it("stores a versioned scrypt value and verifies without plaintext", async () => {
    const encoded = await encodePasswordCredential(
      "quiet-context",
      "00112233445566778899aabbccddeeff",
    );

    expect(encoded).toMatch(/^scrypt\$v1\$/);
    expect(encoded).not.toContain("quiet-context");
    await expect(
      verifyPasswordCredential("quiet-context", encoded),
    ).resolves.toBe(true);
    await expect(
      verifyPasswordCredential("wrong-context", encoded),
    ).resolves.toBe(false);
  });

  it("fails closed for malformed stored values", async () => {
    await expect(
      verifyPasswordCredential("quiet-context", "not-a-credential"),
    ).resolves.toBe(false);
  });
});
