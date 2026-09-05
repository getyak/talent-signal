import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { inTransaction } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { appendAudit } from "../lib/audit.js";
import type { AuthContext } from "./auth.js";

/** Exact-target grant from an authenticated human request, never screenshot or model content. */
export async function executeGrantedContactArchive(pool:Pool,auth:AuthContext,input:{
  person_id:string;expected_revision:number;idempotency_key:string;decision:"archive";
}){
  return inTransaction(pool,async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`${auth.accountId}:contact-archive:${auth.userId}:${input.idempotency_key}`]);
    const prior=await client.query(`SELECT * FROM contact_archive_operations WHERE account_id=$1 AND decided_by_user_id=$2 AND idempotency_key=$3`,[auth.accountId,auth.userId,input.idempotency_key]);
    if(prior.rows[0]){
      const p=prior.rows[0];
      if(p.subject_id!==input.person_id||p.prior_revision!==input.expected_revision)throw new ApiError(409,"CONTACT_ARCHIVE_INTENT_CONFLICT","The saved archive request has a different target.");
      return {operation_id:p.id,person_id:p.subject_id,status:p.status,revision:p.archived_revision,replayed:true};
    }
    const updated=await client.query<{version:number}>(`UPDATE subjects SET status='deleted',deleted_at=now(),version=version+1
      WHERE account_id=$1 AND id=$2 AND status='active' AND version=$3 RETURNING version`,[auth.accountId,input.person_id,input.expected_revision]);
    if(!updated.rows[0])throw new ApiError(409,"CONTACT_ARCHIVE_TARGET_CHANGED","Reload this contact before archiving.");
    const operationID=randomUUID();
    await client.query(`INSERT INTO contact_archive_operations(id,account_id,subject_id,decided_by_user_id,idempotency_key,prior_revision,archived_revision,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,'archived')`,[operationID,auth.accountId,input.person_id,auth.userId,input.idempotency_key,input.expected_revision,updated.rows[0].version]);
    // In-flight tasks cannot write after a human archives their target.
    await client.query(`UPDATE screenshot_contact_tasks SET status='cancelled',lease_epoch=lease_epoch+1,lease_until=NULL,
      state=jsonb_set(state,'{response,status}','"cancelled"'::jsonb),revision=revision+1 WHERE account_id=$1 AND subject_id=$2 AND status='running'`,[auth.accountId,input.person_id]);
    await appendAudit(client,{accountId:auth.accountId,actorUserId:auth.userId},"contact.archived","contact_archive_operation",operationID,{person_id:input.person_id,prior_revision:input.expected_revision,reversible:true});
    return {operation_id:operationID,person_id:input.person_id,status:"archived",revision:updated.rows[0].version,replayed:false};
  });
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
