import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {ClaudeChatProvider,claudeHarnessConfiguration,runClaudeHarness} from "../../apps/agent/dist/index.js";
import {TalentSignalClient} from "../../packages/contracts/dist/index.js";
import {buildApp} from "../../apps/backend/dist/app.js";

const args=process.argv.slice(2);
assert(args.length===4&&args[0]==="--database"&&args[2]==="--output");
const database=new URL(args[1]);assert(database.hostname==="127.0.0.1"&&database.pathname==="/get9_eval");
const require=createRequire(new URL("../../apps/agent/package.json",import.meta.url));
const backendRequire=createRequire(new URL("../../apps/backend/package.json",import.meta.url));
const sharp=require("sharp"),{Pool}=backendRequire("pg");
const configuration=claudeHarnessConfiguration({...process.env,ANTHROPIC_BASE_URL:"https://api.hao.ai/anthropic",TALENT_SIGNAL_AGENT_MODEL:"anthropic/claude-sonnet-5"});
const marker=`MEM-${randomUUID().slice(0,8)}`,name=`Mira ${randomUUID().slice(0,6)}`;
const bytes=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="700" height="9000"><rect width="700" height="9000" fill="white"/><g font-family="sans-serif" fill="black"><text x="30" y="55" font-size="30">${name}</text><text x="30" y="8550" font-size="24">Document reference ${marker}</text></g></svg>`)).png().toBuffer();
const image={media_type:"image/png",byte_size:bytes.length,content_hash:createHash("sha256").update(bytes).digest("hex"),data_base64:bytes.toString("base64")};
const report={evaluation:"get9-memory-original-image.v1",createdAt:new Date().toISOString(),dataClass:"synthetic",
  scope:"Real HTTP scoped chat, SDK, PostgreSQL and original storage. Source ingestion is scripted synthetic setup; no installed-client acceptance.",
  fixture:{name,marker,originalHash:image.content_hash},tools:[],checks:{},qualityReview:{status:"pending_independent_review"},status:"running",releaseReady:false};
const provider=new ClaudeChatProvider(configuration,async(config,request,signal)=>{
  report.run={continuation:Boolean(request.continuation),imageToolResults:request.imageToolResults,context:JSON.parse(request.context),sourceRefs:request.observation?.source_refs};
  const traced={...request,tools:request.tools.map(tool=>({...tool,execute:async(...input)=>{
    const result=await tool.execute(...input);
    report.tools.push({name:tool.name,input:input[0],isError:result.isError??false,content:result.content.map(block=>block.type==="image"
      ?{type:"image",mimeType:block.mimeType,byteSize:Buffer.from(block.data,"base64").length,hash:createHash("sha256").update(Buffer.from(block.data,"base64")).digest("hex")}:block)});
    return result;
  }}))};
  try {const result=await runClaudeHarness(config,traced,signal,undefined,null);report.sdk=result;return result;}
  catch(error){report.sdkFailure={code:error.message,receipt:error.receipt};throw error;}
},true);
// The stored excerpt deliberately omits the random code. The SDK must traverse
// Memory to actual pixels; neither task objective nor Memory provides the answer.
const extraction={platform:"Synthetic IM",conversation_kind:"direct",contact_name:name,identity_clues:[{kind:"name",value:name,source_excerpt:name}],
  messages:[{message_id:"m1",sequence:0,source_image_index:0,text:"Document reference",speaker_side:"left",speaker_label:name,time_text:null}],uncertainties:["The document reference has not been transcribed."]};
const setupModel={extract:async()=>{throw new Error("UNEXPECTED_PREPASS");},next:async()=>{throw new Error("UNEXPECTED_OUTER_LOOP");},
  run:async(admission,signal)=>{
    await admission.recordUnderstanding([extraction],signal);
    for(const [tool,input] of [["search_contacts",{query:name}],["create_contact",{display_name:name}],
      ["finish_contact_task",{summary:"Stored the synthetic source excerpt; the document reference still needs original-image inspection.",findings:[],limitations:["Document reference not transcribed."]}]]) {
      const result=await admission.invoke(tool,input,signal);assert(!result.error,`Synthetic setup ${tool} failed`);
    }
    return {model:"scripted-synthetic-setup",providerRequestID:randomUUID(),inputTokens:1,outputTokens:1};
  }};
const pool=new Pool({connectionString:args[1],max:4,idleTimeoutMillis:0});
const directory=await mkdtemp(join(tmpdir(),"get9-memory-image-"));let app,taskID;
try {
  const account=randomUUID(),user=randomUUID(),slug=`get9-memory-image-${randomUUID()}`;
  await pool.query("INSERT INTO accounts(id,slug,name) VALUES($1,$2,'Synthetic Memory image')",[account,slug]);
  await pool.query("INSERT INTO users(id,account_id,email,display_name,kind) VALUES($1,$2,'memory-image@synthetic.local','Synthetic owner','simulated_human')",[user,account]);
  app=await buildApp({pool,config:{databaseUrl:args[1],host:"127.0.0.1",port:0,allowedOrigins:[],appleSignInAudiences:[],appleSignInEnabled:false,passwordAuthEnabled:false,
    passwordRegistrationEnabled:false,simulatedAuthEnabled:true,internalLabEnabled:false,retentionSweepIntervalMs:3_600_000,sessionTtlSeconds:3600,
    chatMediaStorage:{provider:"local",directory}},remoteChatProvider:provider,personResearchProvider:null,screenshotContact:{model:setupModel,research:null},labJobWorkerEnabled:false,labCIVerifier:null});
  const base=await app.listen({host:"127.0.0.1",port:0});const client=new TalentSignalClient(base);
  const login=await client.login({account_slug:slug,user_email:"memory-image@synthetic.local",client_label:"get9-memory-image"});
  const http=async(path,body)=>{const response=await fetch(base+path,{method:body?"POST":"GET",headers:{authorization:`Bearer ${login.access_token}`,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});return {response,value:response.headers.get("content-type")?.startsWith("image/")?Buffer.from(await response.arrayBuffer()):await response.json()};};
  let task=(await http("/v1/contact-agent/tasks",{idempotency_key:randomUUID(),objective:"Store this synthetic source excerpt for an original-image Memory test.",image,allow_public_research:false,captured_at:new Date().toISOString()})).value;
  taskID=task.task_id;assert(taskID);
  for(let i=0;i<100&&task.status==="running";i++){await delay(100);task=(await http(`/v1/contact-agent/tasks/${taskID}`)).value;}
  assert.equal(task.status,"completed");report.setup={taskID,contact:task.contact,sourceResourceID:task.source_resource_id};
  const source=await client.getRelationshipResource(task.source_resource_id);const fragment=source.fragments[0];assert(fragment);
  await client.reviewEvidenceFragment(fragment.id,{idempotency_key:randomUUID(),expected_review_status:"proposed",expected_last_review_id:null,
    decision:"reviewed",confirmed_speaker:"candidate",reason:"The synthetic fixture author verifies the exact visible excerpt and its speaker before Memory use."});
  const snapshot=await client.compileKnowledge(task.contact.person_id,task.contact.relationship_context_id,{idempotency_key:randomUUID(),objective:"Make the synthetic source available in relationship Memory."});
  report.memory={snapshotID:snapshot.id,status:snapshot.status,quality:snapshot.quality,fragmentID:fragment.id,blocks:snapshot.blocks};
  assert(snapshot.blocks.some(block=>block.dependencies.some(dependency=>dependency.type==="evidence_fragment"&&dependency.id===fragment.id)));
  const sessionID=randomUUID();await client.saveAgentSession(sessionID,{expected_revision:0,idempotency_key:randomUUID(),payload:{id:sessionID,scopeKind:"relationship",
    personID:task.contact.person_id,relationshipContextID:task.contact.relationship_context_id,personDisplayLabel:name,contextDisplayLabel:"Synthetic source",
    title:"Original image verification",turns:[],updatedAt:new Date().toISOString(),isUnread:false}});
  const started=Date.now();const output=await client.createChatTask({idempotency_key:randomUUID(),session_id:sessionID,
    objective:"请先读取 Memory，再回到这条记录对应的原截图，读取底部清晰分块，告诉我截图上的完整文档编号。不要用记忆中未转录的内容猜测；请引用这条来源。",
    person_id:task.contact.person_id,relationship_context_id:task.contact.relationship_context_id});
  report.durationMs=Date.now()-started;report.output=output;report.readback=await client.getChatTaskReadback(output.task_id);
  const answer=output.blocks.find(block=>block.kind==="answer"),original=await http(`/v1/contact-agent/tasks/${taskID}/images/0`);
  report.checks={memoryRetrieved:report.tools.some(tool=>tool.name==="read_relationship_memory"),nativeTileReturned:report.tools.some(tool=>tool.name==="read_evidence_source_image"&&tool.input.tile_index!==undefined&&!tool.isError&&tool.content.some(block=>block.type==="image")),
    exactCodeInAnswer:Boolean(answer?.body.includes(marker)),originalFragmentCited:answer?.citation_dependency_ids.includes(fragment.id)===true,
    originalBytesUnchanged:Buffer.isBuffer(original.value)&&original.value.equals(bytes),newSessionNoHistory:report.run?.context.conversation.length===0,
    ephemeralSDK:report.run?.continuation===false&&report.run?.imageToolResults===true,
    noSDKMirror:(await pool.query("SELECT id FROM harness_sessions WHERE account_id=$1 AND product_session_id=$2",[account,sessionID])).rowCount===0,
    canonicalReadback:report.readback.task_id===output.task_id,sourceScope:report.run?.sourceRefs?.fragment_ids.includes(fragment.id)===true,
    setupOnlyOnePerson:Number((await pool.query("SELECT count(*) FROM subjects WHERE account_id=$1",[account])).rows[0].count)===1};
  await pool.query("UPDATE source_retention_receipts SET authorization_state='revoked' WHERE capture_id=$1",[task.capture_id]);
  const revoked=await http(`/v1/contact-agent/tasks/${taskID}/images/0`),readback=await http(`/v1/chat/tasks/${output.task_id}/readback`);
  report.revocation={imageStatus:revoked.response.status,readbackStatus:readback.response.status,readback:readback.value};
  report.checks.revokedImageDenied=!revoked.response.ok;
  report.checks.revokedReadbackUnavailable=!readback.response.ok||readback.value.citations?.every(citation=>citation.availability!=="available");
  report.status=Object.values(report.checks).every(Boolean)?"passed":"failed";
} catch(error) {report.status="failed";report.failure={code:error.code??error.name,message:String(error.message).slice(0,500)};}
finally {await app?.close();await pool.end();await rm(directory,{recursive:true,force:true});report.cleanup="Owned image directory removed; synthetic database evidence retained.";await writeFile(args[3],JSON.stringify(report,null,2)+"\n",{mode:0o600});}
console.log(JSON.stringify({evaluation:report.evaluation,status:report.status,checks:report.checks,durationMs:report.durationMs,failure:report.failure}));if(report.status!=="passed")process.exitCode=1;
