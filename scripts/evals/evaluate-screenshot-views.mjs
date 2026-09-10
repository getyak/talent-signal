import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ClaudeContactAgentModel, runClaudeHarness, claudeHarnessConfiguration } from "../../apps/agent/dist/index.js";
import { TalentSignalClient } from "../../packages/contracts/dist/index.js";
import { buildApp } from "../../apps/backend/dist/app.js";
const agentRequire=createRequire(new URL("../../apps/agent/package.json",import.meta.url));
const backendRequire=createRequire(new URL("../../apps/backend/package.json",import.meta.url));
const sharp=agentRequire("sharp"),{query}=agentRequire("@anthropic-ai/claude-agent-sdk"),{Pool}=backendRequire("pg");
const args=process.argv.slice(2);
assert(args.length===4&&args[0]==="--database"&&args[2]==="--output","Expected --database owned URL --output receipt path");
const db=new URL(args[1]);assert(db.hostname==="127.0.0.1"&&db.pathname==="/get9_eval","Only owned synthetic database admitted");
const configuration=claudeHarnessConfiguration({...process.env,ANTHROPIC_BASE_URL:"https://api.hao.ai/anthropic",TALENT_SIGNAL_AGENT_MODEL:"anthropic/claude-sonnet-5"});
const marker=`VIEW-${randomUUID().slice(0,8)}`;
const bytes=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="700" height="9000"><rect width="700" height="9000" fill="white"/><g font-family="sans-serif" fill="black"><text x="30" y="50" font-size="30">Synthetic public comment thread</text><text x="30" y="8530" font-size="24">Mira: Verification code ${marker}</text><text x="30" y="8580" font-size="24">Tao: I will check it tomorrow.</text></g></svg>`)).png().toBuffer();
const image={media_type:"image/png",byte_size:bytes.length,content_hash:createHash("sha256").update(bytes).digest("hex"),data_base64:bytes.toString("base64")};
const report={evaluation:"get9-long-image-product.v1",scope:"Real SDK/production adapter/HTTP/PostgreSQL/original storage; not installed native or browser UI",qualityReview:{status:"pending_independent_review"},dataClass:"synthetic",fixture:{width:700,height:9000,marker,originalHash:image.content_hash},toolUses:[],views:[],diagnostics:[],assistantStops:[],hooks:[],status:"running",checks:{},releaseReady:false};
let sdkDone;const completed=new Promise(resolve=>{sdkDone=resolve;});
const tracedQuery=options=>{const gate=options.options.hooks.PreToolUse[0].hooks[0];options.options.hooks.PreToolUse[0].hooks[0]=async(...args)=>{const value=await gate(...args);report.hooks.push({tool:args[0].tool_name,agent_type:args[0].agent_type??null,agent_id:args[0].agent_id??null,background_requested:args[0].tool_input?.run_in_background??null,background_admitted:value.hookSpecificOutput?.updatedInput?.run_in_background??null,decision:value.hookSpecificOutput?.permissionDecision});return value;};const stream=query(options),iterator=stream[Symbol.asyncIterator].bind(stream);stream[Symbol.asyncIterator]=async function*(){for await(const message of {[Symbol.asyncIterator]:iterator}){if(message.type==="assistant")for(const block of message.message.content??[])if(block.type==="tool_use")report.toolUses.push({id:block.id,name:block.name,child:message.parent_tool_use_id!==null,args:block.name==="Agent"?{subagent_type:block.input?.subagent_type}:block.input});if(message.type==="assistant")report.assistantStops.push({id:message.message.id,child:message.parent_tool_use_id!==null,stop_reason:message.message.stop_reason});if(message.type==="user")for(const block of message.message.content??[])if(block.type==="tool_result")report.diagnostics.push({tool_use_id:block.tool_use_id,imageReturned:Array.isArray(block.content)&&block.content.some(part=>part.type==="image"),is_error:block.is_error??false,text:typeof block.content==="string"?block.content.slice(0,2500):Array.isArray(block.content)?block.content.filter(part=>part.type==="text").map(part=>part.text.slice(0,2500)):[]});yield message;}};return stream;};
const model=new ClaudeContactAgentModel(configuration,async(config,request,signal)=>{
  report.overview={...JSON.parse(request.context).screenshot_image_views[0].overview};
  const observed={...request,tools:request.tools.map(tool=>({...tool,execute:async(...input)=>{const result=await tool.execute(...input);if(tool.name==="inspect_screenshot_region")report.views.push({input:input[0],imageReturned:result.content.some(block=>block.type==="image"),error:result.isError??false});return result;}}))};
  try{const receipt=await runClaudeHarness(config,observed,signal,tracedQuery,null);const {text,structuredOutput,...metadata}=receipt;report.sdk=metadata;return receipt;}catch(error){report.sdkFailure=error.receipt;throw error;}finally{sdkDone();}
});
const pool=new Pool({connectionString:args[1],max:4,idleTimeoutMillis:0});const directory=await mkdtemp(join(tmpdir(),"get9-image-product-"));let app,account,taskID;
try {
  account=randomUUID();const user=randomUUID(),slug=`get9-image-${randomUUID()}`;
  await pool.query("INSERT INTO accounts(id,slug,name) VALUES($1,$2,'Synthetic GET-9 image')",[account,slug]);
  await pool.query("INSERT INTO users(id,account_id,email,display_name,kind) VALUES($1,$2,'image@synthetic.local','Synthetic owner','simulated_human')",[user,account]);
  app=await buildApp({pool,config:{databaseUrl:args[1],host:"127.0.0.1",port:0,allowedOrigins:[],appleSignInAudiences:[],appleSignInEnabled:false,passwordAuthEnabled:false,passwordRegistrationEnabled:false,simulatedAuthEnabled:true,internalLabEnabled:false,retentionSweepIntervalMs:3_600_000,sessionTtlSeconds:3600,chatMediaStorage:{provider:"local",directory}},remoteChatProvider:null,personResearchProvider:null,screenshotContact:{model,research:null},labJobWorkerEnabled:false,labCIVerifier:null});
  const base=await app.listen({host:"127.0.0.1",port:0});const client=new TalentSignalClient(base);
  const login=await client.login({account_slug:slug,user_email:"image@synthetic.local",client_label:"get9-image-synthetic-acceptance"});
  const request=async(path,body)=>{const response=await fetch(`${base}${path}`,{method:body?"POST":"GET",headers:{authorization:`Bearer ${login.access_token}`,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});if(response.ok&&response.headers.get("content-type")?.startsWith("image/")){const raw=Buffer.from(await response.arrayBuffer());return {response,value:{content_hash:createHash("sha256").update(raw).digest("hex"),data_base64:raw.toString("base64")}};}return {response,value:await response.json()};};
  const started=Date.now();const created=await request("/v1/contact-agent/tasks",{idempotency_key:randomUUID(),objective:"这是一张合成的公开评论长截图。请读取底部清晰分块，使用 screenshot-source-review 子 Agent 独立核对验证码和作者（原图 0、分块 6），然后记录 comments 理解。当前未指定联系人，不要创建联系人；请通过澄清工具询问应归属哪位评论者。",image,allow_public_research:false,captured_at:new Date().toISOString()});assert(created.response.ok);taskID=created.value.task_id;
  let current=created.value;
  while(current.status==="running"&&Date.now()-started<360_000){await delay(500);current=(await request(`/v1/contact-agent/tasks/${taskID}`)).value;}
  await Promise.race([completed,delay(30_000)]);
  // The product stores SDK usage after the terminal SDK result; read it back.
  for(let attempt=0;attempt<100;attempt++){const row=(await pool.query("SELECT state FROM screenshot_contact_tasks WHERE id=$1",[taskID])).rows[0];if(row?.state.model_receipts?.length)break;await delay(100);}
  current=(await request(`/v1/contact-agent/tasks/${taskID}`)).value;report.task=current;report.durationMs=Date.now()-started;
  const original=await request(`/v1/contact-agent/tasks/${taskID}/images/0`);
  report.originalReadback={status:original.response.status,hash:original.value.content_hash};
  report.checks={sdkCompleted:Boolean(report.sdk),overviewBounded:report.overview?.height<=1568,originalStillAvailable:original.response.ok&&original.value.content_hash===image.content_hash&&original.value.data_base64===image.data_base64,
    waitingForIdentity:current.status==="waiting_for_user"&&Boolean(current.question),questionUsesPlainText:typeof current.question==="string"&&!/\\[nr]/u.test(current.question),commentsPreserved:current.extraction?.conversation_kind==="comments",
    originalMessageProvenance:current.extraction?.messages.every(message=>message.source_image_index===0)??false,
    markerAndAuthor:current.extraction?.messages.some(message=>message.speaker_label?.includes("Mira")&&message.text.includes(marker))??false,
    actualDelegation:report.toolUses.some(tool=>tool.name==="Agent")&&report.toolUses.some(tool=>tool.child&&tool.name.endsWith("inspect_screenshot_region")),
    nativePixelsReturned:report.views.some(view=>view.imageReturned),childReceivedOriginalPixels:report.diagnostics.some(item=>item.imageReturned&&report.toolUses.some(use=>use.id===item.tool_use_id&&use.child&&use.name.endsWith("inspect_screenshot_region"))),childReportedMarkerAndAuthor:report.diagnostics.some(item=>!item.is_error&&report.toolUses.some(use=>use.id===item.tool_use_id&&use.name==="Agent")&&JSON.stringify(item.text).includes(marker)&&JSON.stringify(item.text).includes("Mira")),noPersonCreated:Number((await pool.query("SELECT count(*) FROM subjects WHERE account_id=$1",[account])).rows[0].count)===0,noExternalEffects:current.external_effects?.length===0};
  await pool.query("UPDATE screenshot_contact_tasks SET expires_at=now()-interval '1 second' WHERE id=$1",[taskID]);
  const expired=await request(`/v1/contact-agent/tasks/${taskID}/images/0`);report.checks.expiredSourceDenied=!expired.response.ok;report.expiredReadbackStatus=expired.response.status;
  report.status=Object.values(report.checks).every(Boolean)?"passed":"failed";
} catch(error){report.status="failed";report.errorCode="PRODUCT_EVALUATION_FAILED";}
finally{await app?.close();await pool.end();await rm(directory,{recursive:true,force:true});report.cleanup="owned image directory removed; synthetic database evidence retained with expired task";await writeFile(args[3],JSON.stringify(report,null,2)+"\n",{mode:0o600});}
console.log(JSON.stringify({evaluation:report.evaluation,status:report.status,checks:report.checks,durationMs:report.durationMs}));if(report.status!=="passed")process.exitCode=1;
