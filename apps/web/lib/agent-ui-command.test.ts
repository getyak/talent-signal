import { describe, expect, it } from "vitest";

import { resolveAgentUiCommand } from "./agent-ui-command";

describe("resolveAgentUiCommand", () => {
  it.each([
    ["Create a contact", "create_person"],
    ["创建一个联系人", "create_person"],
    ["Add a source", "add_source"],
    ["导入文件", "add_source"],
    ["Review a possible duplicate", "review_duplicate"],
    ["审阅可能的重复联系人", "review_duplicate"],
    ["Review pending changes", "review_changes"],
    ["审阅待确认的变化", "review_changes"],
    ["Open the person page", "open_person"],
    ["打开联系人档案", "open_person"],
    ["Show the next move", "open_next_move"],
    ["查看下一步", "open_next_move"],
  ])("maps %s to the typed page capability %s", (input, expected) => {
    expect(resolveAgentUiCommand(input)).toBe(expected);
  });

  it.each([
    "How should I create a contact?",
    "What changed in the latest source?",
    "Should I add another source?",
    "Summarize the next move.",
  ])("does not intercept an ordinary relationship question: %s", (input) => {
    expect(resolveAgentUiCommand(input)).toBeNull();
  });
});
