import { Type } from "@sinclair/typebox";
import { CONTRACT_VERSION, ErrorResponseSchema, LabWorkspaceCreateRequestSchema,
  LabWorkspaceEntryRequestSchema, LabWorkspaceStopRequestSchema, LabWorkspaceResponseSchema,
  LabWorkspaceListResponseSchema, LabWorkspaceEntryResponseSchema,
  type LabWorkspaceCreateRequest, type LabWorkspaceEntryRequest } from "@talent-signal/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { ApiError } from "../lib/apiError.js";
import type { LabWorkspaceService } from "./labWorkspaces.js";

export function registerLabWorkspaceRoutes(app:FastifyInstance,service:LabWorkspaceService,
  authenticate:preHandlerHookHandler,enabled:boolean):void {
  const gate:preHandlerHookHandler=async()=>{
    if(!enabled)throw new ApiError(403,"LAB_CAPABILITY_DENIED","Internal test workspaces are disabled.");
  };
  const preHandler=[authenticate,gate], security=[{bearerSession:[]}];
  const params=Type.Object({id:Type.String({format:"uuid"})},{additionalProperties:false});
  const response={200:LabWorkspaceResponseSchema,"4xx":ErrorResponseSchema,"5xx":ErrorResponseSchema};
  const config={rateLimit:{max:20,timeWindow:"1 minute"}};
  app.get("/v1/lab/workspaces",{preHandler,schema:{security,response:{200:LabWorkspaceListResponseSchema,"4xx":ErrorResponseSchema}}},async(request,reply)=>{
    reply.header("cache-control","no-store");
    return {contract_version:CONTRACT_VERSION,enabled:service.supported,workspaces:await service.list(request.auth)};
  });
  app.post<{Body:LabWorkspaceCreateRequest}>("/v1/lab/workspaces",{preHandler,config,
    schema:{security,body:LabWorkspaceCreateRequestSchema,response}},async(request,reply)=>{
    reply.header("cache-control","no-store");
    return {contract_version:CONTRACT_VERSION,workspace:await service.create(request.auth,request.body)};
  });
  app.get<{Params:{id:string}}>("/v1/lab/workspaces/:id",{preHandler,schema:{security,params,response}},async(request,reply)=>{
    reply.header("cache-control","no-store");
    return {contract_version:CONTRACT_VERSION,workspace:await service.read(request.auth,request.params.id)};
  });
  app.post<{Params:{id:string};Body:LabWorkspaceEntryRequest}>("/v1/lab/workspaces/:id/entries",{preHandler,config,
    schema:{security,params,body:LabWorkspaceEntryRequestSchema,response:{200:LabWorkspaceEntryResponseSchema,"4xx":ErrorResponseSchema,"5xx":ErrorResponseSchema}}},async(request,reply)=>{
    reply.header("cache-control","no-store");
    return {contract_version:CONTRACT_VERSION,entry:await service.enter(request.auth,request.params.id,request.body)};
  });
  app.post<{Params:{id:string;entryId:string}}>("/v1/lab/workspaces/:id/entries/:entryId/leave",{preHandler,
    schema:{security,params:Type.Object({id:Type.String({format:"uuid"}),entryId:Type.String({format:"uuid"})}),
      response:{200:LabWorkspaceEntryResponseSchema,"4xx":ErrorResponseSchema}}},async(request,reply)=>{
    reply.header("cache-control","no-store");
    return {contract_version:CONTRACT_VERSION,entry:await service.leave(request.auth,request.params.id,request.params.entryId)};
  });
  app.post<{Params:{id:string};Body:{id:string}}>("/v1/lab/workspaces/:id/stop",{preHandler,config,
    schema:{security,params,body:LabWorkspaceStopRequestSchema,response}},async(request,reply)=>{
    reply.header("cache-control","no-store");
    return {contract_version:CONTRACT_VERSION,workspace:await service.stop(request.auth,request.params.id,request.body.id)};
  });
  // Expiry/cleanup continues even if new Lab creation is administratively disabled.
  let running:Promise<void>|undefined;
  const timer=setInterval(()=>{if(!running)running=service.sweep().catch(()=>{}).finally(()=>{running=undefined;});},60_000);
  timer.unref();
  app.addHook("onClose",async()=>{clearInterval(timer);await running;});
}
