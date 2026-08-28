import { describe, expect, it } from "vitest";

import { proposeAgentContactDraft } from "./agent-contact-intake";

describe("proposeAgentContactDraft", () => {
  it("stages a concise English contact message without granting write authority", () => {
    expect(
      proposeAgentContactDraft(
        "Add Maya Chen for the Chief Product Officer search, maya@brightway.com, referred by Elena and open next week.",
      ),
    ).toEqual({
      identityClue: "maya@brightway.com",
      name: "Maya Chen",
      relationshipContext: "Chief Product Officer search",
      sourceNote:
        "Add Maya Chen for the Chief Product Officer search, maya@brightway.com, referred by Elena and open next week.",
      trigger: "explicit_add",
    });
  });

  it("supports compact Chinese intake", () => {
    expect(
      proposeAgentContactDraft(
        "添加陈雅宁，项目：首席产品官招聘，微信：yaning-chen，下周二可以聊。",
      ),
    ).toEqual({
      identityClue: "微信：yaning-chen",
      name: "陈雅宁",
      relationshipContext: "首席产品官招聘",
      sourceNote:
        "添加陈雅宁，项目：首席产品官招聘，微信：yaning-chen，下周二可以聊。",
      trigger: "explicit_add",
    });
  });

  it("stages high-precision name and identity input without a command", () => {
    expect(
      proposeAgentContactDraft(
        "Maya Chen, maya@brightway.com, Chief Product Officer",
      ),
    ).toEqual({
      identityClue: "maya@brightway.com",
      name: "Maya Chen",
      relationshipContext: "Chief Product Officer",
      sourceNote: "Maya Chen, maya@brightway.com, Chief Product Officer",
      trigger: "identity_clue",
    });
  });

  it("stages high-precision Chinese input without a command", () => {
    expect(
      proposeAgentContactDraft(
        "陈晓 xiao.chen@example.com，产品负责人搜索",
      ),
    ).toMatchObject({
      identityClue: "xiao.chen@example.com",
      name: "陈晓",
      relationshipContext: "产品负责人搜索",
      trigger: "identity_clue",
    });
  });

  it("keeps a concise relationship label without requiring form-like suffixes", () => {
    expect(
      proposeAgentContactDraft("Add Noor Vega for Design"),
    ).toMatchObject({
      name: "Noor Vega",
      relationshipContext: "Design",
    });
  });

  it("keeps incomplete explicit intent reviewable instead of inventing a name", () => {
    expect(
      proposeAgentContactDraft("Create a contact for the CFO search"),
    ).toMatchObject({
      name: "",
      relationshipContext: "CFO search",
      trigger: "explicit_add",
    });
  });

  it("does not turn an ordinary relationship question into contact intake", () => {
    expect(
      proposeAgentContactDraft(
        "What should I remember before the next conversation with Maya?",
      ),
    ).toBeNull();
  });

  it("does not infer contact creation from an identity clue alone", () => {
    expect(
      proposeAgentContactDraft("Can you check whether maya@brightway.com is current?"),
    ).toBeNull();
  });

  it("does not turn a name plus identity question into contact intake", () => {
    expect(
      proposeAgentContactDraft(
        "Can you check Maya Chen, maya@brightway.com?",
      ),
    ).toBeNull();
  });

  it("leaves narrative contact language for the bounded model layer", () => {
    expect(
      proposeAgentContactDraft(
        "Met Maya Chen, maya@brightway.com, Chief Product Officer",
      ),
    ).toBeNull();
  });
});
