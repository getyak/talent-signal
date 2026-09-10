import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { ClaudeContactAgentModel, claudeHarnessConfiguration, claudeHarnessConfigurationReceipt, runClaudeHarness, claudeHarnessInterruptionCode } from "../../apps/agent/dist/index.js";
import { TalentSignalClient } from "../../packages/contracts/dist/index.js";
import { buildApp } from "../../apps/backend/dist/app.js";
import { runContactResearchTool } from "../../apps/agent-host/dist/contactResearchService.js";
const require=createRequire(new URL("../../apps/backend/package.json",import.meta.url)), {Pool}=require("pg");
const args=process.argv.slice(2);
assert(args.length===8&&args[0]==="--endpoint"&&args[2]==="--model"&&args[4]==="--database"&&args[6]==="--output");
const database=new URL(args[5]); assert(database.hostname==="127.0.0.1"&&database.pathname==="/get9_eval");
const configuration=claudeHarnessConfiguration({...process.env,ANTHROPIC_BASE_URL:args[1],TALENT_SIGNAL_AGENT_MODEL:args[3]});
const hash=value=>createHash("sha256").update(value).digest("hex");
const data=await readFile(new URL("./fixtures/get9-research.png",import.meta.url));
const pages=JSON.parse(await readFile(new URL("./fixtures/get9-public-sources.json",import.meta.url),"utf8"));
const image={media_type:"image/png",byte_size:data.length,content_hash:hash(data),data_base64:data.toString("base64")};
const objective="保存这段聊天，并查一下陈夏最近的公开工作背景，给出来源；旧经历和同名的人要分清。";
const report={evaluation:"get9-research.v1",createdAt:new Date().toISOString(),configuration:claudeHarnessConfigurationReceipt(configuration),
 fixture:{caseID:"E05",dataClass:"synthetic",imageHash:image.content_hash,objective,pages,
  networkBoundary:"Real Hao Claude SDK plus real HTTP/PostgreSQL/product research service. Exa-shaped source responses are controlled fixtures; no Exa/TikHub network request is claimed. Trial 3 injects one fetch failure."},
 rubric:{version:"get9-quality-v1",minimumEachDimension:3,scale:[0,1,2,3,4],dimensions:["task_completion","grounding","naturalness","recovery"]},
 trials:[],qualityReview:{status:"pending_independent_review"},releaseReady:false};
const pool=new Pool({connectionString:args[5],max:4,idleTimeoutMillis:0});let app,active;
const completions=new Map();
const model=new ClaudeContactAgentModel(configuration,async(config,request,signal)=>{
 const target=active,taskID=JSON.parse(request.context).response.task_id;let complete;
 completions.set(taskID,new Promise(resolve=>complete=resolve));
 target.originalImageHash=request.images[0].contentHash;target.budget=request.budget;
 target.effort = request.effort ?? "high"; target.skillHash = createHash("sha256").update(JSON.stringify(request.skills ?? [])).digest("hex"); target.effectivePromptHash=hash(request.systemPrompt);
 const observed={...request,tools:request.tools.map(tool=>({...tool,execute:async(...args)=>{
  const result=await tool.execute(...args);target.tools.push({name:tool.name,input:args[0],result});return result;
 }}))};
 try{target.receipt=await runClaudeHarness(config,observed,signal,undefined,null);return target.receipt;}
 catch(error){target.sdkFailure={code:claudeHarnessInterruptionCode(error),receipt:error.receipt};throw error;}
 finally{complete();}
});
const research={execute:async(input,signal)=>{
 signal.throwIfAborted();const target=active;target.researchRequests.push(input);
 const exaSource=page=>({...page,publishedAt:null,retrievedAt:"2026-09-09T02:00:00.000Z",contentHash:hash(page.text),providerID:"exa",providerRequestID:"controlled-fixture-no-vendor-request"});
 const exa={searchWeb:async()=>pages.map(exaSource),searchProfiles:async()=>[],fetchContent:async url=>{
  if(target.trial===3&&!target.injectedFailure){target.injectedFailure=true;throw new Error("CONTROLLED_FETCH_TIMEOUT");}
  const page=pages.find(p=>p.url===url);assert(page,"Only same-fixture discovered pages are readable");return exaSource(page);
 }};
 return runContactResearchTool(input,{}, {exa});
}};
try{
 app=await buildApp({pool,config:{databaseUrl:args[5],host:"127.0.0.1",port:0,allowedOrigins:[],appleSignInAudiences:[],appleSignInEnabled:false,passwordAuthEnabled:false,passwordRegistrationEnabled:false,simulatedAuthEnabled:true,internalLabEnabled:false,retentionSweepIntervalMs:3600000,sessionTtlSeconds:3600,chatMediaStorage:{provider:"local",directory:"/tmp/get9-research-synthetic-media"}},remoteChatProvider:null,personResearchProvider:null,screenshotContact:{model,research},labJobWorkerEnabled:false,labCIVerifier:null});
 const base=await app.listen({host:"127.0.0.1",port:0});
 for(let trial=1;trial<=3;trial++){
  const account=randomUUID(),user=randomUUID(),slug=`get9-research-${randomUUID()}`;
  await pool.query("INSERT INTO accounts(id,slug,name) VALUES($1,$2,'Synthetic GET-9 research')",[account,slug]);
  await pool.query("INSERT INTO users(id,account_id,email,display_name,kind) VALUES($1,$2,'research@synthetic.local','Synthetic owner','simulated_human')",[user,account]);
  const client=new TalentSignalClient(base),login=await client.login({account_slug:slug,user_email:"research@synthetic.local",client_label:"get9-synthetic-research-evaluation"});
  active={trial,accountID:account,tools:[],researchRequests:[]};const started=Date.now();
  const request=async(path,body)=>{const response=await fetch(`${base}${path}`,{method:body?"POST":"GET",headers:{authorization:`Bearer ${login.access_token}`,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});assert(response.ok,`Research HTTP ${response.status}`);return response.json();};
  try{
   const created=await request("/v1/contact-agent/tasks",{idempotency_key:randomUUID(),objective,image,captured_at:"2026-09-09T02:00:00.000Z",allow_public_research:true});
   let output=created;
   while(output.status==="running"&&Date.now()-started<360000){await delay(1000);output=await request(`/v1/contact-agent/tasks/${created.task_id}`);}
   await completions.get(created.task_id);
   // SDK completion precedes the runner's durable receipt and terminal state.
   const receiptDeadline=Date.now()+30000;
   while(Date.now()<receiptDeadline){
    const saved=await pool.query("SELECT jsonb_array_length(state->'model_receipts') AS count FROM screenshot_contact_tasks WHERE account_id=$1 AND id=$2",[account,created.task_id]);
    if(Number(saved.rows[0]?.count)>0)break;
    await delay(100);
   }
   output=await request(`/v1/contact-agent/tasks/${created.task_id}`);active.output=output;
   const fetched=output.public_sources.filter(s=>s.stage==="fetched"),fields=output.profile_fields;
   const official=fetched.find(s=>s.url===pages[0].url),historical=fetched.find(s=>s.url===pages[1].url);
   const confirmed=await pool.query("SELECT count(*) FROM confirmed_states WHERE account_id=$1",[account]);
   active.checks={sdkCompleted:Boolean(active.receipt),originalImageReachedMainAgent:active.originalImageHash===image.content_hash,
    actualModelMatched:active.receipt?.reportedModels.length===1&&active.receipt.reportedModels[0]===configuration.model.replace(/^anthropic\//u,""),
    completeInternalFiling:output.status==="completed"&&Boolean(output.capture_id)&&output.message_count>0,
    autonomousSearch:active.researchRequests.some(r=>r.input.operation==="search"),
    officialAndHistoricalFetched:Boolean(official&&historical),
    currentFieldCited:fields.some(f=>f.source_refs.includes(official?.source_id)&&f.source_excerpt.includes("LatticeWorks")),
    noNamesakeCareerClaim:fields.every(f=>!f.value.includes("摄影")),
    noConfirmedOverwrite:Number(confirmed.rows[0].count)===0,noExternalEffects:output.external_effects.length===0,
    searchOnlyIdentityClues:active.researchRequests.filter(r=>r.input.operation==="search").every(r=>!r.input.query.includes("收到")&&!r.input.query.includes("谢谢"))};
   active.status=Object.values(active.checks).every(Boolean)?"checks_passed":"checks_failed";
  }catch(error){active.status="failed";active.errorCode=claudeHarnessInterruptionCode(error);}
  active.durationMs=Date.now()-started;report.trials.push(active);await writeFile(args[7],JSON.stringify(report,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify({evaluation:report.evaluation,trial,status:active.status}));
 }
}finally{await app?.close();await pool.end();}
if(report.trials.some(t=>t.status!=="checks_passed"))process.exitCode=1;
