#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, relative } from "node:path";
import { PROMPT_DEFINITIONS } from "../../apps/agent/dist/prompts.js";
import { contentHash, importSource, opikClient, readSource, validateVersion } from "./library.mjs";

const usage = "Usage: opik.mjs status | sync [receipt.json] | export output.json | import PROMPT_NAME vN";
const [command = "status", argument, selectedVersion, ...extra] = process.argv.slice(2);
if (!["status", "sync", "export", "import"].includes(command) || extra.length
  || (command === "status" && argument) || (command !== "import" && selectedVersion)
  || (command === "export" && !argument)
  || (command === "import" && (!Object.hasOwn(PROMPT_DEFINITIONS, argument ?? "") || !/^v[1-9]\d*$/u.test(selectedVersion ?? "")))) throw new Error(usage);

const root = fileURLToPath(new URL("../../", import.meta.url));
const project = process.env.TALENT_SIGNAL_PROMPT_PROJECT ?? "talent-signal-prompts";
const client = opikClient({ base: process.env.TALENT_SIGNAL_PROMPT_REGISTRY_URL ?? "http://localhost:5173/api/",
  project, workspace: process.env.OPIK_WORKSPACE ?? "default", apiKey: process.env.OPIK_API_KEY });
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const gitCommit = git("rev-parse", "HEAD");
const worktreeDirty = Boolean(git("status", "--porcelain", "--untracked-files=normal"));
const sourcePath = name => {
  const path = resolve(root, "apps/agent/src", PROMPT_DEFINITIONS[name].sourceFile);
  if (!path.startsWith(resolve(root, "apps/agent/src/prompts") + "/")) throw new Error("Invalid prompt source path; rebuild the Agent package.");
  return path;
};
const sourceReceipt = (name, text, version) => ({ name, sourceFile: relative(root, sourcePath(name)),
  contentSha256: contentHash(text), opikVersion: version?.version_number ?? null,
  opikVersionId: version?.id ?? null, opikCommit: version?.commit ?? null });

if (command === "import") {
  const path = sourcePath(argument);
  const before = await readSource(path);
  const version = validateVersion(await client.retrieve(argument, { version_number: selectedVersion }));
  if (version.version_number !== selectedVersion) throw new Error("Opik returned a different version");
  const changed = before.text === version.template ? false : await importSource(path, before.source, version.template);
  console.log(JSON.stringify({ ...sourceReceipt(argument, version.template, version), changed,
    previousSha256: contentHash(before.text), message: "Source only. Review the diff, rebuild and deploy to change runtime behavior." }, null, 2));
} else {
  const prompts = [];
  if (command === "sync") await client.ensureMirrorEnvironment();
  for (const name of Object.keys(PROMPT_DEFINITIONS)) {
    const { text } = await readSource(sourcePath(name));
    const version = command === "sync" ? await client.mirror(name, text, {
      content_sha256: contentHash(text), git_commit: gitCommit, worktree_dirty: worktreeDirty,
      source_file: relative(root, sourcePath(name)), purpose: PROMPT_DEFINITIONS[name].description,
    }) : command === "export" ? null : await client.retrieve(name, { environment: "repository" });
    if (version) validateVersion(version);
    prompts.push({ ...sourceReceipt(name, text, version), matchesSource: version?.template === text,
      ...(command === "export" ? { template: text } : {}) });
  }
  const receipt = { authority: "repository", project, mirrorEnvironment: "repository", gitCommit, worktreeDirty, prompts };
  if (argument) await writeFile(resolve(argument), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(command === "export" ? { output: resolve(argument), exported: prompts.length } : receipt, null, 2));
  if (command === "status" && prompts.some(p => !p.matchesSource)) process.exitCode = 1;
}
