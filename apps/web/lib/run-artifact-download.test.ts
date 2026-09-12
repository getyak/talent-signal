import {createHash} from "node:crypto";
import {it,expect,vi} from "vitest";
import {loadRunArtifactBlob,type RunArtifact} from "./run-artifact-download";
const file:RunArtifact={id:"synthetic",name:"result.json",media_type:"application/json",byte_size:1,content_hash:createHash("sha256").update("7").digest("hex"),expires_at:"2099-01-01T00:00:00Z"};
it("cancels a delayed response even when the transport ignores AbortSignal",async()=>{
  const controller=new AbortController();let release!:(response:Response)=>void;
  const request=vi.fn(()=>new Promise<Response>(resolve=>{release=resolve;}));
  const result=loadRunArtifactBlob("task",file,"binding",controller.signal,request);controller.abort();release(new Response("7"));
  await expect(result).rejects.toMatchObject({name:"AbortError"});expect(request).toHaveBeenCalledTimes(1);
});
it("requires current login and source after verifying downloaded bytes",async()=>{
  const request=vi.fn().mockResolvedValueOnce(new Response("7")).mockResolvedValueOnce(new Response("{}",{status:409}));
  await expect(loadRunArtifactBlob("task",file,"binding",new AbortController().signal,request)).rejects.toThrow("登录或来源已改变");
  expect(request.mock.calls.every(call=>call[1].headers["x-workspace-session"]==="binding")).toBe(true);
});
it("rejects revoked files and returns exact bytes only after final readback",async()=>{
  const request=vi.fn().mockResolvedValueOnce(new Response("7")).mockResolvedValueOnce(Response.json([]));
  await expect(loadRunArtifactBlob("task",file,"binding",new AbortController().signal,request)).rejects.toThrow("来源已变更");
  request.mockResolvedValueOnce(new Response("7")).mockResolvedValueOnce(Response.json([file]));
  expect(await (await loadRunArtifactBlob("task",file,"binding",new AbortController().signal,request)).text()).toBe("7");
});
