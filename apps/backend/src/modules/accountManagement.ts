import { CONTRACT_VERSION, type AccountSettings, type AccountMutation } from '@talent-signal/contracts';
import type { Pool, PoolClient } from 'pg';
import { inTransaction } from '../database/pool.js';
import { ApiError } from '../lib/apiError.js';
import { sha256 } from '../lib/hash.js';
import type { AuthContext } from './auth.js';

type AccountRow = { id: string; name: string; slug: string; owner_user_id: string | null; settings_revision: number };
type UserRow = { id: string; display_name: string; email: string; username: string | null;
  kind: string; account_role: 'admin' | 'member'; status: 'active' | 'revoked'; profile_revision: number };
const iso = (value: Date) => value.toISOString();
const realUser = (kind: string) => ['password_human', 'google_human', 'apple_human'].includes(kind);

async function context(client: PoolClient, auth: AuthContext, write = false) {
  const account = (await client.query<AccountRow>(`SELECT * FROM accounts WHERE id=$1 FOR ${write ? 'UPDATE' : 'SHARE'}`, [auth.accountId])).rows[0];
  const user = (await client.query<UserRow>('SELECT * FROM users WHERE account_id=$1 AND id=$2', [auth.accountId, auth.userId])).rows[0];
  const session = await client.query(`SELECT id FROM sessions WHERE id=$1 AND account_id=$2 AND user_id=$3
    AND revoked_at IS NULL AND expires_at>now() FOR SHARE`, [auth.sessionId, auth.accountId, auth.userId]);
  if (!account || !user || user.status !== 'active' || !session.rowCount) throw new ApiError(401, 'SESSION_INVALID', 'Sign in again.');
  const isOwner = account.owner_user_id === user.id;
  const canManage = user.kind !== 'lab_human' && (isOwner || user.account_role === 'admin');
  return { account, user, isOwner, canManage };
}

async function read(client: PoolClient, auth: AuthContext, labEnabled: boolean): Promise<AccountSettings> {
  const { account, user, isOwner, canManage } = await context(client, auth);
  const methods = (await client.query<{provider: 'google' | 'apple' | 'password'}>(`SELECT provider FROM auth_identities WHERE account_id=$1 AND user_id=$2
    UNION SELECT 'password' FROM password_credentials WHERE account_id=$1 AND user_id=$2`, [auth.accountId, auth.userId])).rows;
  const sessions = (await client.query<{id: string; client_label: string; created_at: Date; expires_at: Date}>(`SELECT id,client_label,created_at,expires_at FROM sessions
    WHERE account_id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 100`, [auth.accountId, auth.userId])).rows;
  const members = canManage ? (await client.query<UserRow>('SELECT * FROM users WHERE account_id=$1 ORDER BY created_at,id', [auth.accountId])).rows : [];
  const activity = canManage ? (await client.query<{id:string;kind:string;actor_name:string;created_at:Date}>(`SELECT e.id,e.kind,u.display_name AS actor_name,e.created_at
    FROM account_access_events e JOIN users u ON u.account_id=e.account_id AND u.id=e.actor_user_id
    WHERE e.account_id=$1 ORDER BY e.created_at DESC LIMIT 20`, [auth.accountId])).rows : [];
  return {
    contract_version: CONTRACT_VERSION,
    user: {id:user.id,email:user.email,display_name:user.display_name,username:user.username,kind:user.kind,
      revision:user.profile_revision,login_methods:methods.map(m=>m.provider)},
    workspace: {id:account.id,name:account.name,slug:account.slug,owner_user_id:account.owner_user_id,
      revision:account.settings_revision,role:user.account_role,is_owner:isOwner,can_manage:canManage,
      is_test:user.kind==='lab_human'||user.kind==='simulated_human'||account.slug.startsWith('fixture-')},
    sessions:sessions.map(s=>({...s,created_at:iso(s.created_at),expires_at:iso(s.expires_at),is_current:s.id===auth.sessionId})),
    members:members.map(m=>({id:m.id,display_name:m.display_name,email:m.email,role:m.account_role,status:m.status,is_owner:m.id===account.owner_user_id})),
    activity:activity.map(e=>({...e,created_at:iso(e.created_at)})),
    lab_enabled:labEnabled&&user.kind!=='lab_human',
  };
}

export function readAccountSettings(pool: Pool, auth: AuthContext, labEnabled: boolean) {
  return inTransaction(pool, client=>read(client,auth,labEnabled));
}

export async function mutateAccountSettings(pool: Pool, auth: AuthContext, input: AccountMutation, labEnabled: boolean) {
  return inTransaction(pool, async client=>{
    const {account,user,isOwner,canManage}=await context(client,auth,true);
    if (user.kind==='lab_human') throw new ApiError(403,'TEST_ACCOUNT_READ_ONLY','Return to your account to manage access.');
    const hash=sha256(JSON.stringify(Object.fromEntries(Object.entries(input).sort(([a],[b])=>a.localeCompare(b)))));
    const previous=(await client.query<{request_hash:string}>('SELECT request_hash FROM account_access_events WHERE account_id=$1 AND actor_user_id=$2 AND id=$3',[auth.accountId,auth.userId,input.id])).rows[0];
    if(previous){
      if(previous.request_hash!==hash) throw new ApiError(409,'ACCOUNT_OPERATION_CONFLICT','This operation ID was already used.');
      return read(client,auth,labEnabled);
    }
    if(input.kind==='profile'){
      if(user.profile_revision!==input.expected_revision) throw new ApiError(409,'ACCOUNT_STALE','Refresh before saving this profile.');
      await client.query('UPDATE users SET display_name=$3,profile_revision=profile_revision+1 WHERE account_id=$1 AND id=$2',[auth.accountId,auth.userId,input.name.trim()]);
    } else if(input.kind==='revoke_session'){
      if(input.session_id===auth.sessionId) throw new ApiError(409,'CURRENT_SESSION','Use sign out to end this session.');
      const result=await client.query('UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE account_id=$1 AND user_id=$2 AND id=$3 RETURNING id',[auth.accountId,auth.userId,input.session_id]);
      if(!result.rowCount) throw new ApiError(404,'SESSION_NOT_FOUND','Session not found.');
    } else {
      if(!canManage) throw new ApiError(403,'WORKSPACE_ADMIN_REQUIRED','Workspace management is not available to this member.');
      if(account.settings_revision!==input.expected_revision) throw new ApiError(409,'ACCOUNT_STALE','Workspace access changed. Refresh before continuing.');
      if(input.kind==='workspace'){
        await client.query('UPDATE accounts SET name=$2 WHERE id=$1',[auth.accountId,input.name.trim()]);
      }else{
        const target=(await client.query<UserRow>('SELECT * FROM users WHERE account_id=$1 AND id=$2 FOR UPDATE',[auth.accountId,input.user_id])).rows[0];
        if(!target) throw new ApiError(404,'MEMBER_NOT_FOUND','Member not found.');
        if(input.kind==='transfer'){
          if(!isOwner||!realUser(target.kind)||target.status!=='active'||target.id===user.id) throw new ApiError(403,'OWNER_TRANSFER_DENIED','Only the owner can transfer to another active real member.');
          await client.query('UPDATE accounts SET owner_user_id=$2 WHERE id=$1',[auth.accountId,target.id]);
        }else{
          if(target.id===user.id||target.id===account.owner_user_id||(!isOwner&&(target.account_role==='admin'||input.role==='admin'))) throw new ApiError(403,'MEMBER_CHANGE_DENIED','This member can only be managed by the workspace owner.');
          if(!realUser(target.kind)) throw new ApiError(403,'FIXTURE_MEMBER_READ_ONLY','Simulated identities are managed by the development fixture.');
          await client.query('UPDATE users SET account_role=$3,status=$4 WHERE account_id=$1 AND id=$2',[auth.accountId,target.id,input.role,input.status]);
          // Reinstating a member never resurrects prior sessions or tokens.
          if(input.status==='revoked'||input.role!==target.account_role) await client.query('UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE account_id=$1 AND user_id=$2',[auth.accountId,target.id]);
        }
      }
      await client.query('UPDATE accounts SET settings_revision=settings_revision+1 WHERE id=$1',[auth.accountId]);
    }
    await client.query('INSERT INTO account_access_events(id,account_id,actor_user_id,kind,request_hash) VALUES ($1,$2,$3,$4,$5)',[input.id,auth.accountId,auth.userId,input.kind,hash]);
    return read(client,auth,labEnabled);
  });
}
