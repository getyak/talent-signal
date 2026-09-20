import { describe, expect, it } from "vitest";
import { createVisibleTextFilter } from "./visibleTextFilter.js";
import { splitFirstTurnSessionTitle } from "./claudeChatProvider.js";

function stream(deltas: readonly string[], titleRequested = true): string {
  const filter = createVisibleTextFilter(titleRequested);
  let visible = "";
  for (const delta of deltas) visible += filter.push(delta);
  visible += filter.flush();
  return visible;
}

describe("incremental visible text filter", () => {
  it("passes text through when the host did not request a title", () => {
    expect(stream(["<session_title>", "不应出现", "</session_title>", "\n\n正文"], false))
      .toBe("<session_title>不应出现</session_title>\n\n正文");
  });

  it("withholds title metadata split across arbitrary delta boundaries", () => {
    const title = "<session_title>比较两版外联话术</session_title>\n\n这里是比较结果。";
    const cases: Array<{ deltas: string[]; expected: string }> = [
      { deltas: ["<ses", "sion_title>比较两版", "外联话术</sess", "ion_title>\n\n这里", "是比较结果。"], expected: "这里是比较结果。" },
      { deltas: ["<", "s", "e", "s", "s", "i", "o", "n", "_", "t", "i", "t", "l", "e", ">", "标", "题", "</session_title>", "\n\n正文"], expected: "正文" },
      { deltas: [title], expected: "这里是比较结果。" },
    ];
    for (const { deltas, expected } of cases) {
      expect(stream(deltas)).toBe(expected);
    }
  });

  it("matches the canonical final parser for ordinary replies", () => {
    const cases = [
      "普通回复",
      "  普通回复  ",
      "<session_title>标题</session_title>\n\n后续回复",
      "<session_title>标题</session_title>\n\n<session_title>标题二</session_title>\n\n正文",
    ];
    for (const text of cases) {
      const filtered = stream(text.split(""));
      expect(filtered).toBe(splitFirstTurnSessionTitle(text, "回退").body);
    }
  });

  it("does not expose an unclosed metadata line as prose", () => {
    const filter = createVisibleTextFilter(true);
    const first = filter.push("<session_title>还没结束的标题");
    expect(first).toBe("");
    expect(filter.push("\n真正的回答在这里")).toBe("");
    expect(filter.flush()).toBe("真正的回答在这里");
  });

  it("treats a lone marker prefix at end of stream as ordinary text", () => {
    expect(stream(["<ses"])).toBe("<ses");
  });

  it("emits a legitimately similar but non-marker tag", () => {
    const filter = createVisibleTextFilter(true);
    expect(filter.push("<div>hi")).toBe("<div>hi");
  });
});
