import assert from "node:assert/strict";
import test from "node:test";

import {
  summarizeTrialRecords,
  validateTrialRecord,
} from "./summarize-companion-trials.mjs";

function trial(overrides = {}) {
  return {
    schemaVersion: 2,
    sessionID: crypto.randomUUID(),
    firstValueMilliseconds: 780,
    actionWasProposed: true,
    actionWasEdited: false,
    actionWasAdopted: true,
    completedActions: ["draft_copied"],
    ...overrides,
  };
}

test("summarizes adoption, editing, review drop-off, and human judgments", () => {
  const summary = summarizeTrialRecords([
    trial({
      firstValueMilliseconds: 500,
      changeUnderstanding: "yes",
      evidenceSupport: "supported",
      reuseIntent: "yes",
    }),
    trial({
      firstValueMilliseconds: 900,
      actionWasEdited: true,
      completedActions: ["reminder_verified"],
      scopeReviewStartedMilliseconds: 1_200,
      scopeConfirmedMilliseconds: 2_000,
      changeUnderstanding: "unsure",
      evidenceSupport: "unsure",
      reuseIntent: "no",
    }),
    trial({
      firstValueMilliseconds: 1_300,
      actionWasAdopted: false,
      completedActions: [],
      scopeReviewStartedMilliseconds: 1_500,
      consequenceReviewAbandonedMilliseconds: 2_100,
      changeUnderstanding: "no",
    }),
  ]);

  assert.equal(summary.sessions, 3);
  assert.deepEqual(summary.timing.firstValueMilliseconds, {
    observed: 3,
    medianMilliseconds: 900,
    p90Milliseconds: 1_300,
  });
  assert.deepEqual(summary.changeUnderstanding, { yes: 1, no: 1, unsure: 1, missing: 0 });
  assert.equal(summary.actions.adopted, 2);
  assert.equal(summary.actions.edited, 1);
  assert.equal(summary.actions.completed.draft_copied, 1);
  assert.equal(summary.actions.completed.reminder_verified, 1);
  assert.equal(summary.scopeReview.confirmed, 1);
  assert.equal(summary.scopeReview.abandonedBeforeConfirmation, 1);
});

test("rejects unknown fields so conversation content cannot enter aggregation", () => {
  assert.throws(
    () => validateTrialRecord(trial({ conversationText: "PRIVATE_SENTINEL" })),
    /refusing unknown field\(s\): conversationText/,
  );
});

test("rejects inconsistent adoption and duplicate sessions", () => {
  assert.throws(
    () => validateTrialRecord(trial({ actionWasAdopted: false })),
    /must match completedActions/,
  );

  const sessionID = crypto.randomUUID();
  assert.throws(
    () => summarizeTrialRecords([trial({ sessionID }), trial({ sessionID })]),
    /duplicate sessionID/,
  );
});
