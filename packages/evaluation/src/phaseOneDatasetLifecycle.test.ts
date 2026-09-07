import { describe, expect, it } from "vitest";
import { appendPhaseOneExposure, assertPhaseOneDatasetCurrent, assertPhaseOneRetiredDevelopment, createPhaseOneDatasetLifecycle,
  freezePhaseOneDataset, PHASE_ONE_RETIRED_SEARCH_ORACLE, phaseOneDevelopmentProvenance, phaseOneGeneratorInputs,
  readPhaseOneDatasetDocument, retireAndReplacePhaseOneCases, validatePhaseOneDatasetLifecycle,
  type PhaseOneCase, type PhaseOneDatasetLifecycle, type PhaseOneExposure } from "./phaseOneDataset.js";
import { withContentDigest } from "./digest.js";

const time = "2026-09-07T00:00:00Z";
function sample(caseId: string, sourcePartition: PhaseOneCase["sourcePartition"], sourceIds = [caseId]): PhaseOneCase {
  return { caseId, sourcePartition, sourceIds, purpose: sourcePartition === "dev" ? "development" : "final_verification", referenceTime: time,
    modelInput: { objective: caseId }, oracle: { secretGold: `GOLD-${caseId}` }, slices: { language: "en" } };
}
function initial() { return createPhaseOneDatasetLifecycle("study", [sample("dev", "dev"), sample("p0", "p0"),
  sample("held-1", "held_out", ["held-source"]), sample("held-2", "held_out", ["held-source"]), sample("red", "red_team")], []); }
function expose(doc = initial(), eventId = "read-1", role: PhaseOneExposure["role"] = "developer") {
  return appendPhaseOneExposure(doc, { eventId, actorId: "owner", recordedAt: time,
    exposure: { sourceIds: ["held-source"], actorId: "generator", role, content: "input", observedAt: time } });
}
function request() { return { eventId: "replace-1", actorId: "owner", recordedAt: time,
  groups: [{ retiredCaseIds: ["held-1", "held-2"], exposureEventIds: ["read-1"], replacementCaseIds: ["new-held"] }], replacements: [sample("new-held", "held_out")] }; }
function replaced() { return retireAndReplacePhaseOneCases(expose(), request()); }
function search(doc: PhaseOneDatasetLifecycle) {
  const item = doc.cases.find(item => item.caseId === "held-1")!;
  return { ...item, oracle: PHASE_ONE_RETIRED_SEARCH_ORACLE, developmentProvenance: phaseOneDevelopmentProvenance(doc, item.caseId) };
}

describe("phase-one source exposure retirement and replenishment", () => {
  it("preserves original split, replaces the complete group, and only projects reviewed development inputs", () => {
    const doc = replaced(), current = validatePhaseOneDatasetLifecycle(doc);
    expect(current.dataset.cases.filter(item => item.caseId.startsWith("held-")).map(item => [item.sourcePartition, item.purpose])).toEqual([
      ["held_out", "development"], ["held_out", "development"]]);
    expect(current.dataset.cases.find(item => item.caseId === "new-held")?.currentPurpose).toBe("final_verification");
    expect(phaseOneGeneratorInputs(doc.cases).map(item => item.caseId)).toEqual(["dev"]);
    const projection = phaseOneGeneratorInputs(doc.cases, doc);
    expect(projection.map(item => item.caseId)).toEqual(["dev", "held-1", "held-2"]);
    expect(JSON.stringify(projection)).not.toMatch(/GOLD|oracle|new-held/);
    expect(() => assertPhaseOneRetiredDevelopment(doc, search(doc))).not.toThrow();
    expect(JSON.stringify(doc.events)).not.toContain("GOLD-");
  });

  it("logs repeated reads independently and invalidates old freeze and search proofs", () => {
    const doc = replaced(), saved = validatePhaseOneDatasetLifecycle(doc).dataset, proof = search(doc), again = expose(doc, "read-again");
    expect(again.events).toHaveLength(3); expect(again.exposures).toHaveLength(2);
    expect(() => assertPhaseOneDatasetCurrent(saved, again.cases, again.exposures)).toThrow("PHASE_ONE_DATASET_OR_EXPOSURE_STALE");
    expect(() => assertPhaseOneRetiredDevelopment(again, proof)).toThrow("PHASE_ONE_RETIREMENT_PROVENANCE_STALE");
    expect(() => expose(again, "read-again")).toThrow("PHASE_ONE_LIFECYCLE_EVENT_DUPLICATE");
  });

  it("propagates exposure through transitive sources and identical input aliases", () => {
    const a = sample("a", "held_out", ["a-source"]), b = { ...sample("b", "held_out", ["b-source", "c-source"]), modelInput: a.modelInput };
    const c = sample("c", "held_out", ["c-source"]);
    const dataset = freezePhaseOneDataset({ datasetId: "study", cases: [a, b, c], exposures: [{ sourceIds: ["a-source"], actorId: "generator", role: "generator", content: "input", observedAt: time }] });
    expect(dataset.cases.every(item => item.currentPurpose === "development")).toBe(true);
  });

  it.each([
    ["partial group", (r: ReturnType<typeof request>) => { r.groups[0]!.retiredCaseIds = ["held-1"]; }],
    ["missing replacement", (r: ReturnType<typeof request>) => { r.groups[0]!.replacementCaseIds = ["missing"]; }],
    ["wrong exposure", (r: ReturnType<typeof request>) => { r.groups[0]!.exposureEventIds = ["missing"]; }],
    ["duplicate retirement", (r: ReturnType<typeof request>) => { r.groups.push(r.groups[0]!); }],
    ["source reused", (r: ReturnType<typeof request>) => { r.replacements[0]!.sourceIds = ["held-source"]; }],
    ["input reused", (r: ReturnType<typeof request>) => { r.replacements[0]!.modelInput = { objective: "held-1" }; }],
    ["partition changed", (r: ReturnType<typeof request>) => { r.replacements[0]!.sourcePartition = "p0"; }],
    ["development replacement", (r: ReturnType<typeof request>) => { r.replacements[0]!.purpose = "development"; }],
    ["disconnected replacement group", (r: ReturnType<typeof request>) => { r.replacements.push(sample("newer-held", "held_out")); r.groups[0]!.replacementCaseIds.push("newer-held"); }],
  ])("rejects %s without mutating the prior study", (_name, change) => {
    const doc = expose(), r = request(); change(r); expect(() => retireAndReplacePhaseOneCases(doc, r)).toThrow(); expect(doc.events).toHaveLength(1);
  });

  it("requires a generator/developer exposure event before retirement", () => {
    expect(() => retireAndReplacePhaseOneCases(expose(initial(), "read-1", "judge"), request())).toThrow("PHASE_ONE_RETIREMENT_EXPOSURE_MISMATCH");
  });
  it("requires all actual exposure events including a legitimate second read", () => {
    const doc = expose(expose(), "read-2"); expect(() => retireAndReplacePhaseOneCases(doc, request())).toThrow("PHASE_ONE_RETIREMENT_EXPOSURE_MISMATCH");
    const r = request(); r.groups[0]!.exposureEventIds.push("read-2"); expect(() => retireAndReplacePhaseOneCases(doc, r)).not.toThrow();
  });
  it("fails closed on tampered raw body or a rehashed partial journal", () => {
    const doc = replaced(), changed = structuredClone(doc); changed.cases[0]!.modelInput = { objective: "changed" };
    expect(() => validatePhaseOneDatasetLifecycle(withContentDigest(changed))).toThrow("PHASE_ONE_LIFECYCLE_INITIAL_MISMATCH");
    const partial = structuredClone(doc); partial.events.shift(); expect(() => validatePhaseOneDatasetLifecycle(withContentDigest(partial))).toThrow("PHASE_ONE_LIFECYCLE_CHAIN_BROKEN");
  });
  it("requires the unchanged legacy migration anchor and rejects a hand-flipped original split", () => {
    const doc = replaced(); expect(readPhaseOneDatasetDocument("study", doc, []).exposures).toHaveLength(1);
    expect(() => readPhaseOneDatasetDocument("study", doc, doc.exposures)).toThrow("PHASE_ONE_LIFECYCLE_ANCHOR_CHANGED");
    expect(() => readPhaseOneDatasetDocument("study", doc.cases, [])).toThrow("PHASE_ONE_RETIREMENT_PROVENANCE_REQUIRED");
  });
  it("rejects final gold and edited provenance from a generator import", () => {
    const doc = replaced(), item = search(doc);
    expect(() => assertPhaseOneRetiredDevelopment(doc, { ...item, oracle: doc.cases.find(item => item.caseId === "held-1")!.oracle })).toThrow("PHASE_ONE_RETIRED_GOLD_FORBIDDEN");
    expect(() => assertPhaseOneRetiredDevelopment(doc, { ...item, sourcePartition: "dev" })).toThrow("PHASE_ONE_RETIREMENT_PROVENANCE_STALE");
    expect(() => phaseOneDevelopmentProvenance(doc, "new-held")).toThrow("PHASE_ONE_RETIREMENT_PROVENANCE_REQUIRED");
  });
});
