import { cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { digestCanonicalJson } from "@talent-signal/evaluation";
import { BASELINE_OPTIMIZATION_CANDIDATE, loadedRelationshipTaskConfiguration, loadedRelationshipTaskPrompt,
  optimizationPrompt, relationshipTaskConfiguration, renderRelationshipTaskSelectionModule } from "@talent-signal/agent";

it("loads candidate and rollback source in fresh production providers and rejects private source at startup", async () => {
  const directory = mkdtempSync(join(tmpdir(), "get11-source-"));
  const model = "glm-4.5-flash";
  try {
    const staged = join(directory, "agent");
    cpSync(fileURLToPath(new URL("../../../agent/dist/", import.meta.url)), staged, { recursive: true });
    writeFileSync(join(staged, "package.json"), JSON.stringify({ type: "module" }));
    symlinkSync(fileURLToPath(new URL("../../../agent/node_modules/", import.meta.url)), join(staged, "node_modules"));
    const request = { objective: "What is confirmed?", context_blocks: [{ block_id: "block-1", block_key: "evidence",
      type: "evidence", status: "confirmed", headline: "One fact", summary: "Available after Monday.", items: [],
      evidence_fragment_ids: ["evidence-1"] }], allowed_citation_ids: ["evidence-1"] };
    const run = () => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const script = [
        "import { loadedRelationshipTaskConfiguration } from " + JSON.stringify(pathToFileURL(join(staged, "relationshipTaskConfiguration.js")).href) + ";",
        "import { ZhipuChatAnswerProvider } from " + JSON.stringify(pathToFileURL(join(staged, "chatAnswerProvider.js")).href) + ";",
        "let actual;",
        "const provider = new ZhipuChatAnswerProvider({apiKey:'offline-test',model:'glm-4.5-flash',fetcher:async (_url,init)=>{",
        "actual=JSON.parse(init.body).messages[0].content;",
        "return Response.json({model:'glm-4.5-flash',choices:[{message:{content:JSON.stringify({kind:'answer',title:'Known',body:'Available after Monday.',citation_ids:['evidence-1']})}}]});",
        "}});",
        "await provider.answer(" + JSON.stringify(request) + ");",
        "console.log(JSON.stringify({...loadedRelationshipTaskConfiguration('glm-4.5-flash'),actual}));",
      ].join("\n");
      const child = spawn(process.execPath, ["--input-type=module", "--eval", script], { env: { PATH: process.env.PATH ?? "/usr/bin:/bin" } });
      let stdout = "", stderr = "";
      child.stdout.on("data", value => { stdout += value; }); child.stderr.on("data", value => { stderr += value; });
      child.on("error", reject); child.on("close", code => resolve({ code, stdout, stderr }));
    });
    const candidate = { ...BASELINE_OPTIMIZATION_CANDIDATE, taskFragmentId: "evidence_first" as const };
    const selectionFile = join(staged, "prompts", "relationship-task-selection.js");
    writeFileSync(selectionFile, renderRelationshipTaskSelectionModule(candidate).replace(" as const;", ";"));
    const promoted = await run();
    expect(promoted.code, promoted.stderr).toBe(0);
    expect(JSON.parse(promoted.stdout)).toMatchObject({ taskConfigurationDigest: digestCanonicalJson(relationshipTaskConfiguration(model, candidate)), actual: optimizationPrompt(candidate) });
    expect(loadedRelationshipTaskPrompt().text).toBe(optimizationPrompt(BASELINE_OPTIMIZATION_CANDIDATE));
    writeFileSync(selectionFile, renderRelationshipTaskSelectionModule(BASELINE_OPTIMIZATION_CANDIDATE).replace(" as const;", ";"));
    const restored = await run();
    expect(restored.code, restored.stderr).toBe(0);
    expect(JSON.parse(restored.stdout).taskConfigurationDigest).toBe(loadedRelationshipTaskConfiguration(model).taskConfigurationDigest);
    const demonstration = "Private scoped content";
    writeFileSync(selectionFile, "export const RELATIONSHIP_TASK_SELECTION = " + JSON.stringify({
      schemaVersion: "relationship-task-selection.v1", candidate: { ...candidate, exampleIds: ["private-dev"] },
      examples: [{ exampleId: "private-dev", partition: "dev", dataClass: "private_business", demonstration,
        contentDigest: digestCanonicalJson(demonstration) }],
    }) + ";");
    const forbidden = await run();
    expect(forbidden.code).not.toBe(0);
    expect(forbidden.stderr).toContain("PRIVATE_DEMONSTRATION_GLOBAL_RELEASE_FORBIDDEN");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
