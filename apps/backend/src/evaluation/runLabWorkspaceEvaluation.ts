import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import type { BackendConfig } from "../config.js";
import { sha256 } from "../lib/hash.js";
import { LocalChatMediaStorage } from "../modules/chatMediaStorage.js";
import { LabWorkspaceService } from "../modules/labWorkspaces.js";

const databaseURL=process.env.LAB_WORKSPACE_EVALUATION_DATABASE_URL;
assert(databaseURL && ["localhost","127.0.0.1"].includes(new URL(databaseURL).hostname),
  "Use an explicit disposable loopback database.");
const pool=new Pool({connectionString:databaseURL,max:8});
const mediaDirectory=await mkdtemp(join(tmpdir(),"talent-signal-lab-workspaces-"));
const storage=new LocalChatMediaStorage(mediaDirectory);
const config:BackendConfig={databaseUrl:databaseURL,host:"127.0.0.1",port:4332,allowedOrigins:[],
  appleSignInAudiences:[],appleSignInEnabled:false,passwordAuthEnabled:false,passwordRegistrationEnabled:false,
  simulatedAuthEnabled:true,internalLabEnabled:true,retentionSweepIntervalMs:60_000,sessionTtlSeconds:3600};
const app=await buildApp({pool,config,chatMediaStorage:storage,remoteChatProvider:null,personResearchProvider:null,
  labJobWorkerEnabled:false});
const request=async(token:string,method:"GET"|"POST"|"PUT",url:string,payload?:Record<string,unknown>|Buffer,expected=200,headers?:Record<string,string>)=>{
  const requestHeaders={authorization:`Bearer ${token}`,...headers};
  const result=payload===undefined?await app.inject({method,url,headers:requestHeaders}):
    await app.inject({method,url,headers:requestHeaders,payload});
  assert.equal(result.statusCode,expected,result.body);return result;
};
const login=async(account:string,email:string)=>{
  const result=await app.inject({method:"POST",url:"/v1/auth/simulated-login",payload:{account_slug:account,user_email:email,client_label:"lab-workspace-proof"}});
  assert.equal(result.statusCode,200,result.body);return result.json().access_token as string;
};
const originalCount=async()=>Number((await pool.query<{n:string}>("SELECT count(*) AS n FROM subjects WHERE account_id='10000000-0000-4000-8000-000000000001'")).rows[0]!.n);

try {
  const parent=await login("fixture-alpha","reviewer@alpha.local");
  const returnSession=await login("fixture-alpha","reviewer@alpha.local");
  const outsider=await login("fixture-beta","recruiter@beta.local");
  await pool.query("INSERT INTO subjects(id,account_id,external_ref,display_label) VALUES ($1,'10000000-0000-4000-8000-000000000001',$2,'Preserved synthetic parent record')",
    [randomUUID(),`parent-proof-${randomUUID()}`]);
  const parentBefore=await originalCount();
  const workspaceId=randomUUID();
  const created=(await request(parent,"POST","/v1/lab/workspaces",{id:workspaceId,duration_hours:4})).json().workspace;
  assert.equal(created.state,"active");assert.equal(created.data_rows,0);assert(created.empty_verified_at);
  assert.equal(created.active_sessions,0);assert.equal(created.pending_media_writes,0);
  const repeated=(await request(parent,"POST","/v1/lab/workspaces",{id:workspaceId,duration_hours:4})).json().workspace;
  assert.equal(repeated.account_id,created.account_id);
  await request(parent,"POST","/v1/lab/workspaces",{id:workspaceId,duration_hours:24},409);
  await request(outsider,"GET",`/v1/lab/workspaces/${workspaceId}`,undefined,404);

  const entryId=randomUUID(),child=randomBytes(32).toString("base64url");
  const entryResponse=await request(parent,"POST",`/v1/lab/workspaces/${workspaceId}/entries`,{id:entryId,access_token:child});
  assert(!entryResponse.body.includes(child),"The server must not echo a client-held entry secret");
  const entry=entryResponse.json().entry;assert.equal(entry.state,"active");assert.equal(entry.session.user.kind,"lab_human");
  const retry=(await request(parent,"POST",`/v1/lab/workspaces/${workspaceId}/entries`,{id:entryId,access_token:child})).json().entry;
  assert.equal(retry.session_id,entry.session_id);
  await request(parent,"POST",`/v1/lab/workspaces/${workspaceId}/entries`,{id:entryId,access_token:randomBytes(32).toString("base64url")},409);
  assert.equal((await request(child,"GET","/v1/auth/session")).json().user.kind,"lab_human");
  await request(child,"POST","/v1/lab/workspaces",{id:randomUUID(),duration_hours:1},403);

  const person=randomUUID(),context=randomUUID();
  await pool.query("INSERT INTO subjects(id,account_id,external_ref,display_label) VALUES ($1,$2,$3,'Synthetic person')",
    [person,created.account_id,`lab-person-${person}`]);
  await pool.query("INSERT INTO assignments(id,account_id,subject_id,external_ref,display_label) VALUES ($1,$2,$3,$4,'Synthetic context')",
    [context,created.account_id,person,`lab-context-${context}`]);
  const bytes=Buffer.from([0xff,0xd8,0xff,0xd9]);
  const media=(await request(child,"POST","/v1/chat/media",{idempotency_key:randomUUID(),person_id:person,
    relationship_context_id:context,file_name:"synthetic.jpg",media_type:"image/jpeg",byte_size:bytes.length},201)).json();
  await request(child,"PUT",`/v1/chat/media/${media.id}/content`,bytes,200,{"content-type":"image/jpeg"});
  assert.deepEqual((await request(child,"GET",`/v1/chat/media/${media.id}/content`) as unknown as {rawPayload:Buffer}).rawPayload,bytes);
  const beforeStop=(await request(parent,"GET",`/v1/lab/workspaces/${workspaceId}`)).json().workspace;
  assert(beforeStop.data_rows>=3);assert.equal(beforeStop.pending_media_writes,0);

  await request(child,"POST","/v1/auth/logout");
  const selfRevoked=(await pool.query<{revoked_at:Date|null}>("SELECT revoked_at FROM lab_test_workspace_entries WHERE id=$1",[entryId])).rows[0];
  assert(selfRevoked?.revoked_at,"Child logout must release its bounded entry slot atomically");
  const left=(await request(returnSession,"POST",`/v1/lab/workspaces/${workspaceId}/entries/${entryId}/leave`)).json().entry;
  assert.equal(left.state,"revoked");await request(child,"GET","/v1/auth/session",undefined,401);
  const entry2=randomUUID(),child2=randomBytes(32).toString("base64url");
  await request(parent,"POST",`/v1/lab/workspaces/${workspaceId}/entries`,{id:entry2,access_token:child2});
  await request(parent,"POST","/v1/auth/logout");
  await request(child2,"GET","/v1/auth/session",undefined,401);
  const entry3=randomUUID(),child3=randomBytes(32).toString("base64url");
  assert.equal((await request(returnSession,"POST",`/v1/lab/workspaces/${workspaceId}/entries`,{id:entry3,access_token:child3})).json().entry.state,"active");

  const stopId=randomUUID();
  const writer=await pool.connect();
  await writer.query("BEGIN");
  await writer.query("INSERT INTO subjects(id,account_id,external_ref,display_label) VALUES ($1,$2,$3,'Already in flight')",
    [randomUUID(),created.account_id,`inflight-${randomUUID()}`]);
  let continuePurge!:()=>void, purgeStarted!:()=>void;
  const purgeGate=new Promise<void>(resolve=>{continuePurge=resolve;});
  const purgeObserved=new Promise<void>(resolve=>{purgeStarted=resolve;});
  const realPurge=storage.purgeForLab.bind(storage);
  storage.purgeForLab=async key=>{purgeStarted();await purgeGate;await realPurge(key);};
  let stopFinished=false;
  const stopping=request(returnSession,"POST",`/v1/lab/workspaces/${workspaceId}/stop`,{id:stopId}).then(result=>{stopFinished=true;return result;});
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(stopFinished,false,"Stop must wait for an already-started governed write");
  await writer.query("COMMIT");writer.release();
  await purgeObserved;
  const deleting=(await pool.query<{state:string}>("SELECT state FROM lab_test_workspaces WHERE id=$1",[workspaceId])).rows[0];
  assert.equal(deleting?.state,"deleting");
  await assert.rejects(pool.query("INSERT INTO subjects(id,account_id,external_ref,display_label) VALUES ($1,$2,$3,'Too late')",
    [randomUUID(),created.account_id,`too-late-${randomUUID()}`]),/LAB_TEST_WORKSPACE_CLOSED/);
  continuePurge();
  const deleted=(await stopping).json().workspace;
  storage.purgeForLab=realPurge;
  assert.equal(deleted.state,"deleted");assert.equal(deleted.stop_id,stopId);assert.equal(deleted.data_rows,0);
  assert.equal(deleted.active_sessions,0);assert.equal(deleted.pending_media_writes,0);
  assert.equal((await request(returnSession,"POST",`/v1/lab/workspaces/${workspaceId}/stop`,{id:stopId})).json().workspace.deleted_at,deleted.deleted_at);
  await request(child3,"GET","/v1/auth/session",undefined,401);
  await assert.rejects(readFile(join(mediaDirectory,created.account_id,person,media.id)),{code:"ENOENT"});
  await assert.rejects(pool.query("INSERT INTO subjects(id,account_id,external_ref,display_label) VALUES ($1,$2,$3,'Late data')",
    [randomUUID(),created.account_id,`late-${randomUUID()}`]),/LAB_TEST_WORKSPACE_CLOSED/);
  assert.equal(await originalCount(),parentBefore,"The original workspace must remain unchanged");

  const blockedId=randomUUID();
  const blocked=(await request(returnSession,"POST","/v1/lab/workspaces",{id:blockedId,duration_hours:1})).json().workspace;
  await pool.query("INSERT INTO lab_test_workspace_media_writes(id,workspace_id,media_id,state) VALUES ($1,$2,$3,'unknown')",
    [randomUUID(),blockedId,randomUUID()]);
  const incomplete=(await request(returnSession,"POST",`/v1/lab/workspaces/${blockedId}/stop`,{id:randomUUID()})).json().workspace;
  assert.equal(incomplete.state,"deleting");assert.equal(incomplete.cleanup_error,"media_unsettled");assert.equal(incomplete.pending_media_writes,1);
  await pool.query("UPDATE lab_test_workspace_media_writes SET state='settled',settled_at=now() WHERE workspace_id=$1",[blockedId]);
  await new LabWorkspaceService(pool,storage,3600).clean(blockedId);
  assert.equal((await request(returnSession,"GET",`/v1/lab/workspaces/${blockedId}`)).json().workspace.state,"deleted");

  await pool.query("CREATE TABLE lab_unclassified_proof(id uuid PRIMARY KEY)");
  await request(returnSession,"POST","/v1/lab/workspaces",{id:randomUUID(),duration_hours:1},503);
  await pool.query("DROP TABLE lab_unclassified_proof");

  const expiredId=randomUUID();
  const expired=(await request(returnSession,"POST","/v1/lab/workspaces",{id:expiredId,duration_hours:1})).json().workspace;
  await pool.query("UPDATE lab_test_workspaces SET expires_at=now()-interval '1 second' WHERE id=$1",[expiredId]);
  await new LabWorkspaceService(pool,storage,3600).sweep();
  const expiredReceipt=(await request(returnSession,"GET",`/v1/lab/workspaces/${expiredId}`)).json().workspace;
  assert.equal(expiredReceipt.state,"deleted");assert.equal(expiredReceipt.stop_reason,"expired");

  const dbSecretRows=Number((await pool.query<{n:string}>("SELECT count(*) AS n FROM lab_test_workspace_entries WHERE token_hash=$1",[sha256(child)])).rows[0]!.n);
  assert.equal(dbSecretRows,1,"Only an irreversible hash should identify the entry secret");
  const report={contract_version:created.contract_version??1,workspace_id:workspaceId,
    creation_empty_verified:true,credential_replay_same_session:true,credential_echoed:false,
    child_logout_recorded_entry:true,parent_revocation_invalidated_child:true,physical_media_deleted:true,data_rows_after_delete:deleted.data_rows,
    original_workspace_rows_preserved:parentBefore,schema_drift_blocked:true,unknown_media_blocked_receipt:true,
    in_flight_write_drained:true,late_write_blocked:true,expiry_cleanup_verified:true,
    external_model_calls:0,external_business_writes:0};
  console.log(JSON.stringify(report,null,2));
} finally {
  await app.close();await pool.end();await rm(mediaDirectory,{recursive:true,force:true});
}
