import Fastify from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import { CONTRACT_VERSION } from "@talent-signal/contracts";
import type { Pool } from "pg";
const f=vi.hoisted(()=>({read:vi.fn(),session:vi.fn()}));
vi.mock("./conversationQueue.js",()=>({readConversationQueueSnapshot:f.read,admitConversationQueueEntry:vi.fn(),mutateConversationQueueEntry:vi.fn()}));
vi.mock("./auth.js",()=>({currentSession:f.session}));
import { registerConversationQueueRoutes } from "./conversationQueueRoutes.js";
import { clearConversationQueuePreview, publishConversationQueuePreview } from "./conversationQueueLive.js";
const id="72ce7ff4-a5a8-40d0-b1d7-d84a13adcd30";
const run="a072ed54-6d56-413d-af4b-3ebc01ba646a";
const app=()=>{const a=Fastify();registerConversationQueueRoutes(a,{query:vi.fn().mockResolvedValue({rowCount:1})} as unknown as Pool,async request=>{request.auth={accountId:id,userId:id,sessionId:id,accountSlug:"test",userEmail:"test@example.test",userKind:"simulated_human"};});return a;};
const snapshot={contract_version:CONTRACT_VERSION,session_id:id,revision:1,paused:false,queued:[],preview:null,active:{queue_entry_id:id,message_id:id,run_id:run,status:"running",sequence:1,objective:"synthetic",created_at:new Date().toISOString(),updated_at:new Date().toISOString(),revision:1,cancel_requested:false,stage:"answer",failure_code:null}};
afterEach(()=>{vi.resetAllMocks();clearConversationQueuePreview(run);});
it("closes an open SSE connection during graceful server shutdown", async () => {
  f.read.mockResolvedValue(snapshot);
  f.session.mockResolvedValue({});
  const server = app();
  const address = await server.listen({ host: "127.0.0.1", port: 0 });
  const controller = new AbortController();
  try {
    const response = await fetch(`${address}/v1/agent-sessions/${id}/conversation-queue/stream`, { signal: controller.signal });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let received = "";
    while (!received.includes("event: snapshot")) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error("Stream closed before its snapshot");
      received += decoder.decode(chunk.value);
    }
    // Fastify waits for hijacked SSE connections before onClose. preClose must
    // close the observer without waiting for the normal 55-second lifetime.
    await server.close();
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += decoder.decode(chunk.value);
    }
    expect(received).not.toContain("event: reconnect");
  } finally {
    controller.abort();
    await server.close();
  }
});
it("closes a retained connection before disclosing text after login revocation",async()=>{
 f.read.mockResolvedValue(snapshot);f.session.mockResolvedValue({});const a=app();const address=await a.listen({host:"127.0.0.1",port:0});const controller=new AbortController();
 try{const response=await fetch(`${address}/v1/agent-sessions/${id}/conversation-queue/stream`,{signal:controller.signal});const reader=response.body!.getReader();let text="";const decoder=new TextDecoder();while(!text.includes('event: snapshot')){text+=decoder.decode((await reader.read()).value);}
 f.session.mockRejectedValue(new Error("revoked"));publishConversationQueuePreview({accountId:id,sessionId:id,runId:run,messageId:id,text:"MUST_NOT_LEAK",stage:"answer",sequence:1,leaseGeneration:1});for(;;){const chunk=await reader.read();if(chunk.done)break;text+=decoder.decode(chunk.value);}expect(text).toContain('event: unavailable');expect(text).not.toContain('MUST_NOT_LEAK');
 }finally{controller.abort();await a.close();}
});
it("denies unavailable source content even when a valid preview is already in process memory",async()=>{
 f.read.mockResolvedValueOnce(snapshot).mockRejectedValue(new Error("source withdrawn"));f.session.mockResolvedValue({});publishConversationQueuePreview({accountId:id,sessionId:id,runId:run,messageId:id,text:"MUST_NOT_LEAK",stage:"answer",sequence:1,leaseGeneration:1});const a=app();try{const response=await a.inject({method:"GET",url:`/v1/agent-sessions/${id}/conversation-queue/stream`});expect(response.body).toContain('event: unavailable');expect(response.body).not.toContain('MUST_NOT_LEAK');}finally{await a.close();}
});
