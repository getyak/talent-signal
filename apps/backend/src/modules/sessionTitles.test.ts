import { describe, expect, it } from "vitest";

import {
  canonicalizeSessionTitle,
  firstTurnSessionTitle,
} from "./sessionTitles.js";

describe("Session title canonicalization", () => {
  it("keeps a specific proposal on one bounded line", () => {
    const title = canonicalizeSessionTitle(
      "  准备 Maya 的 CPO 初聊提纲\n并整理问题  ",
    );
    expect(title).toBe("准备 Maya 的 CPO 初聊提纲 并整理问题");
    expect(Array.from(title ?? "")).toHaveLength(24);
  });

  it("bounds Unicode titles to the response contract", () => {
    const title = canonicalizeSessionTitle(`整理${"🧭".repeat(40)}`);
    expect(title).toBe(`整理${"🧭".repeat(30)}`);
    expect(Array.from(title ?? "")).toHaveLength(32);
  });

  it.each(["Reply", " Answer: ", "你好。", "工作台对话"])(
    "rejects generic model title %s and uses the objective",
    (proposed) => {
      expect(
        firstTurnSessionTitle("比较 Maya 的两版外联话术", proposed),
      ).toBe("比较 Maya 的两版外联话术");
    },
  );

  it("gives a greeting a stable non-generic fallback", () => {
    expect(firstTurnSessionTitle("你好", "回复")).toBe("简单聊两句");
    expect(firstTurnSessionTitle("Hello", "Reply")).toBe("Quick hello");
  });
});
