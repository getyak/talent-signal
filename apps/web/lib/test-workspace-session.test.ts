import { describe,it,expect,vi,beforeEach } from 'vitest';
import { encode } from 'next-auth/jwt';
import { createHash } from 'node:crypto';
const jar=vi.hoisted(()=>new Map<string,string>());
vi.mock('next/headers',()=>({cookies:async()=>({get:(key:string)=>jar.has(key)?{value:jar.get(key)}:undefined,set:(key:string,value:string)=>jar.set(key,value),delete:(key:string)=>jar.delete(key)})}));
vi.mock('./server/backendAuth',()=>({authSecret:()=> 'synthetic-test-secret',backendAuthBaseUrl:()=> 'http://127.0.0.1:4317'}));
import { testWorkspaceSession,setTestWorkspaceSession,clearTestWorkspaceSession,TEST_WORKSPACE_COOKIE } from './server/testWorkspaceSession';
import type { BackendSessionClaims } from './server/backendAuth';
const primary:BackendSessionClaims={backendAccessToken:'synthetic-primary',backendAccountId:'primary-account',backendAccountName:'Primary',backendAccountSlug:'personal-test',backendUserId:'primary-user',backendUsername:null,backendRole:'member',backendExpiresAt:'2099-01-01T00:00:00Z'};
const test={workspaceId:'test-workspace',entryId:'test-entry',name:'Test',claims:{...primary,backendAccessToken:'synthetic-child',backendAccountId:'child-account'}};
beforeEach(()=>jar.clear());
describe('isolated test-session boundary',()=>{
  it('round-trips an encrypted test identity without replacing the primary session',async()=>{
    expect(await testWorkspaceSession(primary)).toBeNull();
    await setTestWorkspaceSession(primary,test);
    expect(jar.get(TEST_WORKSPACE_COOKIE)).not.toContain('synthetic-child');
    expect((await testWorkspaceSession(primary))?.claims.backendAccountId).toBe('child-account');
    await clearTestWorkspaceSession();expect(await testWorkspaceSession(primary)).toBeNull();
  });
  it('rejects a different primary login instead of silently returning its real workspace',async()=>{
    await setTestWorkspaceSession(primary,test);
    await expect(testWorkspaceSession({...primary,backendAccessToken:'different-login'})).rejects.toMatchObject({status:401});
  });
  it('rejects tampering and expired encrypted state',async()=>{
    jar.set(TEST_WORKSPACE_COOKIE,'invalid');await expect(testWorkspaceSession(primary)).rejects.toMatchObject({status:401});
    const parentHash=createHash('sha256').update(primary.backendAccessToken).digest('hex');
    jar.set(TEST_WORKSPACE_COOKIE,await encode({secret:'synthetic-test-secret',salt:TEST_WORKSPACE_COOKIE,maxAge:-60,token:{testWorkspace:{...test,parentHash,endpoint:'http://127.0.0.1:4317'}}}));
    await expect(testWorkspaceSession(primary)).rejects.toMatchObject({status:401});
  });
});
