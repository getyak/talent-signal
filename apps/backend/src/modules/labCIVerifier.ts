import type { LabJob, LabRegressionExport } from "@talent-signal/contracts";
import { consumeLabRegression, digestCanonicalJson, sha256Bytes } from "@talent-signal/evaluation";
import { readLabCIArchive } from "./labCIArchive.js";

export interface LabCITrust {
  repository: string; repositoryId: number; workflowSha256: string; token: string; branches: string[];
}
export interface LabCIVerifiedEvidence {
  repository: string; runId: number; runAttempt: number; jobId: number; artifactId: number;
  artifactDigest: string; reportDigest: string; sourceRevision: string; artifactExpiresAt: string;
  integrity: "pass" | "fail" | "not_run"; workflowConclusion: string; jobConclusion: string;
}
export interface LabCIVerifying {
  readonly repository: string;
  readonly trustDigest: string;
  verify(bundle: LabRegressionExport, job: LabJob, runId: number): Promise<LabCIVerifiedEvidence>;
}
export class LabCIVerificationError extends Error {
  constructor(readonly code: string) { super(code); }
}
function check(condition: unknown, code: string): asserts condition {
  if (!condition) throw new LabCIVerificationError(code);
}
const object = (value: unknown): Record<string, any> => {
  check(value && typeof value === "object" && !Array.isArray(value), "LAB_CI_RESPONSE_INVALID");
  return value as Record<string, any>;
};
const date = (value: unknown) => typeof value === "string" ? Date.parse(value) : Number.NaN;

export class GitHubLabCIVerifier implements LabCIVerifying {
  readonly repository: string;
  readonly trustDigest: string;
  constructor(readonly trust: LabCITrust, private readonly fetcher: typeof fetch = fetch, private readonly now = () => Date.now()) {
    check(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trust.repository) && Number.isSafeInteger(trust.repositoryId) && trust.repositoryId > 0
      && /^[a-f0-9]{64}$/.test(trust.workflowSha256) && trust.token.trim() && !/[\r\n]/.test(trust.token)
      && trust.branches.length > 0 && trust.branches.every((branch) => branch.length > 0 && branch.length <= 200), "LAB_CI_TRUST_INVALID");
    this.repository = trust.repository;
    this.trustDigest = digestCanonicalJson({ repository: trust.repository.toLowerCase(), repositoryId: trust.repositoryId,
      workflowSha256: trust.workflowSha256, branches: [...trust.branches].sort() });
  }
  async verify(bundle: LabRegressionExport, job: LabJob, runId: number): Promise<LabCIVerifiedEvidence> {
    check(Number.isSafeInteger(runId) && runId > 0, "LAB_CI_RUN_INVALID");
    const signal = AbortSignal.timeout(30_000);
    const prefix = `https://api.github.com/repos/${this.repository}`;
    const headers = { authorization: `Bearer ${this.trust.token}`, accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10" };
    async function bounded(response: Response, maximum = 1_000_000) {
      check(response.body, "LAB_CI_RESPONSE_EMPTY");
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          size += value.byteLength; check(size <= maximum, "LAB_CI_RESPONSE_TOO_LARGE"); chunks.push(value);
        }
      } finally { await reader.cancel(); }
      return Buffer.concat(chunks);
    }
    const api = async (path: string) => {
      const response = await this.fetcher(prefix + path, { headers, signal, redirect: "error", cache: "no-store" });
      check(response.ok, response.status === 404 ? "LAB_CI_NOT_FOUND" : "LAB_CI_READ_DENIED");
      return object(JSON.parse((await bounded(response)).toString("utf8")));
    };
    try {
      const run = await api(`/actions/runs/${runId}`);
      check(run.id === runId && run.repository?.id === this.trust.repositoryId && run.head_repository?.id === this.trust.repositoryId
        && run.repository?.full_name?.toLowerCase() === this.repository.toLowerCase(), "LAB_CI_REPOSITORY_MISMATCH");
      check(run.status === "completed" && ["success", "failure"].includes(run.conclusion), "LAB_CI_RUN_INCOMPLETE");
      check(run.path === ".github/workflows/ci.yml" && this.trust.branches.includes(run.head_branch)
        && ["push", "workflow_dispatch"].includes(run.event), "LAB_CI_WORKFLOW_NOT_TRUSTED");
      check(/^[a-f0-9]{40}$/.test(run.head_sha) && Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0, "LAB_CI_RUN_INVALID");
      const workflow = await api(`/contents/.github/workflows/ci.yml?ref=${run.head_sha}`);
      check(workflow.encoding === "base64" && typeof workflow.content === "string", "LAB_CI_WORKFLOW_INVALID");
      check(sha256Bytes(Buffer.from(workflow.content, "base64")).slice(7) === this.trust.workflowSha256, "LAB_CI_WORKFLOW_CHANGED");
      const jobs = await api(`/actions/runs/${runId}/attempts/${run.run_attempt}/jobs?per_page=100`);
      check(Array.isArray(jobs.jobs) && jobs.total_count <= 100, "LAB_CI_JOB_LIST_INVALID");
      const matchingJobs = jobs.jobs.filter((value: any) => value.name === "Backend quality");
      check(matchingJobs.length === 1, "LAB_CI_JOB_NOT_FOUND");
      const ciJob = object(matchingJobs[0]);
      check(ciJob.run_id === runId && ciJob.head_sha === run.head_sha && ciJob.status === "completed"
        && ["success", "failure"].includes(ciJob.conclusion) && Number.isSafeInteger(ciJob.id), "LAB_CI_JOB_INCOMPLETE");
      check(Array.isArray(ciJob.steps), "LAB_CI_STEP_NOT_FOUND");
      const steps = ciJob.steps.filter((value: any) => value.name === "Consume the selected Lab regression");
      check(steps.length === 1 && steps[0].status === "completed" && ["success", "failure"].includes(steps[0].conclusion), "LAB_CI_STEP_NOT_EXECUTED");
      const artifacts = await api(`/actions/runs/${runId}/artifacts?per_page=100`);
      check(Array.isArray(artifacts.artifacts) && artifacts.total_count <= 100, "LAB_CI_ARTIFACT_LIST_INVALID");
      const matches = artifacts.artifacts.filter((value: any) => value.name === `lab-regression-consumption-${runId}-${run.run_attempt}`);
      check(matches.length === 1, "LAB_CI_ARTIFACT_NOT_FOUND");
      const artifact = object(matches[0]);
      check(artifact.expired === false && date(artifact.expires_at) > this.now() && artifact.size_in_bytes <= 1_000_000
        && Number.isSafeInteger(artifact.id) && artifact.id > 0 && /^sha256:[a-f0-9]{64}$/.test(artifact.digest)
        && artifact.workflow_run?.id === runId && artifact.workflow_run?.head_sha === run.head_sha
        && artifact.workflow_run?.repository_id === this.trust.repositoryId && artifact.workflow_run?.head_repository_id === this.trust.repositoryId, "LAB_CI_ARTIFACT_INVALID");
      const redirect = await this.fetcher(prefix + `/actions/artifacts/${artifact.id}/zip`, { headers, signal, redirect: "manual", cache: "no-store" });
      check(redirect.status === 302, "LAB_CI_DOWNLOAD_UNAVAILABLE");
      const download = new URL(redirect.headers.get("location") ?? "");
      check(download.protocol === "https:" && !download.username && !download.password && !download.hash
        && (download.hostname.endsWith(".blob.core.windows.net") || download.hostname.endsWith(".actions.githubusercontent.com")), "LAB_CI_DOWNLOAD_ORIGIN_DENIED");
      // GitHub's credential is never sent to its signed artifact download origin.
      const response = await this.fetcher(download, { signal, redirect: "error", cache: "no-store" });
      check(response.ok, "LAB_CI_DOWNLOAD_UNAVAILABLE");
      const archive = await bounded(response);
      check(sha256Bytes(archive) === artifact.digest, "LAB_CI_ARTIFACT_HASH_MISMATCH");
      const report = object(readLabCIArchive(archive));
      check(report.schemaVersion === "lab-regression-consumption.v1" && report.runner?.git_sha === run.head_sha
        && /^sha256:[a-f0-9]{64}$/.test(report.runner?.source_digest), "LAB_CI_REPORT_REVISION_MISMATCH");
      check(date(report.consumed_at) >= date(steps[0].started_at) - 1000 && date(report.consumed_at) <= date(steps[0].completed_at) + 1000
        && date(report.consumed_at) <= date(artifact.created_at) + 1000, "LAB_CI_REPORT_TIME_MISMATCH");
      check(["authenticated_backend_readback", "reviewed_local_files"].includes(report.transport), "LAB_CI_REPORT_INVALID");
      const expected = consumeLabRegression({ bundle, job, now: report.consumed_at, runner: report.runner, transport: report.transport });
      check(digestCanonicalJson(expected) === digestCanonicalJson(report), "LAB_CI_REPORT_CONTENT_MISMATCH");
      const statuses = expected.results.flatMap((result) => result.gate.capabilities.filter((value) => value.capability === "integrity").map((value) => value.status));
      const integrity = statuses.includes("fail") ? "fail" : statuses.every((value) => value === "pass") ? "pass" : "not_run";
      check(steps[0].conclusion === (integrity === "pass" ? "success" : "failure"), "LAB_CI_GATE_CONCLUSION_MISMATCH");
      // Catch a rerun, replaced artifact, or deletion while the report was downloading.
      const current = await api(`/actions/runs/${runId}`), currentArtifact = await api(`/actions/artifacts/${artifact.id}`);
      check(current.run_attempt === run.run_attempt && current.head_sha === run.head_sha && current.status === "completed"
        && current.conclusion === run.conclusion && current.repository?.id === this.trust.repositoryId
        && currentArtifact.id === artifact.id && currentArtifact.digest === artifact.digest && currentArtifact.expired === false
        && currentArtifact.expires_at === artifact.expires_at && date(currentArtifact.expires_at) > this.now(), "LAB_CI_EVIDENCE_CHANGED");
      return { repository: this.repository, runId, runAttempt: run.run_attempt, jobId: ciJob.id, artifactId: artifact.id,
        artifactDigest: artifact.digest, reportDigest: expected.contentDigest, sourceRevision: run.head_sha,
        artifactExpiresAt: artifact.expires_at, integrity, workflowConclusion: run.conclusion, jobConclusion: ciJob.conclusion };
    } catch (error) {
      if (error instanceof LabCIVerificationError) throw error;
      throw new LabCIVerificationError(error instanceof Error && error.message === "LAB_CI_ARCHIVE_INVALID" ? error.message : "LAB_CI_VERIFICATION_UNAVAILABLE");
    }
  }
}

export function environmentLabCIVerifier(environment: NodeJS.ProcessEnv = process.env): LabCIVerifying | null {
  const token = environment.TALENT_SIGNAL_LAB_CI_GITHUB_TOKEN;
  if (!token) return null;
  return new GitHubLabCIVerifier({ token, repository: environment.TALENT_SIGNAL_LAB_CI_REPOSITORY ?? "getyak/talent-signal",
    repositoryId: Number(environment.TALENT_SIGNAL_LAB_CI_REPOSITORY_ID ?? "1322192683"),
    workflowSha256: environment.TALENT_SIGNAL_LAB_CI_WORKFLOW_SHA256 ?? "",
    branches: (environment.TALENT_SIGNAL_LAB_CI_BRANCHES ?? "main").split(",").map((value) => value.trim()).filter(Boolean) });
}
