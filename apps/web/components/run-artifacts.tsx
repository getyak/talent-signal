"use client";
import {useEffect,useRef,useState} from "react";
import {loadRunArtifactBlob,type RunArtifact} from "@/lib/run-artifact-download";
import {WORKSPACE_SESSION_EXPIRED_EVENT, workspaceSessionFetch} from "./workspace-session-request";
export function RunArtifacts({taskID}:{taskID:string}){return <TaskRunArtifacts key={taskID} taskID={taskID}/>;}
function TaskRunArtifacts({taskID}:{taskID:string}){
  const [inventory,setInventory]=useState<{files:RunArtifact[];sessionVersion:string}|null>(null);
  const [error,setError]=useState<string|null>(null),[busy,setBusy]=useState<string|null>(null);
  const lifetime=useRef<AbortController|null>(null);
  useEffect(()=>{
    const controller=new AbortController();lifetime.current=controller;
    const cancel=()=>{controller.abort();setInventory(null);};
    window.addEventListener(WORKSPACE_SESSION_EXPIRED_EVENT,cancel);window.addEventListener("pagehide",cancel);
    void workspaceSessionFetch(`/api/chat-artifacts/${encodeURIComponent(taskID)}`,{cache:"no-store",signal:controller.signal})
      .then(async response=>{if(response.ok){const files=await response.json(),sessionVersion=response.headers.get("x-workspace-session");
        if(!controller.signal.aborted&&sessionVersion)setInventory({files,sessionVersion});}}).catch(()=>{});
    return ()=>{controller.abort();window.removeEventListener(WORKSPACE_SESSION_EXPIRED_EVENT,cancel);window.removeEventListener("pagehide",cancel);};
  },[taskID]);
  async function download(file:RunArtifact){
    const controller=lifetime.current,binding=inventory?.sessionVersion;if(!controller||!binding||controller.signal.aborted)return;
    setBusy(file.id);setError(null);
    try{
      const blob=await loadRunArtifactBlob(taskID,file,binding,controller.signal);
      controller.signal.throwIfAborted();if(lifetime.current!==controller)return;
      const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=file.name;
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:"暂时无法下载，请重试。");}
    finally{if(!controller.signal.aborted)setBusy(null);}
  }
  if(!inventory?.files.length)return null;
  return <div aria-label="生成的文件"><p>生成的文件 · 分析结果，待核实</p>
    {inventory.files.map(file=><button key={file.id} type="button" className="context-secondary-button" disabled={busy!==null} onClick={()=>void download(file)}>
      {busy===file.id?"正在下载…":`下载 ${file.name}`} · {Math.max(1,Math.ceil(file.byte_size/1024))} KB
    </button>)}{error&&<p role="alert">{error}</p>}
  </div>;
}
