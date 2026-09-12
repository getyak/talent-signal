import 'server-only';
import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { decode, encode } from 'next-auth/jwt';
import { BackendSessionExpiredError } from '@/lib/backend-session';
import { authSecret, backendAuthBaseUrl, type BackendSessionClaims } from './backendAuth';

export const TEST_WORKSPACE_COOKIE='talent-signal.test-workspace';
export type TestWorkspaceSession={workspaceId:string;entryId:string;name:string;parentHash:string;endpoint:string;claims:BackendSessionClaims};
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function testWorkspaceSession(primary:BackendSessionClaims):Promise<TestWorkspaceSession|null>{
  const value=(await cookies()).get(TEST_WORKSPACE_COOKIE)?.value;
  if(!value)return null;
  try{
    const decoded=await decode({token:value,secret:authSecret(),salt:TEST_WORKSPACE_COOKIE});
    const data=decoded?.testWorkspace as TestWorkspaceSession|undefined;
    if(!data||data.endpoint!==backendAuthBaseUrl()||data.parentHash!==digest(primary.backendAccessToken))throw new Error('Session scope changed');
    if(typeof data.workspaceId!=='string'||typeof data.entryId!=='string'||!data.claims?.backendAccessToken||!data.claims.backendAccountId)throw new Error('Invalid test session');
    return data;
  }catch{throw new BackendSessionExpiredError();}
}
export async function setTestWorkspaceSession(primary:BackendSessionClaims,data:Omit<TestWorkspaceSession,'parentHash'|'endpoint'>){
  const value=await encode({secret:authSecret(),salt:TEST_WORKSPACE_COOKIE,maxAge:60*60*24,
    token:{testWorkspace:{...data,parentHash:digest(primary.backendAccessToken),endpoint:backendAuthBaseUrl()}}});
  (await cookies()).set(TEST_WORKSPACE_COOKIE,value,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:60*60*24});
}
export async function clearTestWorkspaceSession(){(await cookies()).delete(TEST_WORKSPACE_COOKIE);}
