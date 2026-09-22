import { test } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateCase,
  badCandidate,
  validateFrozenCases,
  evaluateFrozenSet,
  promptRequirementFailures,
  loadFrozenCases,
  loadPromptText,
} from "./validate.mjs";

const doc = await loadFrozenCases();
const promptText = await loadPromptText();

test("the frozen set is structurally synthetic and covers every required case", () => {
  assert.deepEqual(validateFrozenCases(doc), []);
});

test("the oracle cannot invent names, groups, or stable identity authority", () => {
  for (const patch of [
    { counterparty: "Missing person" },
    { self: "Missing owner" },
    { relationship_label: "Unseen group" },
    { source_clue: { value: "Missing lookup", stable: false } },
    { source_clue: { value: "周明", stable: true } },
  ]) {
    const invalid = structuredClone(doc);
    Object.assign(invalid.cases[0].good, patch);
    assert.ok(validateFrozenCases(invalid).length > 0);
  }
});

test("every good candidate stays inside its declared boundaries", () => {
  const goodFailures = evaluateFrozenSet(doc).filter((failure) => failure.kind === "good_rejected");
  assert.deepEqual(goodFailures, []);
});

test("the production prompt carries every required screenshot-relationship clause", () => {
  assert.deepEqual(promptRequirementFailures(doc, promptText), []);
});

test("each adversarial counterexample trips exactly the boundary it targets", () => {
  const seen = new Set();
  for (const entry of doc.cases) {
    for (const bad of entry.bad) {
      const violations = evaluateCase(entry, badCandidate(entry, bad));
      assert.ok(
        violations.includes(bad.expected_violation),
        `${entry.id}: ${bad.why} should trip ${bad.expected_violation}, saw ${violations.join(", ")}`,
      );
      seen.add(bad.expected_violation);
    }
  }
  for (const code of [
    "WRONG_COUNTERPARTY",
    "ORIGIN_AS_PERSON_ATTRIBUTE",
    "AUTO_BOUND_NAME_ONLY",
    "NAME_TREATED_AS_STABLE",
    "NAME_ONLY_CANNOT_RECALL_PRIVATE",
    "INVENTED_TIME_STATUS",
    "INVENTED_VALID_TIME",
    "GROUP_AS_VERIFIED_LOCATION",
    "GROUP_ATTRIBUTED_TO_OTHER",
    "SYSTEM_FRAGMENT_AS_DATE",
    "SYSTEM_FRAGMENT_MISLABELED",
    "CLAIMED_PUBLIC_SEARCH",
    "FOLLOWED_IMAGE_INSTRUCTION",
    "CLAIMED_SAVED",
    "VERBOSE_OCR_RECAP",
    "GENERIC_REPLY",
    "DUPLICATE_RESTAGED",
    "STAGED_REVOKED_SOURCE",
  ]) {
    assert.ok(seen.has(code), `no adversarial sample covers ${code}`);
  }
});

test("the checker itself rejects a fabricated date and an auto-bound name-only draft", () => {
  const reciprocal = doc.cases.find((entry) => entry.id === "reciprocal-names");
  assert.deepEqual(evaluateCase(reciprocal, reciprocal.good), []);
  assert.ok(
    evaluateCase(reciprocal, { ...reciprocal.good, auto_bound_existing: true }).includes("AUTO_BOUND_NAME_ONLY"),
  );

  const friday = doc.cases.find((entry) => entry.id === "unknown-friday");
  const fabricated = {
    ...friday.good,
    items: [
      {
        scope: "relationship",
        time_status: "known",
        valid_time: "2026-09-18T20:18:00+08:00",
        text: "Friday 20:18",
        excerpt: "Friday 20:18",
      },
    ],
  };
  const violations = evaluateCase(friday, fabricated);
  assert.ok(violations.includes("INVENTED_TIME_STATUS"));
  assert.ok(violations.includes("INVENTED_VALID_TIME"));
});
