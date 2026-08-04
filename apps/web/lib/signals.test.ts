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
    expect(result.actions).toHaveLength(4);
    expect(result.insight.verdict).toBe("At risk");
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
