import { expect, it, vi } from "vitest";
import { TalentSignalHttpError } from "@talent-signal/contracts";
vi.mock("server-only",()=>({}));
const client = vi.hoisted(()=>({currentSession:vi.fn().mockResolvedValue({account:{id:"owned-account"}}),getWorkspaceReview:vi.fn(),getWorkspaceReviewByCapture:vi.fn()}));
vi.mock("./backendAuth",()=>({authenticatedBackendClient:async()=>client}));
import { loadRelationshipWorkspaceInitialRead } from "./localBackend";
it("preserves account identity for an empty workspace without synthetic fixtures",async()=>{
 client.getWorkspaceReview.mockRejectedValue(new TalentSignalHttpError(404,"not_found","",null));
 const result=await loadRelationshipWorkspaceInitialRead({});expect(result.accountId).toBe("owned-account");expect(result.workspace).toBeNull();expect(result.warnings).toEqual([]);
});
it("does not hide an explicitly requested missing capture",async()=>{
 client.getWorkspaceReviewByCapture.mockRejectedValue(new TalentSignalHttpError(404,"not_found","",null));
 await expect(loadRelationshipWorkspaceInitialRead({captureId:"missing"})).rejects.toMatchObject({status:404});
});
it("does not treat backend failures as an empty workspace",async()=>{
 client.getWorkspaceReview.mockRejectedValue(new TalentSignalHttpError(503,"unavailable","",null));
 await expect(loadRelationshipWorkspaceInitialRead({})).rejects.toMatchObject({status:503});
});
