import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const migration = new URL("./migrate.mjs", import.meta.url);

function invoke(argumentsList, environment = {}) {
  return spawnSync(process.execPath, [migration.pathname, ...argumentsList], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, ...environment },
  });
}

const baseArguments = ["--environment=staging", "--group=release", "--apply"];

test("raw key-file import rejects ambiguous source selection", () => {
  const result = invoke([
    ...baseArguments,
    "--source-file=/dev/null",
    "--source-key-file=MATCH_DEPLOY_KEY:/dev/null",
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /either --source-file or --source-key-file/u);
});

test("raw key-file import fails closed for malformed or unowned names", () => {
  const malformed = invoke([...baseArguments, "--source-key-file=MATCH_DEPLOY_KEY"]);
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /must be NAME:PATH/u);

  const unowned = invoke([
    ...baseArguments,
    "--source-key-file=UNDECLARED_PRIVATE_KEY:/dev/null",
  ]);
  assert.notEqual(unowned.status, 0);
  assert.match(unowned.stderr, /not allowlisted in release/u);
});

test("raw key-file import delegates the file without dotenv escaping", async () => {
  const directory = await mkdtemp(join(tmpdir(), "talent-signal-migrate-test-"));
  try {
    const source = join(directory, "AuthKey_TEST.p8");
    const capture = join(directory, "arguments.txt");
    const fakeInfisical = join(directory, "infisical");
    await writeFile(source, "-----BEGIN PRIVATE KEY-----\nline-two\n-----END PRIVATE KEY-----\n");
    await writeFile(
      fakeInfisical,
      "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$CAPTURE_PATH\"\n",
    );
    await chmod(fakeInfisical, 0o700);

    const result = invoke(
      [...baseArguments, `--source-key-file=APP_STORE_CONNECT_API_KEY_CONTENT:${source}`],
      { CAPTURE_PATH: capture, PATH: `${directory}:${process.env.PATH}` },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /raw-file name/u);
    const argumentsList = (await readFile(capture, "utf8")).trim().split("\n");
    assert.equal(
      argumentsList.includes(`APP_STORE_CONNECT_API_KEY_CONTENT=@${source}`),
      true,
    );
    assert.equal(argumentsList.some((argument) => argument.includes("line-two")), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
