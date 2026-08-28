import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const runner = new URL("./run.sh", import.meta.url);

function invoke(argumentsList, environment = {}) {
  return spawnSync(runner.pathname, argumentsList, {
    encoding: "utf8",
    env: { PATH: process.env.PATH, ...environment },
  });
}

test("rejects implicit or unknown Infisical boundaries", () => {
  const unknownEnvironment = invoke(["preview", "/shared", "--", "true"]);
  assert.equal(unknownEnvironment.status, 2);
  assert.match(unknownEnvironment.stderr, /must be dev, staging, or prod/u);

  const invalidPath = invoke(["dev", "/Shared", "--", "true"]);
  assert.equal(invalidPath.status, 2);
  assert.match(invalidPath.stderr, /Invalid Infisical path/u);
});

test("production refuses a human CLI session or offline cache", () => {
  const result = invoke(["prod", "/shared", "/backend", "--", "true"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Machine Identity token/u);
});
