import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {suite} from './cases.mjs';
import {grade} from './grade.mjs';
import {hash,treeHash,reusable} from './fingerprint.mjs';

const root=process.env.RELATIONSHIP_EVAL_DIR;
const repo=process.env.RELATIONSHIP_EVAL_REPO??process.cwd();
const label=process.env.RELATIONSHIP_EVAL_LABEL??'baseline';
if(!root||!path.isAbsolute(root)||!/^[-a-z0-9]+$/u.test(label))throw Error('Explicit artifact root and safe run label required');
const selected=(process.env.RELATIONSHIP_EVAL_CASES??'C01,C06,K01,K02,I01,R02').split(',');
if(selected.some(id=>!suite.cases.some(c=>c.id===id)))throw Error('Unknown case');
const output=path.join(root,'runs',label);await mkdir(output,{recursive:true});
const imp=p=>import(pathToFileURL(path.join(repo,p)));
const {ClaudeChatProvider,claudeHarnessConfiguration,runClaudeHarness,ArkScreenshotPreprocessor,ArkCurrentImageInspector}=await imp('apps/agent/dist/index.js');
const {executeWorkspaceConversationAgentCore}=await imp('apps/backend/dist/modules/workspaceConversationAgent.js');
const {LocalContactResearchClient}=await imp('apps/backend/dist/modules/contactResearchClient.js');
const researchClient=process.env.TALENT_SIGNAL_PERSON_RESEARCH_SOCKET?new LocalContactResearchClient(process.env.TALENT_SIGNAL_PERSON_RESEARCH_SOCKET):null;
const runtime=JSON.parse(await readFile(path.join(root,'runtime-config.json'),'utf8'));
const config=claudeHarnessConfiguration({...process.env,...runtime});
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
const buildFingerprint=hash(await Promise.all(['apps/agent/dist','apps/backend/dist','packages/contracts/dist','apps/agent-host/dist'].map(dir=>treeHash(path.join(repo,dir)))));
const graderHash=hash(await readFile(new URL('./grade.mjs',import.meta.url)));
const runnerHash=hash(await readFile(new URL('./run-live.mjs',import.meta.url)));
const effortOverride=process.env.RELATIONSHIP_EVAL_EFFORT??null;
if(effortOverride!==null&&!['low','medium'].includes(effortOverride))throw Error('Unsupported evaluation effort');
const results=[];
const concurrency=Number(process.env.RELATIONSHIP_EVAL_CONCURRENCY??'1');
if(![1,2].includes(concurrency))throw Error('Evaluation concurrency must be 1 or 2');
async function runCase(c) {
  const file=path.join(output,c.id+'.json');
  const bytes=await readFile(path.join(root,'png',c.id+'.png'));
  const imageHash=hash(bytes);
  const transient=process.env.RELATIONSHIP_EVAL_TRANSIENT_CASE===c.id;
  const identity={caseHash:hash(c),pngHash:imageHash,buildFingerprint,graderHash,runnerHash,model:config.model,endpoint:config.baseUrl,
    effort:effortOverride??'workspace_default',preprocessing:process.env.RELATIONSHIP_EVAL_PREPROCESS==='true',fault:transient?'research_transient':c.fault??null};
  try {const existing=JSON.parse(await readFile(file,'utf8'));
    if(!reusable(existing,identity))throw Error(`STALE_RUN: ${c.id}; preserve it and choose a new RELATIONSHIP_EVAL_LABEL`);
    results.push(existing);console.log(c.id+' exact fingerprint already recorded');return;
  } catch(e){if(e.code!=='ENOENT')throw e;}
  const messageID=randomUUID(), artifactID=`conversation-image-${messageID}-0-${randomUUID()}`;
  const report={caseID:c.id,...identity,runFingerprint:hash(identity),commit,model:config.model,
    mode:'actual-model-isolated-workspace-core',persistence:'artifact-only; not product database',
    preprocessingMode:'independent Doubao probe; workspace core receives original PNG, not its transcription',
    startedAt:new Date().toISOString(),toolCalls:[],inspections:[],sideEffects:[]};
  let calls=0;
  const liveResearch=researchClient?{execute:async(...args)=>{
    if(c.fault==='research_unavailable'){
      report.faultInjection={kind:'research_unavailable',triggered:true};
      throw Error('CONTACT_RESEARCH_INJECTED_UNAVAILABLE');
    }
    if(transient&&!report.faultInjection?.triggered&&args[0]?.anchors?.includes('Andrew Ng')){
      report.faultInjection={kind:'research_transient',triggered:true,subject:'Andrew Ng'};
      throw Error('CONTACT_RESEARCH_INJECTED_TRANSIENT');
    }
    return researchClient.execute(...args);
  }}:undefined;
  const provider=new ClaudeChatProvider(config,async(configuration,request,signal)=>{
    if(++calls>1)throw Error('One live agent invocation per case');
    report.availableTools=request.tools.map(t=>t.name);
    const observed={...request,...(effortOverride?{effort:effortOverride}:{}),budget:{...request.budget,maxEstimatedUsd:Math.min(.20,request.budget.maxEstimatedUsd),maxDurationMs:Math.min(100000,request.budget.maxDurationMs)},
      tools:request.tools.map(t=>({...t,execute:async(...args)=>{const call={name:t.name,input:args[0],startedAt:new Date().toISOString()};report.toolCalls.push(call);try{call.result=await t.execute(...args);call.finishedAt=new Date().toISOString();return call.result;}catch(e){call.error=e.message;throw e;}}}))};
    try {const result=await runClaudeHarness(configuration,observed,signal,undefined,null);report.usage={inputTokens:result.inputTokens,outputTokens:result.outputTokens,estimatedUsd:result.estimatedUsd,terminalReason:result.terminalReason};return result;}
    catch(e){report.providerFailure={message:e.message,receipt:e.receipt};throw e;}
  },true);
  const contactRows=(c.initialContacts??[]).flatMap((d)=>Array.from({length:d.count},()=>({personID:randomUUID(),displayLabel:d.name,directoryRevision:1,exactIdentityMatch:false,contexts:[{id:randomUUID(),displayLabel:'读书会'}]})));
  try {
    if(process.env.RELATIONSHIP_EVAL_PREPROCESS==='true') {
      const preprocessor=new ArkScreenshotPreprocessor({apiKey:process.env.ARK_API_KEY});
      report.preprocess=await preprocessor.preprocess({media_type:'image/png',byte_size:bytes.length,content_hash:imageHash,data_base64:bytes.toString('base64')},0,AbortSignal.timeout(60000),async()=>{});
    }
    report.result=await executeWorkspaceConversationAgentCore({researchClient:liveResearch,imageInspector:{inspect:async(image,signal)=>{const result=await new ArkCurrentImageInspector(process.env.ARK_API_KEY).inspect(image,signal);report.inspections.push({artifact_id:image.artifactID,content_hash:image.contentHash,...result});return result;}},objective:c.objective,sourceText:c.objective,provider,workspaceID:'synthetic-relationship-evaluation',messageID,
      inputParts:[{kind:'image',artifactID,mimeType:'image/png',byteSize:bytes.length,contentHash:imageHash,dataBase64:bytes.toString('base64')}],
      imageIsCurrent:async(id,index,h)=>id===artifactID&&index===0&&h===imageHash,
      calendarContext:{sourceRequestID:messageID,referenceTime:c.referenceTime,timeZone:c.timeZone},
      contacts:{search:async query=>contactRows.filter(p=>p.displayLabel.toLowerCase().includes(query.toLowerCase())),read:async()=>{throw Error('No name-only identity authority');}},
      memory:{recall:async()=>({items:[],nextCursor:null,hasMore:false}),stage:async input=>{
        report.staged=input;const receipt={proposalID:randomUUID(),proposalRevision:1,itemCount:input.items.length,defaultSelectedCount:0,scopeCounts:{self:input.items.filter(i=>i.scope==='self').length,person:input.items.filter(i=>i.scope==='person').length,relationship:input.items.filter(i=>i.scope==='relationship').length},contactStatus:contactRows.length?'ambiguous':'pending',personID:null,personDisplayLabel:input.newContact?.display_label??null,relationshipDisplayLabel:input.newContact?.relationship_context??null};
        report.stagedReceipt=receipt;return receipt;
      }} });
  } catch(e) {report.error={name:e.name,message:e.message};}
  report.finishedAt=new Date().toISOString();report.verdict=grade(c,report);
  await writeFile(file,JSON.stringify(report,null,2),{mode:0o600});results.push(report);
  console.log(JSON.stringify({case:c.id,status:report.verdict.status,failures:report.verdict.failures,error:report.error?.message,usage:report.usage}));
}
const queue=suite.cases.filter(c=>selected.includes(c.id));
await Promise.all(Array.from({length:concurrency},async()=>{while(queue.length){const c=queue.shift();if(c)await runCase(c);}}));
results.sort((a,b)=>suite.cases.findIndex(c=>c.id===a.caseID)-suite.cases.findIndex(c=>c.id===b.caseID));
const summary={label,commit,model:config.model,total:results.length,actualModel:true,productPersistence:false,humanGold:false,
  counts:Object.fromEntries(['mechanical_pass','fail','error'].map(s=>[s,results.filter(r=>r.verdict.status===s).length])),
  estimatedUsd:results.reduce((sum,r)=>sum+(r.usage?.estimatedUsd??0),0),usageComplete:results.every(r=>r.usage?.estimatedUsd!=null),
  cases:results.map(r=>({caseID:r.caseID,verdict:r.verdict}))};
await writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
