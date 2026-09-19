import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { CONTACT_INTAKE_TOOLS } from "./contactIntakeSchemas.js";
import {
  CONTACT_RESEARCH_CONTRACT, CONTACT_RESEARCH_DEFAULT_CHANNELS,
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
});
