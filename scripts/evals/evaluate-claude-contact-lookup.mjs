import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
import {ClaudeChatProvider,claudeHarnessConfiguration,claudeHarnessConfigurationReceipt,runClaudeHarness,claudeHarnessInterruptionCode} from "../../apps/agent/dist/index.js";
import {executeWorkspaceConversationAgentCore} from "../../apps/backend/dist/modules/workspaceConversationAgent.js";
const args=process.argv.slice(2);
assert(args.length===6&&args[0]==='--endpoint'&&args[2]==='--model'&&args[4]==='--output',
  'Usage: evaluate-claude-contact-lookup.mjs --endpoint URL --model MODEL --output PATH');
const configuration=claudeHarnessConfiguration({...process.env,ANTHROPIC_BASE_URL:args[1],TALENT_SIGNAL_AGENT_MODEL:args[3]});
const personID='10000000-0000-4000-8000-000000000101',contextID='10000000-0000-4000-8000-000000000102';
const fixture={dataClass:'synthetic',objective:'What changed with Leila?',directory:[{personID,displayLabel:'Leila',directoryRevision:1,contexts:[{id:contextID,displayLabel:'Synthetic conversation'}]}]};
const report={evaluation:'get9-named-contact-lookup.v1',createdAt:new Date().toISOString(),configuration:claudeHarnessConfigurationReceipt(configuration),fixture,
  boundary:'Actual SDK with controlled synthetic directory; validates lookup and scoped handoff, not the subsequent relationship answer or native UI.',
  fixtureHash:createHash('sha256').update(JSON.stringify(fixture)).digest('hex'),trials:[]};
for(let trial=1;trial<=3;trial++){
  const started=Date.now(),calls=[],toolCalls=[];let receipt,promptHash;
  const provider=new ClaudeChatProvider(configuration,async(...input)=>{
    promptHash=createHash('sha256').update(input[1].systemPrompt).digest('hex');
    const request={...input[1],tools:input[1].tools.map(tool=>({...tool,execute:async(...args)=>{const started=Date.now();try{const result=await tool.execute(...args);toolCalls.push({name:tool.name,input:args[0],result,durationMs:Date.now()-started});return result;}catch(error){toolCalls.push({name:tool.name,input:args[0],error:error instanceof Error?error.message:'unknown',durationMs:Date.now()-started});throw error;}}}))};
    try{receipt=await runClaudeHarness(input[0],request,input[2]);return receipt;}catch(error){receipt=error.receipt;throw error;}
  });
  try{
    const result=await executeWorkspaceConversationAgentCore({objective:fixture.objective,provider,workspaceID:'10000000-0000-4000-8000-000000000001',runID:randomUUID(),
      contacts:{search:async query=>{calls.push({operation:'search',query});return query.toLowerCase()==='leila'?fixture.directory:[];},
        read:async(person,context)=>{assert.equal(person,personID);assert.equal(context,contextID);calls.push({operation:'read',personID:person,contextID:context});return{person:{id:personID,displayLabel:'Leila',directoryRevision:1},relationship:{id:contextID,displayLabel:'Synthetic conversation'}};}}});
    const checks={searchedCurrentName:calls.some(c=>c.operation==='search'&&c.query.toLowerCase()==='leila'),readUniqueMatch:calls.some(c=>c.operation==='read'),
      resolvedScope:result.event?.kind==='resolved_contact_context',actualModelMatched:receipt?.reportedModels.length===1&&provider.matchesReportedModel(receipt.reportedModels[0])};
    report.trials.push({trial,status:Object.values(checks).every(Boolean)?'checks_passed':'checks_failed',checks,calls,toolCalls,output:result.block,event:result.event,promptHash,receipt,durationMs:Date.now()-started});
  }catch(error){report.trials.push({trial,status:'error',error:claudeHarnessInterruptionCode(error),calls,toolCalls,promptHash,receipt,durationMs:Date.now()-started});}
  await writeFile(args[5],JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({evaluation:report.evaluation,trial,status:report.trials.at(-1).status}));
}
if(report.trials.some(t=>t.status!=='checks_passed'))process.exitCode=1;
