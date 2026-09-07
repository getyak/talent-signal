import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { phaseOneImplementationSourceDigest } from "@talent-signal/evaluation";
import { runPhaseOneCIVerification, verifyPhaseOneCIProof } from "./phaseOneCI.js";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
vi.mock("@talent-signal/evaluation", async importOriginal => ({ ...await importOriginal<object>(),
  phaseOneImplementationSourceDigest: vi.fn(() => `sha256:${"a".repeat(64)}`), phaseOneRuntimeBuildDigest: vi.fn(() => `sha256:${"b".repeat(64)}`) }));
const pair = generateKeyPairSync("ed25519");
const signer = { keyId: "test-key", executorId: "test-independent-ci", privateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
const trusted = [{ keyId: signer.keyId, executorId: signer.executorId, publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString() }];
beforeEach(() => {
  vi.mocked(execFileSync).mockReset().mockImplementation(command => command === "git" ? "a".repeat(40) : "mock check output");
  vi.mocked(phaseOneImplementationSourceDigest).mockReset().mockReturnValue(`sha256:${"a".repeat(64)}`);
});
describe("CI proof authority (mocked command transport)", () => {
  it("signs only after fixed checks and rejects altered claims or keys", () => {
    const proof = runPhaseOneCIVerification(signer);
    expect(proof.checks).toHaveLength(8);
    expect(proof.semanticQuality).toBe("not_run");
    expect(verifyPhaseOneCIProof(JSON.parse(JSON.stringify(proof)), trusted, false).runtimeBuildDigest).toBe(proof.runtimeBuildDigest);
    expect(() => verifyPhaseOneCIProof({ ...proof, applicationRevision: "c".repeat(40) }, trusted, false)).toThrow("PHASE_ONE_CI_PROOF_INVALID");
    expect(() => verifyPhaseOneCIProof(proof, [], false)).toThrow("PHASE_ONE_CI_PROOF_INVALID");
    const environment = vi.mocked(execFileSync).mock.calls.find(([command]) => command === "pnpm")?.[2] as { env: Record<string, string> };
    expect(Object.keys(environment.env).sort()).toEqual(["CI", "HOME", "NODE_NO_WARNINGS", "PATH", "TMPDIR"]);
  });
  it("cannot produce a passing proof for a failed check or source changed during execution", () => {
    vi.mocked(execFileSync).mockImplementation(command => { if (command !== "git") throw new Error("failed tests"); return "a".repeat(40); });
    expect(() => runPhaseOneCIVerification(signer)).toThrow("PHASE_ONE_CI_CHECK_FAILED:build-backend");
    vi.mocked(execFileSync).mockImplementation(command => command === "git" ? "a".repeat(40) : "mock check output");
    vi.mocked(phaseOneImplementationSourceDigest).mockReturnValueOnce(`sha256:${"a".repeat(64)}`).mockReturnValue(`sha256:${"c".repeat(64)}`);
    expect(() => runPhaseOneCIVerification(signer)).toThrow("PHASE_ONE_CI_SOURCE_CHANGED_DURING_CHECKS");
  });
});
