import { describe, expect, it } from "vitest";

import { AgentFinalOutputSchema } from "./schemas.js";
import {
  AGENT_TOOL_CATALOG,
  agentCapabilityManifest,
  candidateOutcome,
  candidateToolNames,
} from "./toolCatalog.js";
import {
  ALL_AGENT_TOOL_NAMES,
  PERSON_RESEARCH_AGENT_TOOL_NAMES,
  PURSUIT_AGENT_TOOL_NAMES,
  RESEARCH_AGENT_TOOL_NAMES,
} from "./types.js";

describe("provider-neutral Agent capability catalog", () => {
  it("keeps no_action in the terminal protocol rather than the tool surface", () => {
    expect(ALL_AGENT_TOOL_NAMES).not.toContain("record_no_action");
    expect(Object.keys(AGENT_TOOL_CATALOG)).not.toContain("record_no_action");
    expect(
      AgentFinalOutputSchema.parse({
        outcome: "no_action",
        reason_code: "NO_MATERIAL_CHANGE",
        reason: "No governed change is supported.",
        missing_evidence_refs: [],
      }),
    ).toMatchObject({ outcome: "no_action" });
    expect(
      AgentFinalOutputSchema.safeParse({
        outcome: "no_action",
        candidate_fingerprint: "a".repeat(64),
      }).success,
    ).toBe(false);
  });

  it("assembles small definition-specific surfaces from one catalog", () => {
    expect(PURSUIT_AGENT_TOOL_NAMES).toHaveLength(3);
    expect(RESEARCH_AGENT_TOOL_NAMES).toHaveLength(3);
    expect(PERSON_RESEARCH_AGENT_TOOL_NAMES).toHaveLength(5);
    expect(candidateToolNames(PURSUIT_AGENT_TOOL_NAMES)).toEqual([
      "stage_pursuit_proposal",
    ]);
    expect(candidateToolNames(RESEARCH_AGENT_TOOL_NAMES)).toEqual([
      "create_research_artifact",
    ]);
    expect(candidateToolNames(PERSON_RESEARCH_AGENT_TOOL_NAMES)).toEqual([
      "create_person_research_artifact",
    ]);
    expect(candidateOutcome(PURSUIT_AGENT_TOOL_NAMES)).toBe("proposal");
    expect(candidateOutcome(RESEARCH_AGENT_TOOL_NAMES)).toBe("artifact");
    expect(candidateOutcome(PERSON_RESEARCH_AGENT_TOOL_NAMES)).toBe(
      "person_research_artifact",
    );
  });

  it("makes consequence, approval, reversibility, and idempotency inspectable", () => {
    const capabilities = agentCapabilityManifest(ALL_AGENT_TOOL_NAMES);
    const durable = capabilities.filter(
      (capability) => capability.consequence === "durable_candidate",
    );

    expect(capabilities).toHaveLength(11);
    expect(durable.map((capability) => capability.name)).toEqual([
      "stage_pursuit_proposal",
      "create_research_artifact",
      "create_person_research_artifact",
    ]);
    expect(
      durable.every(
        (capability) =>
          !capability.openWorld &&
          capability.reversibility === "discardable" &&
          capability.idempotency === "content_fingerprint",
      ),
    ).toBe(true);
    expect(AGENT_TOOL_CATALOG.stage_pursuit_proposal.approval).toBe(
      "human_review_before_apply",
    );
  });
});
