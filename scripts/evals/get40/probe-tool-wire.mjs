#!/usr/bin/env node
// Real SDK and production adapter, local synthetic HTTP transport only.
import http from 'node:http';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {ClaudeChatProvider} from '../../../apps/agent/dist/claudeChatProvider.js';
import {runClaudeHarness} from '../../../apps/agent/dist/claudeHarness.js';
import {WORKSPACE_CONVERSATION_AGENT_TOOL_NAMES} from '../../../apps/agent/dist/types.js';
import {bundledPrompt} from '../../../apps/agent/dist/promptRegistry.js';
const wire=[],protocol=[];
const server=http.createServer(async(req,res)=>{
 let raw='';for await(const chunk of req)raw+=chunk;
 const body=JSON.parse(raw||'{}');
 if(!req.url.includes('/messages')){res.writeHead(200,{'content-type':'application/json'});res.end('{}');return;}
 wire.push((body.tools??[]).map(tool=>({name:tool.name,schemaHash:createHash('sha256').update(JSON.stringify(tool.input_schema??{})).digest('hex'),schemaType:tool.input_schema?.type})));
 res.writeHead(200,{'content-type':'text/event-stream'});
 const emit=(event,data)=>res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
 emit('message_start',{type:'message_start',message:{id:'msg_offline',type:'message',role:'assistant',model:'claude-sonnet-5',content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:20,output_tokens:0}}});
 emit('content_block_start',{type:'content_block_start',index:0,content_block:{type:'text',text:''}});
 emit('content_block_delta',{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'Offline tool registration verified.'}});
 emit('content_block_stop',{type:'content_block_stop',index:0});
 emit('message_delta',{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:10}});
 emit('message_stop',{type:'message_stop'});res.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 const config={model:'anthropic/claude-sonnet-5',baseUrl:`http://127.0.0.1:${server.address().port}`,credential:{name:'ANTHROPIC_API_KEY',value:'synthetic-offline-only'},taskBudgetEnabled:false};
 const provider=new ClaudeChatProvider(config,(c,r,s)=>runClaudeHarness(c,{...r,onProtocolMetadata:event=>protocol.push(event)},s,undefined,null));
 await provider.run({runID:randomUUID(),objective:'请先读取当前记忆。',systemPrompt:bundledPrompt('assistant/workspace').text,
  scopeSummary:{kind:'workspace_conversation',workspaceID:randomUUID(),sessionID:randomUUID(),currentPersonID:null,currentRelationshipContextID:null},
  toolManifest:WORKSPACE_CONVERSATION_AGENT_TOOL_NAMES,budget:{maxTurns:2,maxToolCalls:2,maxTaskTokens:24000,maxDurationMs:30000,maxEstimatedUsd:0.1}},
  async name=>({ok:true,name,callID:randomUUID(),data:{items:[]}}),new AbortController().signal);
 assert(wire.length>0);assert(wire.every(tools=>tools.some(tool=>tool.name==='mcp__talent_signal__memory_review'&&tool.schemaType==='object')),'Memory schema must reach actual API wire');
 assert(wire.every(tools=>tools.some(tool=>tool.name==='mcp__talent_signal__contact_workspace_search')),'Contact tools must remain available');
 process.stdout.write(JSON.stringify({mode:'offline-real-sdk-wire',externalRequests:0,wire,protocol})+'\n');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
