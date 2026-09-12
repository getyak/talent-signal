import {workspaceSessionFetch} from "../components/workspace-session-request";
import type {ChatTaskResponse} from "@talent-signal/contracts";
export type RunArtifact=NonNullable<ChatTaskResponse["artifacts"]>[number];
/** Return bytes only while the original task and authenticated login still own them. */
export async function loadRunArtifactBlob(taskID:string,file:RunArtifact,sessionVersion:string,signal:AbortSignal,request:typeof fetch=fetch){
  signal.throwIfAborted();
  const headers={"x-workspace-session":sessionVersion},path=`/api/chat-artifacts/${encodeURIComponent(taskID)}`;
  const response=await workspaceSessionFetch(`${path}/${file.id}`,{cache:"no-store",headers,signal},request);signal.throwIfAborted();
  if(!response.ok)throw new Error(response.status===410?"来源已变更或文件已过期，请根据当前资料重新生成。":"暂时无法下载，请重试。");
  const blob=await response.blob();signal.throwIfAborted();
  if(blob.size!==file.byte_size)throw new Error("文件不完整，请重试。");
  const bytes=await blob.arrayBuffer();signal.throwIfAborted();
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(byte=>byte.toString(16).padStart(2,"0")).join("");
  signal.throwIfAborted();if(digest!==file.content_hash)throw new Error("文件校验失败，请重新生成。");
  // Recheck current cookies and source after the download, before a local save.
  const current=await workspaceSessionFetch(path,{cache:"no-store",headers,signal},request);signal.throwIfAborted();
  if(!current.ok)throw new Error("登录或来源已改变，请重新打开当前资料。");
  const files=await current.json() as RunArtifact[];signal.throwIfAborted();
  if(!files.some(item=>item.id===file.id&&item.content_hash===file.content_hash))throw new Error("来源已变更或文件已过期，请重新生成。");
  return blob;
}
