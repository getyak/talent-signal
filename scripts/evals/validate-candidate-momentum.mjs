import { readFile } from "node:fs/promises";
import process from "node:process";

const fixturePath =
  process.argv[2] ?? new URL("../../evals/candidate-momentum-v1.json", import.meta.url);
const raw = await readFile(fixturePath, "utf8");
const suite = JSON.parse(raw);

const errors = [];
const allowedSurfaces = new Set(["plugin", "web", "ios"]);
const allowedDispositions = new Set([
  "propose_action",
  "no_action",
  "clarify",
  "block"
]);
const allowedStatuses = new Set(["proposed", "ambiguous", "superseded"]);

function requireCondition(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

requireCondition(
  typeof suite.suite_id === "string" && suite.suite_id.length > 0,
  "suite_id must be a non-empty string"
);
requireCondition(
  typeof suite.version === "string" && suite.version.length > 0,
  "version must be a non-empty string"
);
requireCondition(
  Array.isArray(suite.surfaces) &&
    suite.surfaces.length === allowedSurfaces.size &&
    suite.surfaces.every((surface) => allowedSurfaces.has(surface)),
  "surfaces must contain plugin, web, and ios exactly once"
);
requireCondition(
  Array.isArray(suite.cases) && suite.cases.length >= 8,
  "the overnight gate requires at least eight cases"
);

const caseIds = new Set();

for (const testCase of suite.cases ?? []) {
  const prefix = testCase.id ?? "<missing-id>";
  requireCondition(
    typeof testCase.id === "string" && testCase.id.length > 0,
    `${prefix}: id must be a non-empty string`
  );
  requireCondition(!caseIds.has(testCase.id), `${prefix}: id must be unique`);
  caseIds.add(testCase.id);

  requireCondition(
    Array.isArray(testCase.messages) && testCase.messages.length > 0,
    `${prefix}: messages must be non-empty`
  );
  requireCondition(
    testCase.expected &&
      allowedDispositions.has(testCase.expected.disposition),
    `${prefix}: expected.disposition is invalid`
  );
  requireCondition(
    Array.isArray(testCase.expected?.assertions),
    `${prefix}: expected.assertions must be an array`
  );
  requireCondition(
    Array.isArray(testCase.expected?.must_not) &&
      testCase.expected.must_not.length > 0,
    `${prefix}: expected.must_not must contain at least one guardrail`
  );

  if (["no_action", "clarify", "block"].includes(testCase.expected?.disposition)) {
    requireCondition(
      testCase.expected.action === null,
      `${prefix}: ${testCase.expected.disposition} cases cannot contain an action`
    );
  }

  if (testCase.expected?.disposition === "propose_action") {
    requireCondition(
      testCase.expected.action &&
        testCase.expected.action.type === "prepare_question",
      `${prefix}: the v1 suite only permits one reviewable prepare_question action`
    );
  }

  const messages = new Map(
    (testCase.messages ?? []).map((message) => [message.id, message])
  );

  for (const assertion of testCase.expected?.assertions ?? []) {
    requireCondition(
      allowedStatuses.has(assertion.status),
      `${prefix}: assertion ${assertion.field} has an invalid status`
    );
    const source = messages.get(assertion.evidence_message_id);
    requireCondition(
      source,
      `${prefix}: assertion ${assertion.field} references a missing message`
    );
    requireCondition(
      source?.text.includes(assertion.evidence_quote),
      `${prefix}: assertion ${assertion.field} quote is not present in its message`
    );
  }

  if (testCase.expected?.action) {
    const action = testCase.expected.action;
    requireCondition(
      Array.isArray(action.evidence_message_ids) &&
        action.evidence_message_ids.length > 0,
      `${prefix}: action must cite evidence`
    );
    for (const messageId of action.evidence_message_ids ?? []) {
      requireCondition(
        messages.has(messageId),
        `${prefix}: action references missing message ${messageId}`
      );
    }
  }
}

if (errors.length > 0) {
  console.error(`Candidate-momentum fixture validation failed (${errors.length}):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Candidate-momentum fixture validation passed: ${suite.cases.length} cases, ${suite.surfaces.length} surfaces.`
);
