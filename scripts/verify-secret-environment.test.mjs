import assert from "node:assert/strict";
import test from "node:test";

import {
  secretPresence,
  verifySecretEnvironment,
} from "./verify-secret-environment.mjs";

test("reports presence without returning secret values", () => {
  const environment = { API_KEY: "private-value", EMPTY_KEY: "" };

  assert.deepEqual(secretPresence(environment, ["API_KEY", "EMPTY_KEY"]), [
    { name: "API_KEY", present: true },
    { name: "EMPTY_KEY", present: false },
  ]);
  assert.equal(
    JSON.stringify(secretPresence(environment, ["API_KEY"])).includes(
      "private-value",
    ),
    false,
  );
});

test("fails closed for missing names and an empty request", () => {
  assert.equal(
    verifySecretEnvironment({}, ["ZHIPU_API_KEY"]).ok,
    false,
  );
  assert.deepEqual(verifySecretEnvironment({}, []), {
    ok: false,
    message: "Pass one or more environment variable names to verify.",
    results: [],
  });
});
