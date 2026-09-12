import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { z } from "zod";
import sharp from "sharp";
import { ClaudeContactAgentModel } from "./claudeContactProvider.js";
import { claudeHarnessConfiguration } from "./claudeHarnessConfiguration.js";
import type { ClaudeHarnessRequest } from "./claudeHarness.js";

describe("multimodal contact SDK adapter", () => {
  it("passes reviewed text to the same harness with a source-specific understanding tool",async()=>{
    const text="Synthetic Person works at Example Labs.";
    const readImage=vi.fn(async()=>{throw new Error("TEXT_RUN_MUST_NOT_READ_PIXELS");});
    const execute=vi.fn(async (_configuration,request:ClaudeHarnessRequest)=>{
      expect(JSON.parse(request.context!).reviewed_source_text).toBe(text);
      expect(request.images).toEqual([]);
      expect(request.tools.map(t=>t.name)).toContain("record_text_understanding");
      expect(request.tools.map(t=>t.name)).not.toContain("record_screenshot_understanding");
      expect(request.tools.map(t=>t.name)).not.toContain("inspect_screenshot_region");
      expect(request.subagents).toEqual([]);
      return {text:"Synthetic",structuredOutput:null,sessionID:"synthetic-text",inputTokens:1,outputTokens:1,estimatedUsd:0,turns:1,toolCalls:0,terminalReason:"completed",permissionDenials:[],reportedModels:["synthetic"]};
    });
    const model=new ClaudeContactAgentModel(claudeHarnessConfiguration({ANTHROPIC_API_KEY:"synthetic",TALENT_SIGNAL_AGENT_MODEL:"synthetic"}),execute);
    await model.run({objective:"Read source",text,images:[],systemPrompt:"Synthetic",state:{},assertCurrent:async()=>{},readImage,recordUnderstanding:vi.fn(),invoke:vi.fn()},new AbortController().signal);
    expect(execute).toHaveBeenCalledOnce();
    expect(readImage).not.toHaveBeenCalled();
  });
  it("starts with the original image and lets the Agent request understanding when useful", async () => {
    const bytes = await sharp({create:{width:20,height:40,channels:3,background:"white"}}).png().toBuffer();
    const config = claudeHarnessConfiguration({ ANTHROPIC_API_KEY: "synthetic", TALENT_SIGNAL_AGENT_MODEL: "synthetic" });
    const record = vi.fn(async () => ({ status: "unconfirmed" }));
    const execute = vi.fn(async (_configuration, request: ClaudeHarnessRequest) => {
      expect(request.images?.[0]?.contentHash).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(request.images?.[0]?.kind === "image" && request.images[0].dataBase64).toBe(bytes.toString("base64"));
      expect(record).not.toHaveBeenCalled();
      expect(request.tools.map((tool) => tool.name)).toContain("record_screenshot_understanding");
      expect(request.tools.map((tool) => tool.name)).toContain("inspect_screenshot_region");
      expect(request.tools.find(tool => tool.name === "browse_contact_source")?.readOnly).toBe(true);
      expect(request.subagents?.[0]?.tools).toEqual(["inspect_screenshot_region"]);
      expect(request.skills?.map((skill) => skill.name)).toEqual(["relationship-evidence"]);
      expect(request.outputSchema).toBeUndefined();
      const finish = request.tools.find((tool) => tool.name === "finish_contact_task")!;
      const schema = z.toJSONSchema(finish.schema) as any;
      expect(schema.properties.findings.description).toContain("Return []");
      expect(schema.properties.findings.items.properties.text.description).toContain("supported entirely by the cited original chat messages");
      expect(schema.properties.findings.items.properties.message_refs.description).toContain("All actual message_id");
      expect(schema.properties.findings.items.properties.source_excerpt.description).toContain("One contiguous exact substring");
      return { text: "Synthetic", structuredOutput: null, sessionID: "synthetic-run", inputTokens: 10, outputTokens: 10,
        estimatedUsd: 0, turns: 1, toolCalls: 0, terminalReason: "completed", permissionDenials: [], reportedModels: ["synthetic"] };
    });
    const model = new ClaudeContactAgentModel(config, execute);
    await model.run({ objective: "Read the profile", systemPrompt: "Synthetic", state: {}, assertCurrent: async () => {}, readImage: async operation => operation(),
      images: [{ media_type: "image/png", byte_size: bytes.length, content_hash: createHash("sha256").update(bytes).digest("hex"), data_base64: bytes.toString("base64") }],
      recordUnderstanding: record, invoke: vi.fn(async () => ({})) }, new AbortController().signal);
    expect(execute).toHaveBeenCalledOnce();
    expect(record).not.toHaveBeenCalled();
    await expect(model.extract()).rejects.toThrow("USE_MULTIMODAL_RUN");
    await expect(model.next()).rejects.toThrow("USE_SDK_TOOL_LOOP");
  });
  it("omits only identical successful navigation state and preserves changed state, errors, evidence and run isolation", async () => {
    const initial = {allowed_tools:["search_contacts"],contact:null};
    const changed = {allowed_tools:[],contact:{person_id:"synthetic-person"}};
    const source = Object.freeze({current_state:initial, source_excerpt:"Exact original evidence", source_refs:["m1"]});
    const invoke = vi.fn();
    const execute = vi.fn(async (_configuration, request: ClaudeHarnessRequest) => {
      const tool = request.tools.find(tool => tool.name === "search_contacts")!;
      const call = async () => {
        const result = await tool.execute({query:"Synthetic"}, new AbortController().signal) as {content:Array<{text:string}>;isError:boolean};
        return {data:JSON.parse(result.content[0]!.text),isError:result.isError};
      };
      invoke.mockResolvedValueOnce(source).mockResolvedValueOnce(source)
        .mockResolvedValueOnce({error:"CONTACT_TOOL_NOT_AUTHORIZED",current_state:changed})
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce({current_state:changed,source_excerpt:"New exact evidence"});
      expect(await call()).toEqual({data:source,isError:false});
      expect(await call()).toEqual({data:{source_excerpt:source.source_excerpt,source_refs:["m1"]},isError:false});
      expect(await call()).toEqual({data:{error:"CONTACT_TOOL_NOT_AUTHORIZED",current_state:changed},isError:true});
      expect(await call()).toEqual({data:source,isError:false});
      expect(await call()).toEqual({data:{current_state:changed,source_excerpt:"New exact evidence"},isError:false});
      expect(source.current_state).toBe(initial);
      return {text:"Synthetic",structuredOutput:null,sessionID:"synthetic",inputTokens:10,outputTokens:10,
        estimatedUsd:0,turns:1,toolCalls:5,terminalReason:"completed",permissionDenials:[],reportedModels:["synthetic"]};
    });
    const model = new ClaudeContactAgentModel(claudeHarnessConfiguration({ANTHROPIC_API_KEY:"synthetic",TALENT_SIGNAL_AGENT_MODEL:"synthetic"}),execute);
    for (let run=0;run<2;run++) await model.run({objective:"Synthetic",systemPrompt:"Synthetic",state:{},images:[],
      assertCurrent:async()=>{},readImage:async operation=>operation(),recordUnderstanding:vi.fn(),invoke},new AbortController().signal);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledTimes(10);
  });

});
