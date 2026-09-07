import { execFileSync } from "node:child_process";
import { sign, verify } from "node:crypto";
import { fileURLToPath } from "node:url";
import { canonicalJson, digestCanonicalJson, phaseOneAssert, phaseOneImplementationSourceDigest, phaseOneRuntimeBuildDigest,
  type PhaseOneTrustedVerifier, type Sha256Digest } from "@talent-signal/evaluation";

export const PHASE_ONE_REPOSITORY_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CHECKS = [
  ["build-backend", "pnpm", "--filter", "@talent-signal/backend", "build"],
  ["typecheck-runner", "pnpm", "--filter", "@talent-signal/eval-runner", "typecheck"],
  ["test-evaluation", "pnpm", "--filter", "@talent-signal/evaluation", "test", "--maxWorkers=2"],
  ["test-agent", "pnpm", "--filter", "@talent-signal/agent", "test", "--maxWorkers=2"],
  ["test-backend", "pnpm", "--filter", "@talent-signal/backend", "test", "--maxWorkers=2"],
  ["test-runner", "pnpm", "--filter", "@talent-signal/eval-runner", "test", "--maxWorkers=2"],
  ["p0", "pnpm", "--filter", "@talent-signal/eval-runner", "p0"],
  ["test-optimizer", "python3", "-m", "unittest", "discover", "-s", "apps/eval-runner/optimizer", "-p", "*_test.py"],
] as const;
export interface PhaseOneCIProof {
  schemaVersion: "phase-one-ci-proof.v1";
  applicationRevision: string;
  sourceDigest: Sha256Digest;
  runtimeBuildDigest: Sha256Digest;
  checkPolicyDigest: Sha256Digest;
  checks: Array<{ id: string; status: "pass"; outputDigest: Sha256Digest }>;
  verifiedAt: string;
  keyId: string;
  executorId: string;
  semanticQuality: "not_run";
  releaseAuthority: "none";
  signature: string;
}
function payload(proof: PhaseOneCIProof) { const { signature: _signature, ...body } = proof; return body; }

/** Fixed credential-free commands, followed by a signature over actual source/build identity. */
export function runPhaseOneCIVerification(signer: { keyId: string; executorId: string; privateKeyPem: string }, diagnostic?: (id: string, text: string) => void): PhaseOneCIProof {
  const root = PHASE_ONE_REPOSITORY_ROOT;
  const sourceDigest = phaseOneImplementationSourceDigest(root);
  const applicationRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  phaseOneAssert(/^[a-f0-9]{40,64}$/.test(applicationRevision), "PHASE_ONE_CI_REVISION_INVALID");
  // Only tool/runtime lookup variables are inherited; no paid provider, database, Opik or application credentials.
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, CI: "true", NODE_NO_WARNINGS: "1" };
  const checks: PhaseOneCIProof["checks"] = [];
  for (const [id, command, ...args] of CHECKS) {
    let output: string;
    try { output = execFileSync(command, args, { cwd: root, env, encoding: "utf8", timeout: 600000, maxBuffer: 8000000, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (error) {
      const result = error as { stdout?: unknown; stderr?: unknown };
      diagnostic?.(id, `${String(result.stdout ?? "")}\n${String(result.stderr ?? "")}`.slice(-1000000));
      throw new Error(`PHASE_ONE_CI_CHECK_FAILED:${id}`);
    }
    checks.push({ id, status: "pass", outputDigest: digestCanonicalJson(output) });
  }
  phaseOneAssert(phaseOneImplementationSourceDigest(root) === sourceDigest
    && execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() === applicationRevision, "PHASE_ONE_CI_SOURCE_CHANGED_DURING_CHECKS");
  const body = { schemaVersion: "phase-one-ci-proof.v1" as const, applicationRevision, sourceDigest,
    runtimeBuildDigest: phaseOneRuntimeBuildDigest(root), checkPolicyDigest: digestCanonicalJson(CHECKS), checks,
    verifiedAt: new Date().toISOString(), keyId: signer.keyId, executorId: signer.executorId,
    semanticQuality: "not_run" as const, releaseAuthority: "none" as const };
  return { ...body, signature: sign(null, Buffer.from(canonicalJson(body)), signer.privateKeyPem).toString("base64") };
}

export function verifyPhaseOneCIProof(proof: PhaseOneCIProof, trusted: readonly PhaseOneTrustedVerifier[], requireCurrentBuild = true): PhaseOneCIProof {
  const key = trusted.find(item => item.keyId === proof.keyId && item.executorId === proof.executorId);
  phaseOneAssert(key && proof.schemaVersion === "phase-one-ci-proof.v1" && proof.checkPolicyDigest === digestCanonicalJson(CHECKS)
    && proof.checks.length === CHECKS.length && CHECKS.every(([id], index) => proof.checks[index]?.id === id && proof.checks[index]?.status === "pass")
    && verify(null, Buffer.from(canonicalJson(payload(proof))), key.publicKeyPem, Buffer.from(proof.signature, "base64")), "PHASE_ONE_CI_PROOF_INVALID");
  phaseOneAssert(Date.now() - Date.parse(proof.verifiedAt) >= 0 && Date.now() - Date.parse(proof.verifiedAt) <= 86400000, "PHASE_ONE_CI_PROOF_EXPIRED");
  if (requireCurrentBuild) phaseOneAssert(phaseOneImplementationSourceDigest(PHASE_ONE_REPOSITORY_ROOT) === proof.sourceDigest
    && phaseOneRuntimeBuildDigest(PHASE_ONE_REPOSITORY_ROOT) === proof.runtimeBuildDigest
    && execFileSync("git", ["rev-parse", "HEAD"], { cwd: PHASE_ONE_REPOSITORY_ROOT, encoding: "utf8" }).trim() === proof.applicationRevision, "PHASE_ONE_CI_SOURCE_OR_BUILD_STALE");
  return proof;
}
