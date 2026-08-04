import { describe, expect, it } from "vitest";
import { parseModelEvidence } from "./ai-evidence";
import { buildAnalysis } from "./signals";

const conversation =
  "I need to decide by Wednesday, but I can speak Tuesday afternoon.";

describe("parseModelEvidence", () => {
  it("keeps schema-valid evidence with an exact source quote", () => {
    const result = parseModelEvidence(
      JSON.stringify({
        evidence: [
          {
            kind: "deadline",
            label: "Decision deadline",
            excerpt: "decide by Wednesday",
            modality: "commitment",
            speaker: "candidate",
            ambiguities: [],
          },
        ],
      }),
      conversation,
    );

    expect(result).toEqual([
      {
        id: "deadline",
        label: "Decision deadline",
        excerpt: "decide by Wednesday",
        modality: "commitment",
        speaker: "candidate",
        ambiguities: [],
      },
    ]);
  });

  it("drops unsupported or invented evidence instead of repairing it", () => {
    const result = parseModelEvidence(
      JSON.stringify({
        evidence: [
          {
            kind: "deadline",
            label: "Decision deadline",
            excerpt: "The candidate will decide on Wednesday.",
            modality: "commitment",
            speaker: "candidate",
            ambiguities: [],
          },
          {
            kind: "personality",
            label: "Personality",
            excerpt: "I need to decide",
            modality: "explicit-fact",
            speaker: "candidate",
            ambiguities: [],
          },
        ],
      }),
      conversation,
    );

    expect(result).toEqual([]);
  });

  it("prevents ambiguous speaker evidence from becoming an action", () => {
    const evidence = parseModelEvidence(
      JSON.stringify({
        evidence: [
          {
            kind: "availability",
            label: "Tuesday availability",
            excerpt: "speak Tuesday afternoon",
            modality: "commitment",
            speaker: "unknown",
            ambiguities: ["The note does not identify the speaker."],
          },
        ],
      }),
      conversation,
    );

    const result = buildAnalysis(evidence);
    expect(result.evidence).toHaveLength(1);
    expect(result.actions).toEqual([]);
  });
});
