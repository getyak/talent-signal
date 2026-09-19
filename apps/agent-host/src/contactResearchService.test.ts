import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CONTACT_RESEARCH_CONTRACT } from "@talent-signal/agent";
import { runContactResearchTool } from "./contactResearchService.js";
import type { TikHubProvider } from "./tikHubProvider.js";

const source={url:"https://www.linkedin.com/in/example/",title:"Example Person",text:"Engineer at Example Labs",publishedAt:null,
  retrievedAt:"2026-09-06T00:00:00.000Z",contentHash:"a".repeat(64),providerID:"exa" as const,providerRequestID:"public-request"};
const request=(channels=["linkedin"],query="Example Person")=>({contract_version:CONTACT_RESEARCH_CONTRACT,task_id:randomUUID(),call_id:randomUUID(),anchors:["Example Person"],input:{operation:"search",channels,query,maximum_results_per_channel:2}});
describe("public contact research boundary",()=>{
  it("records browser provenance separately from discovery and forwards cancellation",async()=>{
    const exa={searchProfiles:vi.fn().mockResolvedValue([source]),searchWeb:vi.fn(),fetchContent:vi.fn()};
    const first=request();const discovered=await runContactResearchTool(first,{},{exa});
    const browser=vi.fn().mockResolvedValue({url:source.url,title:"Rendered public page",text:"Rendered engineer biography",
      engine:"chromium",engineVersion:"123.0",requests:2,blockedRequests:1,httpRequests:3,responseBytes:300});
    const call={...first,call_id:randomUUID(),input:{operation:"browse",source:discovered.sources[0]}};
    const result=await runContactResearchTool(call,{},{browse:browser,exa});
    expect(exa.fetchContent).not.toHaveBeenCalled();
    expect(result.sources[0]).toMatchObject({provider_id:"browser",stage:"fetched",text:"Rendered engineer biography",
      provider_request_id:call.call_id,browser_observation:{discovered_source_id:discovered.sources[0]?.source_id,engine:"chromium",blocked_requests:1}});
    expect(result.sources[0]?.content_hash).toBe(createHash("sha256").update("Rendered engineer biography").digest("hex"));
    const abort=new AbortController();abort.abort();
    await expect(runContactResearchTool(call,{},{browse:browser},abort.signal)).rejects.toThrow();
    expect(browser).toHaveBeenCalledOnce();
  });
  it("dispatches LinkedIn and web concurrently, preserving ordered outcomes and fetched provenance",async()=>{
    const exa={searchProfiles:vi.fn().mockResolvedValue([source]),searchWeb:vi.fn().mockResolvedValue([source]),fetchContent:vi.fn().mockResolvedValue(source)};
    const first=request(["linkedin","web"]);const result=await runContactResearchTool(first,{}, {exa});
    expect(exa.searchProfiles).toHaveBeenCalledWith("Example Person",2,expect.any(AbortSignal));expect(exa.searchWeb).toHaveBeenCalledOnce();
    expect(result).toMatchObject({task_id:first.task_id,call_id:first.call_id,external_effects:[],
      channels:[{channel:"linkedin",provider:"exa",status:"ok",result_count:1,truncated:false,error_code:null},
        {channel:"web",provider:"exa",status:"ok",result_count:0,truncated:true,error_code:null}],
      sources:[{provider_id:"exa",stage:"discovered",content_hash:source.contentHash}]});
    expect(result.sources).toHaveLength(1); // The same canonical URL is deduplicated across channels.
    const fetched=await runContactResearchTool({...first,call_id:randomUUID(),input:{operation:"fetch",source:result.sources[0]}},{},{exa});
    expect(fetched).toMatchObject({channels:[],sources:[{stage:"fetched"}]});expect(exa.fetchContent).toHaveBeenCalledWith(source.url,expect.any(AbortSignal));
  });
  it("blocks unrelated and private lookups before any provider dispatch",async()=>{
    const exa={searchProfiles:vi.fn(),searchWeb:vi.fn(),fetchContent:vi.fn()};
    await expect(runContactResearchTool(request(["linkedin"],"Another Person"),{},{exa})).rejects.toThrow("CONTACT_RESEARCH_QUERY_OUT_OF_SCOPE");
    await expect(runContactResearchTool(request(["web"],"Example Person home address"),{},{exa})).rejects.toThrow("CONTACT_RESEARCH_PRIVATE_LOOKUP_PROHIBITED");
    expect(exa.searchProfiles).not.toHaveBeenCalled();expect(exa.searchWeb).not.toHaveBeenCalled();
  });
  it("dispatches every TikHub platform and preserves partial failure without fallback",async()=>{
    const social=["xiaohongshu","reddit","douyin","tiktok","weibo","threads","instagram"];
    const searchProfiles=vi.fn(async({platform}:{platform:string})=>{
      if(platform==="reddit")throw Object.assign(new Error("denied"),{code:"TIKHUB_AUTH_FAILED"});
      return [{platform,providerID:"tikhub" as const,providerRequestID:"social-request",profileID:"1",displayName:"Example Person",handle:"example",biography:"Public professional summary",profileUrl:`https://${platform}.example/user/example`,avatarUrl:null,verified:null,contentHash:"b".repeat(64),retrievedAt:"2026-09-06T00:00:00.000Z"}];
    });
    const tikhub={searchProfiles:searchProfiles as TikHubProvider["searchProfiles"]};
    const result=await runContactResearchTool(request(social),{},{tikhub});
    expect(searchProfiles).toHaveBeenCalledTimes(7);
    for(const channel of social)expect(searchProfiles).toHaveBeenCalledWith({platform:channel,query:"Example Person",maximumResults:2},expect.any(AbortSignal));
    expect(result.sources).toHaveLength(6);
    expect(result.channels).toEqual(social.map(channel=>channel==="reddit"
      ? {channel,provider:"tikhub",status:"failed",result_count:0,truncated:false,error_code:"AUTH_FAILED"}
      : {channel,provider:"tikhub",status:"ok",result_count:1,truncated:false,error_code:null}));
  });
  it("marks channel outcomes when the combined response cap omits normalized results",async()=>{
    const social=["xiaohongshu","douyin","tiktok","weibo","threads","instagram"];
    const searchProfiles=vi.fn(async({platform}:{platform:string})=>Array.from({length:5},(_,index)=>({
      platform,providerID:"tikhub" as const,providerRequestID:"social-request",profileID:`${platform}-${index}`,
      displayName:`Example Person ${index}`,handle:`example-${platform}-${index}`,biography:null,
      profileUrl:`https://${platform}.example/user/${index}`,avatarUrl:null,verified:null,
      contentHash:createHash("sha256").update(`${platform}-${index}`).digest("hex"),retrievedAt:"2026-09-06T00:00:00.000Z",
    })));
    const input=request(social);input.input.maximum_results_per_channel=5;
    const result=await runContactResearchTool(input,{}, {tikhub:{searchProfiles:searchProfiles as TikHubProvider["searchProfiles"]}});
    expect(result.sources).toHaveLength(25);
    expect(result.channels.at(-1)).toMatchObject({channel:"instagram",status:"ok",result_count:0,truncated:true});
  });
  it("rejects a changed source identity before fetching",async()=>{
    const exa={searchProfiles:vi.fn(),searchWeb:vi.fn(),fetchContent:vi.fn()};
    const input={...request(),input:{operation:"fetch",source:{source_id:createHash("sha256").update("exa:https://different.example/").digest("hex"),url:source.url,title:source.title,text:source.text,
      channel:"linkedin",provider_id:"exa",provider_request_id:"public-request",content_hash:source.contentHash,retrieved_at:source.retrievedAt,stage:"discovered"}}};
    await expect(runContactResearchTool(input,{},{exa})).rejects.toThrow("CONTACT_RESEARCH_SOURCE_ID_MISMATCH");expect(exa.fetchContent).not.toHaveBeenCalled();
  });
});
