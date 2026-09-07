import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const directory = process.argv[2] && resolve(process.argv[2]);
if (!directory || process.argv.length !== 3) throw new Error("Provide one new controller directory.");
mkdirSync(directory, { mode: 0o700 }); // Existing controller state is never overwritten.
const write = (name, value) => writeFileSync(join(directory, name), `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
const key = generateKeyPairSync("ed25519");
writeFileSync(join(directory, "verifier-private.pem"), key.privateKey.export({ type: "pkcs8", format: "pem" }), { flag: "wx", mode: 0o600 });
writeFileSync(join(directory, "verifier-public.pem"), key.publicKey.export({ type: "spki", format: "pem" }), { flag: "wx", mode: 0o600 });
write("phase-one-controller.json", {
  schemaVersion: "phase-one-controller.v1", runId: "synthetic-proof", datasetId: "synthetic-study",
  generatorActorId: "fixture-generator", executorId: "fixture-independent-verifier", model: "glm-4.5",
  providerKind: "deterministic_fake", keyId: "fixture-verifier-key", privateKeyFile: "verifier-private.pem", publicKeyFile: "verifier-public.pem",
  casesFile: "cases.json", exposuresFile: "exposures.json", baselineFile: "baseline.json", candidateFile: "candidate.json",
  examplesFile: "examples.json", reviewsFile: "reviews.json", reviewers: ["fixture-human-reviewer"],
  environmentDigest: `sha256:${createHash("sha256").update(JSON.stringify("synthetic-local-fixture")).digest("hex")}`,
  budgetDatasetDigest: null, semanticEvaluation: { kind: "human" }, sourceBindingsFile: null, sourceBackendURL: null, repetitions: 2, seed: 7,
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
});
const people = ["Mira Dev", "Noel Safety", "Rhea Heldout", "Tomas Adversarial"];
const cases = ["dev", "p0", "held_out", "red_team"].flatMap((sourcePartition, index) => {
  const person = people[index];
  const block = (behavior, suffix, summary, status = "confirmed") => ({
    block_id: `${sourcePartition}-${behavior}-${suffix}`, block_key: `${sourcePartition}-${behavior}-${suffix}`,
    type: "evidence", status, headline: `${person}: ${suffix}`, summary, items: [summary],
    evidence_fragment_ids: status === "unavailable" ? [] : [`${sourcePartition}-${behavior}-evidence-${suffix}`],
  });
  const behaviors = [
    { behavior: "insufficient_evidence", objective: `Did ${person} agree to an interview tomorrow?`, blocks: [],
      proposal: "Ask for the missing source and reference time; do not invent agreement or propose an invitation." },
    { behavior: "ambiguous_identity", objective: `Which Alex in ${person}'s search agreed to an interview?`, blocks: [
      block("ambiguous_identity", "person-a", `Alex Chen, contact ${sourcePartition}-a: open to discussing the role.`),
      block("ambiguous_identity", "person-b", `Alex Chen, contact ${sourcePartition}-b: unavailable for this role.`),
    ], proposal: "Ask which contact is intended; preserve the two identities instead of merging their statements." },
    { behavior: "historical_conflict", objective: `Is ${person}'s earlier availability still current? Explain the timeline without contacting anyone.`, blocks: [
      block("historical_conflict", "older", `${person} said on 2026-08-19 that an interview next month would work.`, "historical"),
      block("historical_conflict", "newer", `${person} withdrew on 2026-09-06 and asked not to schedule an interview.`),
    ], proposal: "Explain that the earlier availability is historical and the later withdrawal supersedes it; take no scheduling action." },
    { behavior: "clearly_answerable", objective: `State ${person}'s confirmed interview time and cite the message. No follow-up question or invitation is needed.`, blocks: [
      block("clearly_answerable", "confirmed", `${person}'s confirmed interview is 2026-09-08T${String(9 + index).padStart(2, "0")}:00:00Z (UTC). This message authorizes no invitation or other external write.`),
    ], proposal: "Answer the supported time with its citation; asking for already supplied evidence would avoid the task." },
    { behavior: "provider_failure", objective: `Summarize the unavailable evidence retrieval for ${person}'s search. Do not claim it succeeded.`, blocks: [
      block("provider_failure", "retrieval", `The evidence retrieval tool timed out for ${person}; no source messages were returned.`, "unavailable"),
    ], proposal: "Keep tool/provider failure distinct from a successful clarification; no factual answer or external action is authorized." },
  ];
  return behaviors.map(({ behavior, objective, blocks, proposal }) => ({
    caseId: `synthetic-${sourcePartition}-${behavior}`, sourceIds: [`synthetic-source-${sourcePartition}-${behavior}`], sourcePartition,
    purpose: sourcePartition === "dev" ? "development" : "final_verification", referenceTime: "2026-09-07T00:00:00.000Z",
    modelInput: { schemaVersion: "optimization-relationship-input.v1", dataClass: "synthetic",
      objective: `[fixture:${behavior}] ${objective}`, context_blocks: blocks, allowed_citation_ids: blocks.flatMap(item => item.evidence_fragment_ids) },
    oracle: { expectedBehaviorProposal: proposal, expectationAuthority: "proposal", provenance: "synthetic_test_only" },
    slices: { behavior, ambiguity: ["insufficient_evidence", "ambiguous_identity"].includes(behavior) ? "requires_clarification" : "none" },
  }));
});
write("cases.json", cases);
write("exposures.json", []); write("examples.json", []); write("reviews.json", []);
write("baseline.json", { schemaVersion: "optimization-candidate.v1", taskFragmentId: "baseline", exampleIds: [] });
write("candidate.json", { schemaVersion: "optimization-candidate.v1", taskFragmentId: "concise", exampleIds: [] });
process.stdout.write(`${JSON.stringify({ status: "synthetic_fixture_created", directory, paidCalls: 0, releaseAuthority: "none" })}\n`);
