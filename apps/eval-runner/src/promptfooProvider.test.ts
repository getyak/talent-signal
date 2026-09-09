import { afterEach,expect,it,vi } from "vitest";
import { type LabJobRequest } from "@talent-signal/contracts";
const state=vi.hoisted(()=>({jobs:new Map<string,{id:string;caseID:string}>(),active:null as string|null,starts:0}));
vi.mock("@talent-signal/contracts",async importOriginal=>{
  const actual=await importOriginal<typeof import("@talent-signal/contracts")>();
  return {...actual,TalentSignalClient:class {
    async getLabRegression(id:string){return {regression:{content_hash:id,snapshot:{task:"relationship_text",case:{id,input_hash:`input-${id}`,revision:1}}}};}
    async getLabJobCatalog(){return {catalog_revision:"catalog"};}
    async startLabJob(request:LabJobRequest){
      if(state.active)throw new actual.TalentSignalHttpError(409,"LAB_EXPERIMENT_BUSY","Busy",null);
      state.starts++;state.active=request.id;state.jobs.set(request.id,{id:request.id,caseID:request.case_ids[0]!});
      return {job:{id:request.id,status:"running"}};
    }
    async getLabJob(id:string){
      const job=state.jobs.get(id);if(!job)throw new actual.TalentSignalHttpError(404,"NOT_FOUND","Missing",null);
      state.active=null;
      return {job:{id,status:"completed",attempts:[0,1].map(index=>({id:`${id}-${index}`,configuration_index:index,status:"completed",
        answer:`${job.caseID}-${index}`,error_code:null,actual_model:"actual-model",actual_prompt_revision:"revision",input_tokens:2,output_tokens:3}))}};
    }
  }};
});
import Provider from "./promptfooProvider.js";
afterEach(()=>{vi.unstubAllEnvs();state.jobs.clear();state.active=null;state.starts=0;});
it("shares one Lab job per case across both providers and waits for concurrent cases",async()=>{
  vi.stubEnv("TALENT_SIGNAL_EVAL_TOKEN","synthetic-token");
  const configurations=[{model:"model",prompt_preset:"baseline"},{model:"model",prompt_preset:"concise"}] as LabJobRequest["configurations"];
  const providers=([0,1] as const).map(configurationIndex=>new Provider({config:{backendURL:"http://127.0.0.1:4343",runKey:"same-run",configurationIndex,configurations}}));
  const results=await Promise.all(["first","second"].flatMap(id=>providers.map(provider=>provider.callApi(JSON.stringify({id,content_hash:id})))));
  expect(results.map(result=>(result as {output:string}).output)).toEqual(["first-0","first-1","second-0","second-1"]);
  expect(state.starts).toBe(2);
  await providers[0]!.callApi(JSON.stringify({id:"first",content_hash:"first"}));expect(state.starts).toBe(2);
});
it("returns provider failures as errors",async()=>{
  vi.stubEnv("TALENT_SIGNAL_EVAL_TOKEN","synthetic-token");
  const provider=new Provider({config:{backendURL:"http://127.0.0.1:4343",runKey:"run",configurationIndex:0,configurations:[] as unknown as LabJobRequest["configurations"]}});
  expect(await provider.callApi("invalid json")).toHaveProperty("error");
});
