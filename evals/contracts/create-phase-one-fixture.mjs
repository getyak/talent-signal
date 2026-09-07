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
write("cases.json", ["dev", "p0", "held_out", "red_team"].map((sourcePartition, index) => ({
  caseId: `synthetic-case-${index}`, sourceIds: [`synthetic-source-${index}`], sourcePartition,
  purpose: sourcePartition === "dev" ? "development" : "final_verification", referenceTime: "2026-09-07T00:00:00.000Z",
  modelInput: { schemaVersion: "optimization-relationship-input.v1", dataClass: "synthetic",
    objective: `Which evidence and time supports synthetic case ${index}?`, context_blocks: [], allowed_citation_ids: [] },
  oracle: { expectedBehaviorProposal: "Ask for the missing source and time without inventing facts." }, slices: { ambiguity: "missing_source" },
})));
write("exposures.json", []); write("examples.json", []); write("reviews.json", []);
write("baseline.json", { schemaVersion: "optimization-candidate.v1", taskFragmentId: "baseline", exampleIds: [] });
write("candidate.json", { schemaVersion: "optimization-candidate.v1", taskFragmentId: "concise", exampleIds: [] });
process.stdout.write(`${JSON.stringify({ status: "synthetic_fixture_created", directory, paidCalls: 0, releaseAuthority: "none" })}\n`);
