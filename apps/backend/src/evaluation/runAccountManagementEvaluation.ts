import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { buildApp } from '../app.js';
import type { BackendConfig } from '../config.js';
import { LocalChatMediaStorage } from '../modules/chatMediaStorage.js';
import { insertSession } from '../modules/auth.js';
import { inTransaction } from '../database/pool.js';
import type { AccountSettings, SessionResponse } from '@talent-signal/contracts';

const databaseURL=process.env.ACCOUNT_EVALUATION_DATABASE_URL;
assert(databaseURL&&new URL(databaseURL).pathname==='/account_proof'&&['localhost','127.0.0.1'].includes(new URL(databaseURL).hostname),'Use the explicit disposable account_proof database.');
const pool=new Pool({connectionString:databaseURL,max:8});
const media=await mkdtemp(join(tmpdir(),'ts-account-proof-'));
const config:BackendConfig={databaseUrl:databaseURL,host:'127.0.0.1',port:4334,allowedOrigins:[],
  appleSignInAudiences:[],appleSignInEnabled:false,passwordAuthEnabled:true,passwordRegistrationEnabled:true,
  simulatedAuthEnabled:true,internalLabEnabled:true,retentionSweepIntervalMs:60_000,sessionTtlSeconds:3600};
const app=await buildApp({pool,config,chatMediaStorage:new LocalChatMediaStorage(media),remoteChatProvider:null,personResearchProvider:null,labJobWorkerEnabled:false});
const request=async(token:string,method:'GET'|'POST',url:string,payload?:Record<string,unknown>,expected=200)=>{
  const result=await app.inject({method,url,headers:{authorization:`Bearer ${token}`},...(payload?{payload}:{})});
  assert.equal(result.statusCode,expected,result.body);return result.json();
};
const register=async():Promise<SessionResponse>=>{
  const name=`proof${randomUUID().slice(0,8)}`;
  return request('','POST','/v1/auth/password/register',{username:name,email:`${name}@example.test`,display_name:name,password:'Synthetic-proof-only!',client_label:'account-proof'},201);
};
const settings=(token:string):Promise<AccountSettings>=>request(token,'GET','/v1/account/settings');
const mutate=(token:string,body:Record<string,unknown>,status=200)=>request(token,'POST','/v1/account/settings',body,status);
const accessEvents=async(accountId:string,id:string)=>{
  const rows=(await pool.query<{kind:string;details:Record<string,unknown>|null}>('SELECT kind,details FROM account_access_events WHERE account_id=$1 AND id=$2',[accountId,id])).rows;
  return rows;
};
const eventCount=async(accountId:string)=>Number((await pool.query<{count:string}>('SELECT count(*)::text AS count FROM account_access_events WHERE account_id=$1',[accountId])).rows[0]!.count);
try{
  const owner=await register(),outsider=await register();
  let state=await settings(owner.access_token);
  assert.equal(state.workspace.is_owner,true);assert.equal(state.workspace.can_manage,true);
  assert.deepEqual(state.user.login_methods,['password']);assert.equal(state.sessions[0]?.is_current,true);
  assert(!JSON.stringify(state).includes('password_scrypt'));assert(!JSON.stringify(state).includes(owner.access_token));
  const profile={id:randomUUID(),kind:'profile',expected_revision:state.user.revision,name:'Updated synthetic owner'};
  const eventsBeforeProfile=await eventCount(owner.account.id);
  state=await mutate(owner.access_token,profile);assert.equal(state.user.display_name,profile.name);
  const replay=await mutate(owner.access_token,profile);assert.equal(replay.user.revision,state.user.revision);
  await mutate(owner.access_token,{...profile,name:'Different replay'},409);
  await mutate(owner.access_token,{...profile,id:randomUUID(),name:'Stale'},409);
  await mutate(owner.access_token,{id:randomUUID(),kind:'revoke_session',session_id:state.sessions[0]!.id},409);
  await mutate(outsider.access_token,{id:randomUUID(),kind:'revoke_session',session_id:state.sessions[0]!.id},404);
  // Accepted mutations persist canonical details; rejected writes and replay do not.
  assert.equal(await eventCount(owner.account.id),eventsBeforeProfile+1,'one audit event for an accepted profile write');
  const profileEvents=await accessEvents(owner.account.id,profile.id);
  assert.equal(profileEvents.length,1);
  assert.equal(profileEvents[0]!.kind,'profile');
  assert.deepEqual(profileEvents[0]!.details,{target_user_id:owner.user.id,revision_before:1,revision_after:2});
  assert(!JSON.stringify(profileEvents[0]!.details).includes(profile.name),'profile audit must not copy the personal name');
  assert(!JSON.stringify(profileEvents[0]!.details).includes(owner.user.email),'profile audit must not copy the email');
  const memberId=randomUUID();
  await pool.query("INSERT INTO users(id,account_id,email,display_name,kind,account_role) VALUES ($1,$2,$3,'Synthetic member','password_human','member')",[memberId,owner.account.id,`${memberId}@example.test`]);
  const member=await inTransaction(pool,c=>insertSession(c,config,{accountId:owner.account.id,accountName:owner.account.name,accountSlug:owner.account.slug,userId:memberId,userEmail:`${memberId}@example.test`,displayName:'Synthetic member',role:'member',userKind:'password_human',username:null},'member-proof'));
  const memberSessionId=(await pool.query<{id:string}>('SELECT id FROM sessions WHERE account_id=$1 AND user_id=$2 AND revoked_at IS NULL',[owner.account.id,memberId])).rows[0]!.id;
  const memberState=await settings(member.access_token);assert.equal(memberState.members.length,0);assert.equal(memberState.activity.length,0);
  const eventsBeforeDenials=await eventCount(owner.account.id);
  await mutate(member.access_token,{id:randomUUID(),kind:'workspace',expected_revision:state.workspace.revision,name:'Denied'},403);
  await mutate(owner.access_token,{id:randomUUID(),kind:'member',expected_revision:state.workspace.revision,user_id:outsider.user.id,role:'member',status:'active'},404);
  await mutate(owner.access_token,{id:randomUUID(),kind:'member',expected_revision:state.workspace.revision,user_id:owner.user.id,role:'member',status:'revoked'},403);
  await mutate(owner.access_token,{id:randomUUID(),kind:'member',expected_revision:state.workspace.revision+1,user_id:memberId,role:'member',status:'revoked'},409);
  assert.equal(await eventCount(owner.account.id),eventsBeforeDenials,'rejected writes must not create audit events');
  const workspaceEventId=randomUUID();
  state=await mutate(owner.access_token,{id:workspaceEventId,kind:'workspace',expected_revision:state.workspace.revision,name:'Account proof workspace'});assert.equal(state.workspace.name,'Account proof workspace');
  assert.deepEqual((await accessEvents(owner.account.id,workspaceEventId))[0]!.details,{revision_before:state.workspace.revision-1,revision_after:state.workspace.revision});
  const memberEventId=randomUUID();
  state=await mutate(owner.access_token,{id:memberEventId,kind:'member',expected_revision:state.workspace.revision,user_id:memberId,role:'member',status:'revoked'});
  await request(member.access_token,'GET','/v1/auth/session',undefined,401);
  const memberEvents=await accessEvents(owner.account.id,memberEventId);
  assert.equal(memberEvents.length,1);
  assert.deepEqual(memberEvents[0]!.details,{target_user_id:memberId,role_before:'member',role_after:'member',status_before:'active',status_after:'revoked',revoked_session_ids:[memberSessionId]});
  assert(!JSON.stringify(memberEvents[0]!.details).includes(memberId+'@example.test'),'member audit must not copy the email');
  const memberEventDetails=JSON.stringify(memberEvents[0]!.details);
  state=await mutate(owner.access_token,{id:randomUUID(),kind:'member',expected_revision:state.workspace.revision,user_id:memberId,role:'admin',status:'active'});
  await request(member.access_token,'GET','/v1/auth/session',undefined,401);
  // Later member changes must not rewrite the original event's captured details.
  assert.equal(JSON.stringify((await accessEvents(owner.account.id,memberEventId))[0]!.details),memberEventDetails,'original audit details are immutable across later changes');
  // An explicit session revocation records the exact target and before/after state.
  const secondaryOwner=await inTransaction(pool,c=>insertSession(c,config,{accountId:owner.account.id,accountName:owner.account.name,accountSlug:owner.account.slug,userId:owner.user.id,userEmail:owner.user.email,displayName:'Synthetic owner',role:'member',userKind:'password_human',username:null},'secondary-owner-proof'));
  const explicitSessionId=(await pool.query<{id:string}>('SELECT id FROM sessions WHERE account_id=$1 AND user_id=$2 AND client_label=$3',[owner.account.id,owner.user.id,'secondary-owner-proof'])).rows[0]!.id;
  const revokeEventId=randomUUID();
  await mutate(owner.access_token,{id:revokeEventId,kind:'revoke_session',session_id:explicitSessionId});
  const revokeDetails=(await accessEvents(owner.account.id,revokeEventId))[0]!.details ?? {};
  assert.equal(revokeDetails.target_session_id,explicitSessionId);
  assert.equal(revokeDetails.revoked_at_before,null);
  assert.equal(typeof revokeDetails.revoked_at_after,'string');
  await request(secondaryOwner.access_token,'GET','/v1/auth/session',undefined,401);
  // Replaying an accepted operation returns one event with its original details.
  const revokeEventsBeforeReplay=await eventCount(owner.account.id);
  await mutate(owner.access_token,{id:revokeEventId,kind:'revoke_session',session_id:explicitSessionId});
  assert.equal(await eventCount(owner.account.id),revokeEventsBeforeReplay,'replay must not duplicate audit events');
  assert.equal(JSON.stringify((await accessEvents(owner.account.id,revokeEventId))[0]!.details),JSON.stringify(revokeDetails),'replay must not rewrite original details');
  // Lab lifecycle must include all post-045 schema additions without weakening its manifest gate.
  const workspaceId=randomUUID();
  const created=(await request(owner.access_token,'POST','/v1/lab/workspaces',{id:workspaceId,duration_hours:1})).workspace;
  assert.equal(created.data_rows,0);assert.equal(created.state,'active');
  const childToken=Buffer.from(randomUUID().replaceAll('-','')+randomUUID().replaceAll('-',''),'hex').toString('base64url');
  const entry=(await request(owner.access_token,'POST',`/v1/lab/workspaces/${workspaceId}/entries`,{id:randomUUID(),access_token:childToken})).entry;
  assert.equal(entry.session.user.kind,'lab_human');
  await mutate(childToken,{id:randomUUID(),kind:'profile',expected_revision:1,name:'Denied'},403);
  const stopped=(await request(owner.access_token,'POST',`/v1/lab/workspaces/${workspaceId}/stop`,{id:randomUUID()})).workspace;
  assert.equal(stopped.state,'deleted');assert.equal(stopped.data_rows,0);
  await request(childToken,'GET','/v1/auth/session',undefined,401);
  const transferEventId=randomUUID();
  const ownerBefore=state.workspace.owner_user_id;
  state=await mutate(owner.access_token,{id:transferEventId,kind:'transfer',expected_revision:state.workspace.revision,user_id:memberId});
  assert.equal(state.workspace.is_owner,false);assert.equal(state.workspace.can_manage,false);
  assert.equal(state.workspace.owner_user_id,memberId);
  assert.deepEqual((await accessEvents(owner.account.id,transferEventId))[0]!.details,{target_user_id:memberId,owner_user_id_before:ownerBefore,owner_user_id_after:memberId});
  assert.equal((await settings(outsider.access_token)).workspace.name,outsider.account.name);
  console.log(JSON.stringify({status:'passed',checks:['owner bootstrap','credential redaction','idempotent replay','stale revision','cross-account denial','owner protection','member suspension and session revocation','reinstatement does not restore sessions','test workspace isolation and verified cleanup','ownership transfer','persisted audit details','immutable original details','no events on rejected writes','single event on replay']},null,2));
}finally{await app.close();await pool.end();await rm(media,{recursive:true,force:true});}
