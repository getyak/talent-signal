import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { CONTACT_INTAKE_TOOLS } from "./contactIntakeSchemas.js";
import {
  CONTACT_RESEARCH_CONTRACT, CONTACT_RESEARCH_DEFAULT_CHANNELS, CONTACT_RESEARCH_MAX_FETCH_SOURCES,
  ContactResearchToolRequestSchema, ContactResearchToolResponseSchema,
} from "./contactResearchSchemas.js";

describe("multi-channel contact research contract",()=>{
  it("defaults the model tool to the broad first-search channels and three results each",()=>{
    expect(CONTACT_INTAKE_TOOLS.search_contact_public.schema.parse({query:"Example Person"})).toEqual({
      channels:[...CONTACT_RESEARCH_DEFAULT_CHANNELS],query:"Example Person",results_per_channel:3,
    });
  });

  it("accepts every admitted channel once and rejects duplicate channels",()=>{
    const base={contract_version:CONTACT_RESEARCH_CONTRACT,task_id:randomUUID(),call_id:randomUUID(),anchors:["Example Person"]};
    const channels=["linkedin","web","xiaohongshu","reddit","douyin","tiktok","weibo","threads","instagram"];
    expect(ContactResearchToolRequestSchema.parse({...base,input:{operation:"search",channels,query:"Example Person",maximum_results_per_channel:3}}).input)
      .toMatchObject({channels});
    expect(()=>ContactResearchToolRequestSchema.parse({...base,input:{operation:"search",channels:["web","web"],query:"Example Person",maximum_results_per_channel:3}}))
      .toThrow("Channels must be unique");
  });

  it("keeps per-channel failure metadata bounded and defaults it off for fetch receipts",()=>{
    const parsed=ContactResearchToolResponseSchema.parse({contract_version:CONTACT_RESEARCH_CONTRACT,
      task_id:randomUUID(),call_id:randomUUID(),sources:[],external_effects:[]});
    expect(parsed.channels).toEqual([]);
    expect(()=>ContactResearchToolResponseSchema.parse({...parsed,channels:[{
      channel:"reddit",provider:"tikhub",status:"failed",result_count:0,error_code:"raw provider error",
    }]})).toThrow();
    expect(()=>ContactResearchToolResponseSchema.parse({...parsed,channels:[{
      channel:"reddit",provider:"tikhub",status:"failed",result_count:1,truncated:false,error_code:"AUTH_FAILED",
    }]})).toThrow();
    expect(()=>ContactResearchToolResponseSchema.parse({...parsed,channels:[{
      channel:"reddit",provider:"tikhub",status:"ok",result_count:0,truncated:false,error_code:"FAILED",
    }]})).toThrow();
    expect(()=>ContactResearchToolResponseSchema.parse({...parsed,channels:[{
      channel:"reddit",provider:"exa",status:"ok",result_count:0,truncated:false,error_code:null,
    }]})).toThrow("reddit must use tikhub");
  });

  it("bounded fetch accepts one to five unique resolved sources and defaults an empty outcome list",()=>{
    const base={contract_version:CONTACT_RESEARCH_CONTRACT,task_id:randomUUID(),call_id:randomUUID(),anchors:["Example Person"]};
    const publicSource=(index:number)=>({source_id:String(index).repeat(64).slice(0,64),url:`https://example.com/${index}`,title:"Example",
      text:"Body",channel:"web",provider_id:"exa",provider_request_id:null,content_hash:"a".repeat(64),
      retrieved_at:"2026-09-06T00:00:00.000Z",stage:"discovered"});
    const parsed=ContactResearchToolRequestSchema.parse({...base,input:{operation:"fetch",sources:[publicSource(1),publicSource(2)]}});
    expect(parsed.input).toMatchObject({operation:"fetch",sources:[{source_id:"11".repeat(32)},{source_id:"22".repeat(32)}]});
    expect(()=>ContactResearchToolRequestSchema.parse({...base,input:{operation:"fetch",sources:[]}})).toThrow();
    expect(()=>ContactResearchToolRequestSchema.parse({...base,input:{operation:"fetch",sources:[publicSource(1),publicSource(1)]}}))
      .toThrow("Source references must be unique.");
    expect(()=>ContactResearchToolRequestSchema.parse({...base,input:{operation:"fetch",sources:[{
      ...publicSource(1),channel:"reddit",provider_id:"exa",
    }]}})).toThrow("reddit must use tikhub");
    const excess=Array.from({length:CONTACT_RESEARCH_MAX_FETCH_SOURCES+1},(_,index)=>publicSource(index+1));
    expect(()=>ContactResearchToolRequestSchema.parse({...base,input:{operation:"fetch",sources:excess}})).toThrow();
    expect(ContactResearchToolResponseSchema.parse({contract_version:base.contract_version,task_id:base.task_id,
      call_id:base.call_id,sources:[],external_effects:[]}).fetch_outcomes).toEqual([]);
  });

  it("requires an ordered unique batch for the model fetch tool",()=>{
    expect(CONTACT_INTAKE_TOOLS.fetch_contact_source.schema.parse({source_ids:["public2","a".repeat(64)]}))
      .toEqual({source_ids:["public2","a".repeat(64)]});
    expect(()=>CONTACT_INTAKE_TOOLS.fetch_contact_source.schema.parse({source_ids:["public1","public1"]}))
      .toThrow("List each source reference at most once.");
    expect(()=>CONTACT_INTAKE_TOOLS.fetch_contact_source.schema.parse({source_ids:[]})).toThrow();
  });

  it("keeps per-source fetch outcomes strict, ordered and bounded",()=>{
    const parsed=ContactResearchToolResponseSchema.parse({contract_version:CONTACT_RESEARCH_CONTRACT,
      task_id:randomUUID(),call_id:randomUUID(),sources:[],external_effects:[]});
    const outcome={source_id:"a".repeat(64),channel:"xiaohongshu",provider:"tikhub",status:"unsupported",error_code:"UNSUPPORTED"};
    expect(ContactResearchToolResponseSchema.parse({...parsed,fetch_outcomes:[outcome]}).fetch_outcomes).toEqual([outcome]);
    expect(()=>ContactResearchToolResponseSchema.parse({...parsed,fetch_outcomes:[{...outcome,status:"skipped"}]})).toThrow();
    expect(()=>ContactResearchToolResponseSchema.parse({...parsed,fetch_outcomes:[{...outcome,error_code:"raw provider error"}]})).toThrow();
    expect(()=>ContactResearchToolResponseSchema.parse({...parsed,fetch_outcomes:[{...outcome,provider:"tikhub",channel:"linkedin"}]})).toThrow("linkedin must use exa");
    expect(()=>ContactResearchToolResponseSchema.parse({...parsed,fetch_outcomes:Array.from({length:CONTACT_RESEARCH_MAX_FETCH_SOURCES+1},
      (_,index)=>({...outcome,source_id:String(index%10).repeat(64).slice(0,64)}))})).toThrow();
    expect(()=>ContactResearchToolResponseSchema.parse({...parsed,fetch_outcomes:[{...outcome,extra:true}]})).toThrow();
    expect(()=>ContactResearchToolResponseSchema.parse({...parsed,fetch_outcomes:[{...outcome,provider:"exa",status:"ok",error_code:"FAILED"}]})).toThrow();
  });
});
