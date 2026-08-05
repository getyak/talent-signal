#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  TalentSignalClient,
} from "../../packages/contracts/dist/index.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const fixturePath = resolve(repoRoot, "evals/candidate-momentum-v1.json");
const outputPath = resolve(
  repoRoot,
  "docs/evaluations/overnight/final/TS-CORE-01-capture-receipt.json",
);
const baseUrl = process.env.TALENT_SIGNAL_BACKEND_URL ?? "http://127.0.0.1:4317";
const parsedBaseUrl = new URL(baseUrl);
if (
  parsedBaseUrl.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "::1"].includes(parsedBaseUrl.hostname)
) {
  throw new Error("The TS-CORE-01 seed accepts only a localhost HTTP backend.");
}

const suite = JSON.parse(await readFile(fixturePath, "utf8"));
const fixture = suite.cases.find((item) => item.id === "TS-CORE-01");
if (!fixture || fixture.messages.length !== 1) {
  throw new Error("The frozen TS-CORE-01 fixture is unavailable.");
}

const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const client = new TalentSignalClient(parsedBaseUrl.origin);
const session = await client.login({
  account_slug: "fixture-alpha",
  user_email: "recruiter@alpha.local",
  client_label: "integration-harness-chrome-gap",
});
const capture = await client.createCapture({
  idempotency_key: "integration:TS-CORE-01:capture:v1",
  fixture_case_id: fixture.id,
  source: {
    kind: "transcript",
    captured_at: new Date(fixture.context.captured_at).toISOString(),
    source_timezone: fixture.context.source_timezone,
    purpose:
      "Synthetic integration seed used only because Chrome load-unpacked control is unavailable",
    retention_until: null,
    source_locator: "integration-harness:chrome-load-unpacked-blocked",
  },
  identity: {
    status: "bound",
    external_ref: `fixture:person:${slug(fixture.context.candidate)}`,
    display_label: fixture.context.candidate,
    assignment_ref: `fixture:assignment:${slug(fixture.context.candidate)}:${slug(fixture.context.assignment)}`,
    assignment_label: fixture.context.assignment,
    binding_basis: "Frozen synthetic TS-CORE-01 context.",
  },
  messages: fixture.messages.map((message, sequence) => ({
    source_message_id: message.id,
    sequence,
    speaker: message.speaker,
    text: message.text,
  })),
});
const action = fixture.expected.action;
const proposal = await client.submitAnalysis(capture.id, {
  idempotency_key: "integration:TS-CORE-01:analysis:v1",
  producer: {
    kind: "fixture_compiler",
    name: "candidate-momentum-v1-integration-harness",
    version: suite.version,
  },
  disposition: fixture.expected.disposition,
  assertions: fixture.expected.assertions.map((assertion) => ({
    field: assertion.field,
    status: assertion.status,
    value: assertion.value,
    evidence_message_id: assertion.evidence_message_id,
    evidence_quote: assertion.evidence_quote,
    subject_kind: "candidate",
    temporal_relation: "new",
  })),
  action: action
    ? {
        ...action,
        effect_preview: {
          simulated: true,
          capability: "local.simulated_attention.create",
          adapter: "local_deterministic",
          target: {
            destination_key: "fixture:ts-core-01:integration-attention",
            label: "Local simulated recruiter attention queue",
          },
          change: {
            kind: "create_attention",
            title: `Prepare question: ${action.target}`,
          },
          expected_destination_version: 0,
          simulation_behavior: "success",
        },
      }
    : null,
});
const workspace = await client.getWorkspaceReview(fixture.id);
const result = {
  trace_id: "TS-CORE-01-localhost",
  suite_id: suite.suite_id,
  suite_version: suite.version,
  case_id: fixture.id,
  source_sha256: createHash("sha256")
    .update(fixture.messages[0].text)
    .digest("hex"),
  account_id: session.account.id,
  capture_id: capture.id,
  proposal_id: proposal.id,
  assignment_id: workspace.assignment.id,
  receipt_status: "received",
  transport_proof: "integration_harness_only",
  chrome_load_unpacked_proven: false,
  external_writes: false,
  data_classification: "synthetic_fixture_only",
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
process.stdout.write(
  `Seeded ${result.case_id} into ${session.account.slug}; receipt ${capture.id}\n`,
);
