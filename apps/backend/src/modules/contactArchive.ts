import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { inTransaction } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { appendAudit } from "../lib/audit.js";
import type { AuthContext } from "./auth.js";
import { lockContactTaskPerson } from "./contactTaskConcurrency.js";

/** Exact-target grant from an authenticated human request, never screenshot or model content. */
export async function executeGrantedContactArchive(pool:Pool,auth:AuthContext,input:{
  person_id:string;expected_revision:number;idempotency_key:string;decision:"archive";
},onTasksCancelled?:(taskIDs:string[])=>void){
  const result=await inTransaction(pool,async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`${auth.accountId}:contact-archive:${auth.userId}:${input.idempotency_key}`]);
    const prior=await client.query(`SELECT * FROM contact_archive_operations WHERE account_id=$1 AND decided_by_user_id=$2 AND idempotency_key=$3`,[auth.accountId,auth.userId,input.idempotency_key]);
    if(prior.rows[0]){
      const p=prior.rows[0];
      if(p.subject_id!==input.person_id||p.prior_revision!==input.expected_revision)throw new ApiError(409,"CONTACT_ARCHIVE_INTENT_CONFLICT","The saved archive request has a different target.");
      return {response:{operation_id:p.id,person_id:p.subject_id,status:p.status,revision:p.archived_revision,replayed:true},cancelledTaskIDs:[] as string[]};
    }
    // Profile confirmation can discover an existing person from confirmed
    // handles. Serialize that discovery before taking person/task locks.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`${auth.accountId}:reviewed-profile-admission`]);
    await lockContactTaskPerson(client,auth.accountId,input.person_id);
    const current=await client.query<{version:number}>(`SELECT version FROM subjects
      WHERE account_id=$1 AND id=$2 AND status='active' AND version=$3 FOR UPDATE`,
      [auth.accountId,input.person_id,input.expected_revision]);
    if(!current.rows[0])throw new ApiError(409,"CONTACT_ARCHIVE_TARGET_CHANGED","Reload this contact before archiving.");
    const active=(await client.query<{id:string}>(`SELECT id FROM screenshot_contact_tasks
      WHERE account_id=$1 AND status='running' AND
      (subject_id=$2 OR state #>> '{selected,person_id}'=$2::text)`,[auth.accountId,input.person_id])).rows.map(row=>row.id);
    // The idempotency and target revision checks above make this a valid fresh
    // archive intent. Abort local model exposure before the subject update can
    // wait on a task row held by dispatch authorization.
    onTasksCancelled?.(active);
    // Cancel by the IDs captured before the subject mutation. The directory
    // invalidation trigger can otherwise clear state.selected before this
    // archive transaction gets a chance to match selected-person tasks.
    const cancelled=active.length>0
      ? await client.query<{id:string}>(`UPDATE screenshot_contact_tasks SET status='cancelled',lease_epoch=lease_epoch+1,lease_until=NULL,
        state=jsonb_set(state,'{response,status}','"cancelled"'::jsonb),revision=revision+1
        WHERE account_id=$1 AND id=ANY($2::uuid[]) AND status='running' RETURNING id`,[auth.accountId,active])
      : {rows:[] as Array<{id:string}>};
    const updated=await client.query<{version:number}>(`UPDATE subjects SET status='deleted',deleted_at=now(),version=version+1
      WHERE account_id=$1 AND id=$2 AND status='active' AND version=$3 RETURNING version`,[auth.accountId,input.person_id,input.expected_revision]);
    if(!updated.rows[0])throw new ApiError(409,"CONTACT_ARCHIVE_TARGET_CHANGED","Reload this contact before archiving.");
    const operationID=randomUUID();
    await client.query(`INSERT INTO contact_archive_operations(id,account_id,subject_id,decided_by_user_id,idempotency_key,prior_revision,archived_revision,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,'archived')`,[operationID,auth.accountId,input.person_id,auth.userId,input.idempotency_key,input.expected_revision,updated.rows[0].version]);
    await appendAudit(client,{accountId:auth.accountId,actorUserId:auth.userId},"contact.archived","contact_archive_operation",operationID,{person_id:input.person_id,prior_revision:input.expected_revision,reversible:true});
    return {response:{operation_id:operationID,person_id:input.person_id,status:"archived",revision:updated.rows[0].version,replayed:false},
      cancelledTaskIDs:cancelled.rows.map(row=>row.id)};
  });
  onTasksCancelled?.(result.cancelledTaskIDs);
  return result.response;
}

export async function restoreContactArchive(pool:Pool,auth:AuthContext,operationID:string){
  return inTransaction(pool,async client=>{
    const result=await client.query(`SELECT * FROM contact_archive_operations WHERE account_id=$1 AND id=$2 AND decided_by_user_id=$3 FOR UPDATE`,[auth.accountId,operationID,auth.userId]);
    const operation=result.rows[0];if(!operation)throw new ApiError(404,"CONTACT_ARCHIVE_NOT_FOUND","Archive operation not found.");
    if(operation.status==="restored")return {operation_id:operationID,person_id:operation.subject_id,status:"restored",replayed:true};
    const restored=await client.query(`UPDATE subjects SET status='active',deleted_at=NULL,version=version+1 WHERE account_id=$1 AND id=$2 AND status='deleted' AND version=$3 RETURNING version`,[auth.accountId,operation.subject_id,operation.archived_revision]);
    if(!restored.rowCount)throw new ApiError(409,"CONTACT_ARCHIVE_TARGET_CHANGED","This contact changed after the archive operation.");
    await client.query("UPDATE contact_archive_operations SET status='restored',restored_at=now() WHERE account_id=$1 AND id=$2",[auth.accountId,operationID]);
    await appendAudit(client,{accountId:auth.accountId,actorUserId:auth.userId},"contact.archive_restored","contact_archive_operation",operationID,{person_id:operation.subject_id});
    return {operation_id:operationID,person_id:operation.subject_id,status:"restored",replayed:false};
  });
}
