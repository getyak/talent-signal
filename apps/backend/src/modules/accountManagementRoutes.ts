import { AccountSettingsSchema, AccountMutationSchema, ErrorResponseSchema, type AccountMutation } from '@talent-signal/contracts';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Pool } from 'pg';
import { readAccountSettings, mutateAccountSettings } from './accountManagement.js';

export function registerAccountManagement(app: FastifyInstance,pool: Pool,authenticate:preHandlerHookHandler,labEnabled:boolean){
  const response={200:AccountSettingsSchema,'4xx':ErrorResponseSchema};
  const security=[{bearerSession:[]}];
  app.get('/v1/account/settings',{preHandler:authenticate,schema:{tags:['account'],security,response}},async(request,reply)=>{
    reply.header('cache-control','private, no-store');
    return readAccountSettings(pool,request.auth,labEnabled);
  });
  app.post<{Body:AccountMutation}>('/v1/account/settings',{preHandler:authenticate,
    config:{rateLimit:{max:30,timeWindow:'1 minute'}},schema:{tags:['account'],security,body:AccountMutationSchema,response}},async(request,reply)=>{
    reply.header('cache-control','private, no-store');
    return mutateAccountSettings(pool,request.auth,request.body,labEnabled);
  });
}
