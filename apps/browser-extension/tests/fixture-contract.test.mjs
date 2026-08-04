import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootFixturePath = path.resolve(
  here,
  "../../../evals/candidate-momentum-v1.json",
);
const bundledFixturePath = path.resolve(
  here,
  "../load-unpacked/fixtures/candidate-momentum-v1.json",
);
const [rootFixture, bundledFixture] = await Promise.all([
  readFile(rootFixturePath, "utf8").then(JSON.parse),
  readFile(bundledFixturePath, "utf8").then(JSON.parse),
]);

test("bundles the exact shared fixture contract without semantic drift", () => {
  assert.deepEqual(bundledFixture, rootFixture);
  assert.equal(bundledFixture.version, "2026-08-05.1");
  assert.equal(bundledFixture.cases.length, 8);
});

test("all eight cases keep disposition, evidence, and action boundaries explicit", () => {
  const ids = bundledFixture.cases.map((fixtureCase) => fixtureCase.id);
  assert.deepEqual(ids, [
    "TS-CORE-01",
    "TS-CORE-02",
    "TS-CORE-03",
    "TS-CORE-04",
    "TS-ID-01",
    "TS-ID-03",
    "TS-ACT-01",
    "TS-BOUND-01",
  ]);

  for (const fixtureCase of bundledFixture.cases) {
    assert.ok(fixtureCase.messages.length > 0, fixtureCase.id);
    assert.ok(fixtureCase.expected.disposition, fixtureCase.id);
    assert.ok(fixtureCase.expected.must_not.length > 0, fixtureCase.id);
    for (const assertion of fixtureCase.expected.assertions) {
      const evidence = fixtureCase.messages.find(
        (message) => message.id === assertion.evidence_message_id,
      );
      assert.ok(evidence, `${fixtureCase.id}:${assertion.field}`);
      assert.ok(
        evidence.text.includes(assertion.evidence_quote),
        `${fixtureCase.id}:${assertion.field}:quote`,
      );
      assert.notEqual(assertion.status, "confirmed", fixtureCase.id);
    }
  }
});

test("critical blockers abstain instead of manufacturing persistence or effects", () => {
  const byId = Object.fromEntries(
    bundledFixture.cases.map((fixtureCase) => [fixtureCase.id, fixtureCase]),
  );
  assert.equal(byId["TS-CORE-02"].expected.disposition, "no_action");
  assert.equal(byId["TS-CORE-03"].expected.disposition, "clarify");
  assert.equal(byId["TS-ID-01"].expected.disposition, "clarify");
  assert.equal(byId["TS-BOUND-01"].expected.disposition, "block");
  assert.equal(byId["TS-ID-03"].expected.action, null);
  assert.match(
    byId["TS-ACT-01"].expected.must_not.join(" "),
    /calendar event|availability as consent/i,
  );
});
