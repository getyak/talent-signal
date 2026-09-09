import 'server-only';
import { TalentSignalHttpError, type LabWorkspace } from '@talent-signal/contracts';
import { readPrimaryBackendSessionClaims, backendAuthBaseUrl } from './backendAuth';

export async function primaryAccount() {
  const primary=await readPrimaryBackendSessionClaims();
  if(!primary)throw new TalentSignalHttpError(401,'AUTH_REQUIRED','请重新登录。',null);
  return primary;
}
export async function testWorkspaceRequest<T>(path:string,body?:unknown):Promise<T>{
  const primary=await primaryAccount();
  const response=await fetch(`${backendAuthBaseUrl()}/v1/lab/workspaces${path}`,{
    method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${primary.backendAccessToken}`,'Content-Type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(15_000),
  });
  const result=await response.json();
  if(!response.ok)throw new TalentSignalHttpError(response.status,result.error?.code??'LAB_UNAVAILABLE','测试空间暂时无法完成操作。',null);
  return result as T;
}
export function listTestWorkspaces(){return testWorkspaceRequest<{enabled:boolean;workspaces:LabWorkspace[]}>('');}
