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
      "Resolve the source date and timezone before confirming this deadline.",
    ]);
    expect(
      result.evidence.find((item) => item.id === "availability")?.ambiguities,
    ).toEqual([
      "Resolve the exact date, local time, and timezone before scheduling.",
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
    expect(result.insight.nextAction).toContain("exact date and timezone");
  });

  it("acknowledges an explicit timezone without treating it as a source date", () => {
    const result = analyzeConversation(
      "I need to decide Friday and can speak Tuesday afternoon. Timezone is Singapore.",
    );

    expect(result.evidence).toHaveLength(2);
    expect(result.actions).toEqual([]);
    expect(result.insight.rationale).toBe(
      "The note states a timezone, but the source date is missing, so the relative time window is unresolved.",
    );
    expect(result.insight.nextAction).toBe(
      "Clarify the exact calendar date before confirming a deadline or preparing a meeting.",
    );
    expect(result.evidence[0]?.ambiguities[0]).toContain(
      "Keep the stated timezone attached.",
    );
    expect(result.evidence[1]?.ambiguities[0]).toContain(
      "Keep the stated timezone attached.",
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
