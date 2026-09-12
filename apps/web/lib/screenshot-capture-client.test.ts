import { afterEach, expect, it, vi } from "vitest";
import { analyzeScreenshotCapture, commitScreenshotCapture, findScreenshotCapturePeople, type ScreenshotCaptureAnalysis } from "./screenshot-capture-client";
import type { ScreenshotCaptureDraft } from "./screenshot-capture";
afterEach(() => vi.unstubAllGlobals());
it("pins search, analysis and commit from a stale test tab and reports no applied write", async () => {
 const window = Object.assign(new EventTarget(), {location:{href:"https://example.test/workspace/today",origin:"https://example.test"}});
 vi.stubGlobal("window",window);
 vi.stubGlobal("document",{querySelector:()=>({dataset:{workspaceScope:"old-test"}})});
 const request=vi.fn<typeof fetch>(async (_input,init) => {
   expect(new Headers(init?.headers).get("x-talent-signal-workspace")).toBe("old-test");
   return Response.json({code:"backend_session_expired",message:"Workspace changed"},{status:401});
 });
 vi.stubGlobal("fetch",request);
 const signal=new AbortController().signal;
 await expect(findScreenshotCapturePeople("",signal)).rejects.toMatchObject({status:401});
 await expect(findScreenshotCapturePeople("Maya",signal)).rejects.toMatchObject({status:401});
 await expect(analyzeScreenshotCapture({image:new File(["synthetic"],"test.png",{type:"image/png"}),screenshotOwner:"candidate",cropTopPercent:0,cropBottomPercent:0,redactionCount:0,signal})).rejects.toMatchObject({status:401});
 const draft={messages:[]} as unknown as ScreenshotCaptureDraft;
 const analysis={draft,meta:{},receipt:"synthetic"} as ScreenshotCaptureAnalysis;
 await expect(commitScreenshotCapture({analysis,draft,assignmentLabel:"",contactName:"Synthetic",identityQuery:null,personId:null,relationshipContextId:null,requestId:"synthetic"})).rejects.toMatchObject({status:401,outcome:"not_applied"});
 expect(request).toHaveBeenCalledTimes(4);
});
