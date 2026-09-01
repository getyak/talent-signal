#!/usr/bin/env node

import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

const allowedKeys = new Set([
  "schemaVersion",
  "sessionID",
  "firstValueMilliseconds",
  "draftPreparedMilliseconds",
  "scopeReviewStartedMilliseconds",
  "scopeConfirmedMilliseconds",
  "reminderVerifiedMilliseconds",
  "relationshipReviewCompletedMilliseconds",
  "consequenceReviewAbandonedMilliseconds",
  "changeUnderstanding",
  "evidenceSupport",
  "actionWasProposed",
  "actionWasEdited",
  "actionWasAdopted",
  "completedActions",
  "reuseIntent",
]);

const timingKeys = [
  "firstValueMilliseconds",
  "draftPreparedMilliseconds",
  "scopeReviewStartedMilliseconds",
  "scopeConfirmedMilliseconds",
  "reminderVerifiedMilliseconds",
  "relationshipReviewCompletedMilliseconds",
  "consequenceReviewAbandonedMilliseconds",
];

const completedActionValues = new Set([
  "draft_copied",
  "mail_draft_opened",
  "reminder_verified",
  "relationship_reviewed",
]);

function assertEnum(record, key, values, source) {
  if (!(key in record)) return;
  if (!values.has(record[key])) {
    throw new Error(`${source}: ${key} is not an allowed value`);
  }
}

export function validateTrialRecord(record, source = "trial record") {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`${source}: expected one JSON object`);
  }

  const unknownKeys = Object.keys(record).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`${source}: refusing unknown field(s): ${unknownKeys.join(", ")}`);
  }
  if (record.schemaVersion !== 2) {
    throw new Error(`${source}: schemaVersion must be 2`);
  }
  if (typeof record.sessionID !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.sessionID)) {
    throw new Error(`${source}: sessionID must be a UUID`);
  }

  for (const key of timingKeys) {
    if (!(key in record)) continue;
    if (typeof record[key] !== "number" || !Number.isFinite(record[key]) || record[key] < 0) {
      throw new Error(`${source}: ${key} must be a non-negative finite number`);
    }
  }

  assertEnum(record, "changeUnderstanding", new Set(["yes", "no", "unsure"]), source);
  assertEnum(record, "evidenceSupport", new Set(["supported", "unsupported", "unsure"]), source);
  assertEnum(record, "reuseIntent", new Set(["yes", "no", "unsure"]), source);

  for (const key of ["actionWasProposed", "actionWasEdited", "actionWasAdopted"]) {
    if (typeof record[key] !== "boolean") {
      throw new Error(`${source}: ${key} must be a boolean`);
    }
  }
  if (!Array.isArray(record.completedActions) ||
      record.completedActions.some((value) => !completedActionValues.has(value))) {
    throw new Error(`${source}: completedActions contains an unsupported value`);
  }
  if (record.actionWasAdopted !== (record.completedActions.length > 0)) {
    throw new Error(`${source}: actionWasAdopted must match completedActions`);
  }
  if ("consequenceReviewAbandonedMilliseconds" in record &&
      !("scopeReviewStartedMilliseconds" in record)) {
    throw new Error(`${source}: an abandoned consequence review must have a start time`);
  }

  return record;
}

function countValues(records, key, values) {
  const counts = Object.fromEntries([...values, "missing"].map((value) => [value, 0]));
  for (const record of records) {
    counts[key in record ? record[key] : "missing"] += 1;
  }
  return counts;
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return Math.round(sorted[index] * 10) / 10;
}

function timingSummary(records, key) {
  const values = records
    .flatMap((record) => key in record ? [record[key]] : [])
    .sort((left, right) => left - right);
  return {
    observed: values.length,
    medianMilliseconds: percentile(values, 0.5),
    p90Milliseconds: percentile(values, 0.9),
  };
}

export function summarizeTrialRecords(inputRecords) {
  const records = inputRecords.map((record, index) => validateTrialRecord(record, `record ${index + 1}`));
  const uniqueSessionIDs = new Set(records.map((record) => record.sessionID));
  if (uniqueSessionIDs.size !== records.length) {
    throw new Error("duplicate sessionID: each trial session may be counted only once");
  }

  const completedActions = Object.fromEntries([...completedActionValues].map((value) => [value, 0]));
  for (const record of records) {
    for (const action of new Set(record.completedActions)) completedActions[action] += 1;
  }

  const scopeReview = {
    notStarted: 0,
    confirmed: 0,
    abandonedBeforeConfirmation: 0,
    startedWithoutRecordedOutcome: 0,
  };
  for (const record of records) {
    if (!("scopeReviewStartedMilliseconds" in record)) scopeReview.notStarted += 1;
    else if ("scopeConfirmedMilliseconds" in record) scopeReview.confirmed += 1;
    else if ("consequenceReviewAbandonedMilliseconds" in record) scopeReview.abandonedBeforeConfirmation += 1;
    else scopeReview.startedWithoutRecordedOutcome += 1;
  }

  return {
    schemaVersion: 1,
    sessions: records.length,
    timing: Object.fromEntries(timingKeys.map((key) => [key, timingSummary(records, key)])),
    changeUnderstanding: countValues(records, "changeUnderstanding", ["yes", "no", "unsure"]),
    evidenceSupport: countValues(records, "evidenceSupport", ["supported", "unsupported", "unsure"]),
    reuseIntent: countValues(records, "reuseIntent", ["yes", "no", "unsure"]),
    actions: {
      proposed: records.filter((record) => record.actionWasProposed).length,
      adopted: records.filter((record) => record.actionWasAdopted).length,
      edited: records.filter((record) => record.actionWasEdited).length,
      completed: completedActions,
    },
    scopeReview,
  };
}

async function readRecords(paths) {
  const records = [];
  for (const path of paths) {
    const parsed = JSON.parse(await fs.readFile(path, "utf8"));
    if (Array.isArray(parsed)) records.push(...parsed);
    else records.push(parsed);
  }
  return records;
}

async function main() {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    throw new Error("usage: node scripts/macos/summarize-companion-trials.mjs <session.json> [more.json ...]");
  }
  const summary = summarizeTrialRecords(await readRecords(paths));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
