import { describe, expect, it, vi } from "vitest";
import { ZhipuContactAgentModel } from "./contactIntakeProvider.js";

const extraction={platform:"Synthetic",conversation_kind:"direct",contact_name:"Example Person",identity_clues:[],messages:[{message_id:"model-invented",sequence:9,text:"Exact visible message",speaker_side:"left",speaker_label:null,time_text:null}],uncertainties:[]};
const signal=()=>new AbortController().signal;
function provider(fetcher:typeof fetch){return new ZhipuContactAgentModel({apiKey:"private-fixture-key",model:"fixture-tools",visionModel:"fixture-vision",fetcher});}
const nextInput={objective:"File this screenshot",extraction:{...extraction,conversation_kind:"direct" as const,messages:extraction.messages.map(m=>({...m,speaker_side:"left" as const}))},state:{},observations:[],tools:["search_contacts" as const],remainingTokens:3000};
describe("contact Agent provider",()=>{
  it("transmits one image to the admitted vision endpoint, normalizes message references, and retains provider identity",async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({id:"vision-receipt",model:"fixture-vision",choices:[{message:{content:JSON.stringify(extraction)}}],usage:{prompt_tokens:40,completion_tokens:20}})));
    const result=await provider(fetcher).extract({media_type:"image/png",byte_size:1,content_hash:"a".repeat(64),data_base64:"AA=="},signal());
    expect(result.extraction.messages[0]).toMatchObject({message_id:"m1",sequence:0,text:"Exact visible message"});
    expect(result).toMatchObject({model:"fixture-vision",providerRequestID:"vision-receipt",inputTokens:40,outputTokens:20});
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://open.bigmodel.cn/api/paas/v4/chat/completions");
    expect(JSON.stringify(result)).not.toContain("private-fixture-key");
  });
  it("requires a real typed function call and exposes only the admitted tool subset",async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({id:"tool-receipt",model:"fixture-tools",choices:[{message:{tool_calls:[{id:"call-1",function:{name:"search_contacts",arguments:'{"query":"Example Person"}'}}]}}]})));
    const result=await provider(fetcher).next(nextInput,signal());expect(result.calls).toEqual([{id:"call-1",name:"search_contacts",arguments:{query:"Example Person"}}]);
    const body=JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));expect(body.tools.map((t:{function:{name:string}})=>t.function.name)).toEqual(["search_contacts"]);expect(body.parallel_tool_calls).toBe(false);
  });
  it("does not mistake plain completion text or an unadmitted provider identity for executed work",async()=>{
    const fetcher=vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({id:"receipt",model:"fixture-tools",choices:[{message:{content:"I created the contact."}}]})))
      .mockResolvedValueOnce(new Response(JSON.stringify({id:"receipt",model:"other-model",choices:[{message:{content:"{}"}}]})));
    await expect(provider(fetcher).next(nextInput,signal())).rejects.toThrow("CONTACT_AGENT_EXPECTED_ONE_TOOL_CALL");
    await expect(provider(fetcher).next(nextInput,signal())).rejects.toThrow("CONTACT_AGENT_PROVIDER_IDENTITY_MISMATCH");
  });
  it("reports provider rejection without exposing its response body",async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response("secret provider diagnostic",{status:403}));
    await expect(provider(fetcher).next(nextInput,signal())).rejects.toThrow("CONTACT_AGENT_PROVIDER_HTTP_403");
  });
  it("bounds streamed provider data and sanitizes malformed JSON",async()=>{
    const fetcher=vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("x".repeat(1_000_001)))
      .mockResolvedValueOnce(new Response("private malformed diagnostic"));
    await expect(provider(fetcher).next(nextInput,signal())).rejects.toThrow("CONTACT_AGENT_PROVIDER_RESPONSE_TOO_LARGE");
    await expect(provider(fetcher).next(nextInput,signal())).rejects.toThrow("CONTACT_AGENT_PROVIDER_INVALID_JSON");
  });
});
