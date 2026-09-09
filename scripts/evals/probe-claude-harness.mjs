import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { runClaudeHarness, claudeHarnessConfiguration, claudeHarnessConfigurationReceipt } from "../../apps/agent/dist/index.js";
const require = createRequire(new URL("../../apps/agent/package.json", import.meta.url));
const { z } = require("zod");

const args=process.argv.slice(2);
if(args.length!==4||args[0]!=="--endpoint"||args[2]!=="--model")throw new Error("Usage: probe-claude-harness.mjs --endpoint URL --model MODEL");
const configuration=claudeHarnessConfiguration({...process.env,ANTHROPIC_BASE_URL:args[1],TALENT_SIGNAL_AGENT_MODEL:args[3]});
const marker=randomUUID();let calls=0;
const started=Date.now();
try{
  const result=await runClaudeHarness(configuration,{
    objective:"Synthetic SDK compatibility test. Call synthetic_receipt once, then reply with exactly the marker in that tool's receipt. Do not guess the marker.",
    systemPrompt:"This is a synthetic infrastructure probe. Use the offered read-only tool and return its marker as natural text. No private evidence or external writes are available.",
    tools:[{name:"synthetic_receipt",description:"Return a synthetic receipt marker for this test.",schema:z.strictObject({}),readOnly:true,alwaysLoad:true,
      execute:async()=>{calls++;return {content:[{type:"text",text:JSON.stringify({marker})}]};}}],
    budget:{maxTurns:4,maxToolCalls:2,maxDurationMs:90_000,maxTaskTokens:24_000,maxEstimatedUsd:0.5},
    assertCurrent:async()=>{},
  },new AbortController().signal);
  const passed=calls===1&&result.text.trim()===marker;
  console.log(JSON.stringify({probe:"claude-harness.v1",dataClass:"synthetic",configuration:claudeHarnessConfigurationReceipt(configuration),
    status:passed?"passed":"failed",toolCalls:calls,markerMatched:result.text.trim()===marker,
    reportedModels:result.reportedModels,sessionID:result.sessionID,inputTokens:result.inputTokens,outputTokens:result.outputTokens,
    sdkEstimatedUsd:result.estimatedUsd,durationMs:Date.now()-started,terminalReason:result.terminalReason}));
  if(!passed)process.exitCode=1;
}catch(error){
  const safeCode=error instanceof Error&&/^CLAUDE_[A-Z0-9_]+$/.test(error.message)?error.message:"CLAUDE_SDK_PROBE_FAILED";
  console.log(JSON.stringify({probe:"claude-harness.v1",dataClass:"synthetic",configuration:claudeHarnessConfigurationReceipt(configuration),status:"failed",errorCode:safeCode,durationMs:Date.now()-started,toolCalls:calls}));
  process.exitCode=1;
}
