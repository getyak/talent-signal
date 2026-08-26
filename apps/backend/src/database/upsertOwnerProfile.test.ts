import { describe, expect, it } from "vitest";

import {
  ownerProfile,
  parseOwnerProfileArguments,
} from "./upsertOwnerProfile.js";

describe("owner profile onboarding", () => {
  it("requires an exact account scope instead of globally seeding a person", () => {
    expect(() => parseOwnerProfileArguments([])).toThrow(
      "owner profiles are never seeded globally",
    );
    expect(
      parseOwnerProfileArguments([
        "--account-slug",
        "personal-owner",
        "--user-id",
        "937f3b77-c53b-4131-bf30-8cb39f6a834f",
      ]),
    ).toEqual({
      accountSlug: "personal-owner",
      userId: "937f3b77-c53b-4131-bf30-8cb39f6a834f",
    });
  });

  it("labels the introduction as owner-authored rather than inferred evidence", () => {
    expect(ownerProfile.displayLabel).toBe("cubxxw");
    expect(ownerProfile.summary).toContain("工作区所有者明确要求写入");
    expect(ownerProfile.summary).toContain("不来自候选人会话");
    expect(ownerProfile.summary).toContain("模型推断");
  });
});
