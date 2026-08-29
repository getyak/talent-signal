import { describe, expect, it } from "vitest";
import {
  analyzeConversation,
  deriveInsight,
  sampleConversation,
} from "./signals";

describe("analyzeConversation", () => {
  it("extracts explicit facts from the seeded candidate conversation", () => {
    const result = analyzeConversation(sampleConversation);

    expect(result.evidence.map((item) => item.id)).toEqual([
      "competing-offer",
      "deadline",
      "preference",
      "availability",
    ]);
    expect(result.actions.map((action) => action.evidenceId)).toEqual([
      "competing-offer",
      "preference",
    ]);
    expect(result.insight.verdict).toBe("Resolve blocker");
    expect(
      result.evidence.find((item) => item.id === "deadline")?.ambiguities,
    ).toEqual([
      "确认期限前，请先明确来源日期与时区。",
    ]);
    expect(
      result.evidence.find((item) => item.id === "availability")?.ambiguities,
    ).toEqual([
      "安排日程前，请先明确准确日期、当地时间与时区。",
    ]);
  });

  it("keeps an ambiguous relative date outside action authority", () => {
    const result = analyzeConversation(
      "I need to decide Friday and can speak Tuesday afternoon.",
    );

    expect(result.evidence).toHaveLength(2);
    expect(result.evidence.every((item) => item.ambiguities.length > 0)).toBe(
      true,
    );
    expect(result.actions).toEqual([]);
    expect(result.insight.nextAction).toContain("准确日期与时区");
  });

  it("acknowledges an explicit timezone without treating it as a source date", () => {
    const result = analyzeConversation(
      "I need to decide Friday and can speak Tuesday afternoon. Timezone is Singapore.",
    );

    expect(result.evidence).toHaveLength(2);
    expect(result.actions).toEqual([]);
    expect(result.insight.rationale).toBe(
      "笔记写明了时区，但缺少来源日期，因此相对时间窗口仍未解决。",
    );
    expect(result.insight.nextAction).toBe(
      "确认期限或准备会议前，请先澄清准确的日历日期。",
    );
    expect(result.evidence[0]?.ambiguities[0]).toContain(
      "保留已声明的时区",
    );
    expect(result.evidence[1]?.ambiguities[0]).toContain(
      "保留已声明的时区",
    );
  });

  it("returns a wait insight when the note has no actionable evidence", () => {
    const result = analyzeConversation(
      "The conversation was thoughtful and we agreed to stay in touch.",
    );

    expect(result.evidence).toEqual([]);
    expect(result.actions).toEqual([]);
    expect(result.insight.verdict).toBe("Wait");
  });
});

describe("deriveInsight", () => {
  it("advances when availability is the only explicit signal", () => {
    const result = deriveInsight([
      {
        id: "availability",
        label: "Friday availability",
        excerpt: "Friday afternoon works",
        modality: "commitment",
        speaker: "candidate",
        ambiguities: [],
      },
    ]);

    expect(result.verdict).toBe("Advance");
  });
});
