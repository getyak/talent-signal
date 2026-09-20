import { describe, expect, it } from "vitest";
import {
  accountDisplayName,
  accountInitials,
  accountMenuLabel,
  accountWorkspaceLabel,
} from "./workspace-account";

describe("account footer identity", () => {
  it("derives stable initials from a real name or email", () => {
    expect(accountInitials("陈曦")).toBe("陈");
    expect(accountInitials("Wei Zhang")).toBe("WZ");
    expect(accountInitials("owner@example.com")).toBe("O");
    expect(accountInitials("  ")).toBe("TS");
    expect(accountInitials(null)).toBe("TS");
  });

  it("keeps the account name primary and the workspace secondary", () => {
    expect(
      accountDisplayName({
        accountName: "owner@example.com",
        workspaceName: "Alpha 寻访测试",
        avatarUrl: null,
      }),
    ).toBe("owner");
    expect(
      accountWorkspaceLabel({
        accountName: "owner",
        workspaceName: "Alpha 寻访测试",
        avatarUrl: null,
      }),
    ).toBe("Alpha 寻访测试");
    expect(
      accountWorkspaceLabel({
        accountName: "owner",
        workspaceName: null,
        avatarUrl: null,
      }),
    ).toBe("个人工作区");
    expect(
      accountMenuLabel({
        accountName: "owner",
        workspaceName: null,
        avatarUrl: null,
      }),
    ).toBe("owner · 个人工作区");
  });
});
