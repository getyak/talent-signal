import { describe, expect, it } from "vitest";

import type { SafeProjectionEnvelopeV1 } from "../contracts.js";
import { opikExperimentIdentity } from "./opikTransport.js";

const digest = (character: string) => `sha256:${character.repeat(64)}` as const;

function envelope(
  overrides: Partial<SafeProjectionEnvelopeV1> = {},
): SafeProjectionEnvelopeV1 {
  return {
    schemaVersion: "safe-opik-projection.v1",
    policyVersion: "safe-export.v1",
    projectName: "talent-signal",
    datasetName: "p0-release",
    datasetDigest: digest("1"),
    runId: "evaluation-run-1",
    manifestDigest: digest("2"),
    scenarioId: "TS-P0-001",
    scenarioRevision: "1",
    scenarioDigest: digest("3"),
    profileId: "control-plane-v1",
    profileVersion: "1",
    profileDigest: digest("4"),
    agentDefinitionId: "pursuit-agent",
    agentDefinitionVersion: "1",
    agentDefinitionDigest: digest("5"),
    attemptId: "attempt-1",
    trialNumber: 1,
    mode: "control_plane_replay",
    systemUnderTest: ["agent_policy"],
    dataClass: "synthetic_shareable",
    exportDecision: "content_allowed",
    trace: [],
    scores: [],
    opaqueTraceRef: "trace-1",
    ...overrides,
  };
}

describe("Opik experiment identity", () => {
  it("separates agent content, profile content, and distinct evaluation trials", () => {
    const baseline = opikExperimentIdentity(envelope());
    const changedAgent = opikExperimentIdentity(
      envelope({ agentDefinitionDigest: digest("6") }),
    );
    const changedProfile = opikExperimentIdentity(envelope({ profileDigest: digest("7") }));
    const changedTrial = opikExperimentIdentity(envelope({ trialNumber: 2 }));

    expect(changedAgent.name).not.toBe(baseline.name);
    expect(changedProfile.name).not.toBe(baseline.name);
    expect(changedTrial.name).not.toBe(baseline.name);
    expect(changedAgent.config.agent_definition_version).toBe(
      baseline.config.agent_definition_version,
    );
    expect(changedAgent.config.agent_definition_digest).not.toBe(
      baseline.config.agent_definition_digest,
    );
    expect(changedProfile.config.profile_digest).not.toBe(baseline.config.profile_digest);
    expect(baseline.config.trial_number).toBe("1");
    expect(changedTrial.config.trial_number).toBe("2");
  });
});
