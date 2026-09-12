import assert from "node:assert/strict";
import {createHash,randomUUID,randomInt} from "node:crypto";
import {pathToFileURL} from "node:url";
import {createRequire} from "node:module";
import {writeFile} from "node:fs/promises";
import {ClaudeChatProvider,claudeHarnessConfiguration,runClaudeHarness} from "../../apps/agent/dist/index.js";
import {TalentSignalClient} from "../../packages/contracts/dist/index.js";
import {buildApp} from "../../apps/backend/dist/app.js";
import {compileRelationshipWiki} from "../../apps/backend/dist/modules/wiki.js";
const args=process.argv.slice(2);assert(args.length===4&&args[0]==="--database"&&args[2]==="--output");
const database=new URL(args[1]);assert(database.hostname==="127.0.0.1"&&database.pathname==="/get9_eval");
const require=createRequire(new URL("../../apps/backend/package.json",import.meta.url)),{Pool}=require("pg");
const agentRequire=createRequire(new URL("../../apps/agent/package.json",import.meta.url));
const {query}=await import(pathToFileURL(agentRequire.resolve("@anthropic-ai/claude-agent-sdk")).href);
const configuration=claudeHarnessConfiguration({...process.env,ANTHROPIC_BASE_URL:"https://api.hao.ai/anthropic",TALENT_SIGNAL_AGENT_MODEL:"anthropic/claude-sonnet-5"});
const preparation=randomInt(3,10),discussion=randomInt(11,20),total=preparation+discussion;
const report={evaluation:"get9-scoped-run-files.v1",createdAt:new Date().toISOString(),dataClass:"synthetic",
  scope:"Real HTTP, Claude Agent SDK, QuickJS child process, PostgreSQL and authenticated CSV readback. Synthetic source setup. No installed-client acceptance.",
  fixture:{preparation,discussion,total},tools:[],permissionChecks:[],checks:{},qualityReview:{status:"pending_independent_review"},status:"running",releaseReady:false};
// Observe the actual gate result, without changing its decision or printing SDK configuration.
// All input in this executable evaluation is synthetic; no production hook logging is added.
const tracedQuery=options=>query({...options,options:{...options.options,hooks:{...options.options.hooks,
  PreToolUse:options.options.hooks.PreToolUse.map(matcher=>({...matcher,hooks:matcher.hooks.map(hook=>async(input,id,context)=>{
    const result=await hook(input,id,context);
    report.permissionChecks.push({toolName:input.tool_name,toolUseID:input.tool_use_id??id,input:input.tool_input,
      decision:result.hookSpecificOutput?.permissionDecision,reason:result.hookSpecificOutput?.permissionDecisionReason});
    return result;
  })}))}}});
const provider=new ClaudeChatProvider(configuration,async(config,request,signal)=>{
  report.run={context:JSON.parse(request.context),sourceRefs:request.observation?.source_refs};
  const traced={...request,tools:request.tools.map(tool=>({...tool,execute:async(...input)=>{
    const result=await tool.execute(...input);report.tools.push({name:tool.name,input:input[0],result});return result;
  }}))};
  try{const result=await runClaudeHarness(config,traced,signal,tracedQuery,null);report.sdk=result;return result;}
  catch(error){report.sdkFailure={code:error.message,receipt:error.receipt};throw error;}
});
const pool=new Pool({connectionString:args[1],max:5,idleTimeoutMillis:0});let app;
try{
  const auth={accountId:randomUUID(),accountSlug:`file-eval-${randomUUID()}`,userId:randomUUID(),userEmail:"file-eval@synthetic.local",userKind:"simulated_human",sessionId:randomUUID()};
  const person=randomUUID(),context=randomUUID(),capture=randomUUID(),resource=randomUUID(),fragment=randomUUID();
  await pool.query("INSERT INTO accounts(id,slug,name) VALUES($1,$2,'Synthetic file evaluation')",[auth.accountId,auth.accountSlug]);
  await pool.query("INSERT INTO users(id,account_id,email,display_name,kind) VALUES($1,$2,$3,'Synthetic recruiter','simulated_human')",[auth.userId,auth.accountId,auth.userEmail]);
  await pool.query("INSERT INTO subjects(id,account_id,external_ref,display_label) VALUES($1::uuid,$2,$1::text,'Mira Synthetic')",[person,auth.accountId]);
  await pool.query("INSERT INTO assignments(id,account_id,subject_id,external_ref,display_label) VALUES($1::uuid,$2,$3,$1::text,'Synthetic search project')",[context,auth.accountId,person]);
  await pool.query(`INSERT INTO captures(id,account_id,created_by_user_id,subject_id,assignment_id,source_kind,source_metadata,identity_status,identity_context,purpose)
    VALUES($1,$2,$3,$4,$5,'conversation_transcript','{}','bound','{}','Synthetic arithmetic and export proof')`,[capture,auth.accountId,auth.userId,person,context]);
  await pool.query(`INSERT INTO source_resources(id,account_id,capture_id,created_by_user_id,client_resource_id,resource_kind,input_channel,display_name,media_type,observed_at,retention_scope,processing_state)
    VALUES($1::uuid,$2,$3,$4,$1::text,'conversation_transcript','chat','Synthetic work log','text/plain',now(),'reviewed_selected_text','ready')`,[resource,auth.accountId,capture,auth.userId]);
  await pool.query(`INSERT INTO source_retention_receipts(receipt_id,account_id,capture_id,policy_version,requested_mode,effective_mode,source_scope,source_access_state,source_access_reason,created_at,updated_at)
    VALUES($1,$2,$3,'source-retention.v2','ephemeral','ephemeral','reviewed_selected_text','available','awaiting_review_completion',now(),now())`,[randomUUID(),auth.accountId,capture]);
  const text=`招聘顾问的本周项目工时记录：准备 ${preparation} 小时，讨论 ${discussion} 小时。以上仅为这两项工作的记录，不涉及候选人评价。`;
  await pool.query(`INSERT INTO evidence_fragments(id,account_id,capture_id,resource_id,fragment_kind,sequence,text_content,content_hash,locator,attributed_actor,attribution_status,parser_name,parser_version,review_status)
    VALUES($1,$2,$3,$4,'message',0,$5,$6,'{"kind":"message","source_message_id":"synthetic-work-log","sequence":0,"speaker_side":"right"}','recruiter','confirmed','synthetic-author','1','reviewed')`,
    [fragment,auth.accountId,capture,resource,text,createHash("sha256").update(text).digest("hex")]);
  const snapshot=await compileRelationshipWiki(pool,auth,person,context,{idempotency_key:randomUUID(),objective:"Compile synthetic work log for arithmetic and file export"});
  report.setup={person,context,capture,fragment,snapshot};
  app=await buildApp({pool,config:{databaseUrl:args[1],host:"127.0.0.1",port:0,allowedOrigins:[],appleSignInAudiences:[],appleSignInEnabled:false,passwordAuthEnabled:false,
    passwordRegistrationEnabled:false,simulatedAuthEnabled:true,internalLabEnabled:false,retentionSweepIntervalMs:3600000,sessionTtlSeconds:3600},
    remoteChatProvider:provider,personResearchProvider:null,labJobWorkerEnabled:false,labCIVerifier:null});
  const base=await app.listen({host:"127.0.0.1",port:0}),client=new TalentSignalClient(base);
  const login=await client.login({account_slug:auth.accountSlug,user_email:auth.userEmail,client_label:"get9-file-eval"});
  const headers={authorization:`Bearer ${login.access_token}`};
  const objective="请依据已记录的准备和讨论工时，计算总工时，导出包含准备、讨论、合计三行的 CSV，并在回复中给出合计和来源。";
  report.objective=objective;const started=Date.now();
  const output=await client.createChatTask({idempotency_key:randomUUID(),person_id:person,relationship_context_id:context,objective});
  report.durationMs=Date.now()-started;report.output=output;report.readback=await client.getChatTaskReadback(output.task_id);
  const artifact=output.artifacts?.[0],answer=output.blocks.find(block=>block.kind==="answer");
  const list=await fetch(`${base}/v1/chat/tasks/${output.task_id}/artifacts`,{headers});report.list=await list.json();
  report.checks={realCodeTool:report.tools.some(tool=>tool.name==="run_javascript"&&!tool.result.isError),
    sourceFileRead:report.tools.some(tool=>tool.name==="read_run_file"&&!tool.result.isError),
    artifactReturned:Boolean(artifact),csvType:artifact?.media_type==="text/csv",totalInAnswer:Boolean(answer?.body.includes(String(total))),
    exactSourceCited:answer?.citation_dependency_ids.includes(fragment)===true,listReadback:artifact?.id===report.list[0]?.id,
    exactScope:report.run?.sourceRefs?.fragment_ids.includes(fragment)===true};
  if(artifact){
    const url=`${base}/v1/chat/tasks/${output.task_id}/artifacts/${artifact.id}`,download=await fetch(url,{headers}),csv=await download.text();
    report.download={status:download.status,mediaType:download.headers.get("content-type"),disposition:download.headers.get("content-disposition"),csv};
    Object.assign(report.checks,{downloadSuccess:download.ok,exactHash:createHash("sha256").update(csv).digest("hex")===artifact.content_hash,
      allValues:[preparation,discussion,total].every(value=>new RegExp(`(?:^|[",])${value}(?:[",]|$)`,"m").test(csv)),
      noCache:download.headers.get("cache-control")==="no-store",anonymousDenied:(await fetch(url)).status===401});
    await pool.query("UPDATE source_retention_receipts SET authorization_state='revoked' WHERE capture_id=$1",[capture]);
    report.revokedStatus=(await fetch(url,{headers})).status;report.checks.revokedDownloadDenied=report.revokedStatus===410;
    report.checks.revokedBytesPurged=(await pool.query("SELECT content FROM harness_run_artifacts WHERE id=$1",[artifact.id])).rows[0]?.content===null;
  }
  report.status=Object.values(report.checks).every(Boolean)?"passed":"failed";
}catch(error){report.status="failed";report.failure={code:error.code??error.name,message:String(error.message).slice(0,500)};}
finally{await app?.close();await pool.end();await writeFile(args[3],JSON.stringify(report,null,2)+"\n",{mode:0o600});}
console.log(JSON.stringify({evaluation:report.evaluation,status:report.status,checks:report.checks,durationMs:report.durationMs,failure:report.failure}));if(report.status!=="passed")process.exitCode=1;
