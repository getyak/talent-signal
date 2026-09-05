import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CONTACT_RESEARCH_CONTRACT } from "@talent-signal/agent";
import { runContactResearchTool } from "./contactResearchService.js";

const source={url:"https://www.linkedin.com/in/example/",title:"Example Person",text:"Engineer at Example Labs",publishedAt:null,
  retrievedAt:"2026-09-06T00:00:00.000Z",contentHash:"a".repeat(64),providerID:"exa" as const,providerRequestID:"public-request"};
const request=(channel="linkedin",query="Example Person")=>({contract_version:CONTACT_RESEARCH_CONTRACT,task_id:randomUUID(),call_id:randomUUID(),anchors:["Example Person"],input:{operation:"search",channel,query,maximum_results:2}});
describe("public contact research boundary",()=>{
  it("dispatches LinkedIn and web separately, preserving discovery and fetched provenance",async()=>{
    const exa={searchProfiles:vi.fn().mockResolvedValue([source]),searchWeb:vi.fn().mockResolvedValue([source]),fetchContent:vi.fn().mockResolvedValue(source)};
    const first=request();const result=await runContactResearchTool(first,{}, {exa});
    expect(exa.searchProfiles).toHaveBeenCalledWith("Example Person",2,expect.any(AbortSignal));expect(exa.searchWeb).not.toHaveBeenCalled();
    expect(result).toMatchObject({task_id:first.task_id,call_id:first.call_id,external_effects:[],sources:[{provider_id:"exa",stage:"discovered",content_hash:source.contentHash}]});
    await runContactResearchTool(request("web"),{}, {exa});expect(exa.searchWeb).toHaveBeenCalledOnce();
    const fetched=await runContactResearchTool({...first,call_id:randomUUID(),input:{operation:"fetch",source:result.sources[0]}},{},{exa});
    expect(fetched.sources[0]?.stage).toBe("fetched");expect(exa.fetchContent).toHaveBeenCalledWith(source.url,expect.any(AbortSignal));
  });
  it("blocks unrelated and private lookups before any provider dispatch",async()=>{
    const exa={searchProfiles:vi.fn(),searchWeb:vi.fn(),fetchContent:vi.fn()};
    await expect(runContactResearchTool(request("linkedin","Another Person"),{},{exa})).rejects.toThrow("CONTACT_RESEARCH_QUERY_OUT_OF_SCOPE");
    await expect(runContactResearchTool(request("web","Example Person home address"),{},{exa})).rejects.toThrow("CONTACT_RESEARCH_PRIVATE_LOOKUP_PROHIBITED");
    expect(exa.searchProfiles).not.toHaveBeenCalled();expect(exa.searchWeb).not.toHaveBeenCalled();
  });
  it("dispatches all four TikHub platforms with no chat payload or implicit fallback",async()=>{
    const tikhub={searchProfiles:vi.fn().mockResolvedValue([{platform:"weibo",providerID:"tikhub",providerRequestID:"social-request",profileID:"1",displayName:"Example Person",handle:"example",biography:"Public professional summary",profileUrl:"https://weibo.com/u/1",avatarUrl:null,verified:null,contentHash:"b".repeat(64),retrievedAt:"2026-09-06T00:00:00.000Z"}])};
    for(const channel of ["douyin","tiktok","weibo","threads"]){
      const result=await runContactResearchTool(request(channel),{},{tikhub});
      expect(result.sources[0]).toMatchObject({channel,provider_id:"tikhub",stage:"profile_observation"});
      expect(tikhub.searchProfiles).toHaveBeenLastCalledWith({platform:channel,query:"Example Person",maximumResults:2},expect.any(AbortSignal));
    }
    tikhub.searchProfiles.mockRejectedValueOnce(new Error("TIKHUB_AUTH_FAILED"));
    await expect(runContactResearchTool(request("weibo"),{},{tikhub})).rejects.toThrow("TIKHUB_AUTH_FAILED");
  });
  it("rejects a changed source identity before fetching",async()=>{
    const exa={searchProfiles:vi.fn(),searchWeb:vi.fn(),fetchContent:vi.fn()};
    const input={...request(),input:{operation:"fetch",source:{source_id:createHash("sha256").update("exa:https://different.example/").digest("hex"),url:source.url,title:source.title,text:source.text,
      channel:"linkedin",provider_id:"exa",provider_request_id:"public-request",content_hash:source.contentHash,retrieved_at:source.retrievedAt,stage:"discovered"}}};
    await expect(runContactResearchTool(input,{},{exa})).rejects.toThrow("CONTACT_RESEARCH_SOURCE_ID_MISMATCH");expect(exa.fetchContent).not.toHaveBeenCalled();
  });
});
