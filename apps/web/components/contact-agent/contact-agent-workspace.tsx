"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScreenshotContactTaskResponse, ScreenshotContactTaskRequest } from "@talent-signal/agent";
import styles from "./contact-agent.module.css";

type Task=ScreenshotContactTaskResponse;
type Intelligence={person_revision:number;tasks:Task[];archive?:{operation_id:string;display_name:string}|null};
type Recent=Pick<Task,"task_id"|"status"|"contact"|"summary"|"created_at"|"revision">;
const states:Record<string,string>={running:"正在整理",waiting_for_user:"需要你确认",completed:"已整理",partial:"已保存，部分未完成",failed:"尚未完成",cancelled:"已停止",deleted:"来源已不可用"};
const fields:Record<string,string>={headline:"一句话背景",company:"公司",job_title:"职位",location:"地点",professional_background:"职业背景",professional_topics:"职业议题",public_profile:"公开主页"};
const tools:Record<string,string>={extract_chat_screenshot:"读取截图",search_contacts:"查找已有联系人",read_contact:"读取联系人",create_contact:"创建联系人并保存消息",save_contact_chat:"保存聊天消息",search_contact_public:"搜索公开资料",fetch_contact_source:"读取公开来源",update_contact:"更新有来源的档案",finish_contact_task:"整理分析",ask_contact_clarification:"等待身份确认"};
async function request<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch(`/api/contact-agent/${path}`,{method:body?"POST":"GET",cache:"no-store",headers:{"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.json();if(!response.ok)throw new Error(value.message??value.error?.message??"暂时无法完成，请重试。");return value as T;
}
async function imageInput(file:File):Promise<ScreenshotContactTaskRequest["image"]>{
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>10_000_000)throw new Error("请选择 10 MB 以内的 PNG、JPEG 或 WebP 聊天截图。");
  const bytes=await file.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),v=>v.toString(16).padStart(2,"0")).join("");
  const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]!);reader.onerror=()=>reject(new Error("截图读取失败。"));reader.readAsDataURL(file);});
  return {media_type:file.type as ScreenshotContactTaskRequest["image"]["media_type"],byte_size:file.size,content_hash:hash,data_base64:data};
}

export function ContactAgentWorkspace({personID,contextID}:{personID?:string;contextID?:string}){
  const [file,setFile]=useState<File|null>(null);const [objective,setObjective]=useState("");const [research,setResearch]=useState(true);
  const [task,setTask]=useState<Task|null>(null);const [recent,setRecent]=useState<Recent[]>([]);const [profileTasks,setProfileTasks]=useState<Task[]>([]);
  const [revision,setRevision]=useState<number|null>(null);const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [name,setName]=useState("");
  const [archiveName,setArchiveName]=useState<string|null>(null);
  const [archiveOpen,setArchiveOpen]=useState(false);const [archiveID,setArchiveID]=useState<string|null>(null);
  const attempt=useRef<ScreenshotContactTaskRequest|null>(null);
  const loadHistory=useCallback(async()=>{const result=await request<{tasks:Recent[]}>("tasks");setRecent(result.tasks);},[]);
  const loadProfile=useCallback(async()=>{if(!personID||!contextID)return;const result=await request<Intelligence>(`people/${personID}/contact-intelligence?relationship_context_id=${encodeURIComponent(contextID)}`);setProfileTasks(result.tasks);setRevision(result.person_revision);setArchiveID(result.archive?.operation_id??null);setArchiveName(result.archive?.display_name??null);},[personID,contextID]);
  useEffect(()=>{
    let valid=true;
    request<{tasks:Recent[]}>("tasks").then(result=>{if(valid)setRecent(result.tasks);}).catch(e=>{if(valid)setError(e.message);});
    if(personID&&contextID)request<Intelligence>(`people/${personID}/contact-intelligence?relationship_context_id=${encodeURIComponent(contextID)}`)
      .then(result=>{if(valid){setProfileTasks(result.tasks);setRevision(result.person_revision);setArchiveID(result.archive?.operation_id??null);setArchiveName(result.archive?.display_name??null);}}).catch(e=>{if(valid)setError(e.message);});
    return()=>{valid=false;};
  },[personID,contextID]);
  const taskID=task?.task_id;const status=task?.status;
  useEffect(()=>{
    if(!taskID||status!=="running")return;
    let valid=true;let timeout:ReturnType<typeof setTimeout>;
    const poll=async()=>{try{const next=await request<Task>(`tasks/${taskID}`);if(!valid)return;setTask(next);if(next.status==="running")timeout=setTimeout(poll,2200);else await Promise.all([loadHistory(),loadProfile()]);}catch(e){if(valid){setError((e as Error).message);timeout=setTimeout(poll,5000);}}};
    timeout=setTimeout(poll,1500);return()=>{valid=false;clearTimeout(timeout);};
  },[taskID,status,loadHistory,loadProfile]);
  useEffect(()=>{if(taskID)document.getElementById(`contact-task-${taskID}`)?.scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});},[taskID]);
  async function submit(){
    if(!file)return;setBusy(true);setError("");
    try{
      const image=await imageInput(file);
      if(!attempt.current||attempt.current.image.content_hash!==image.content_hash)attempt.current={idempotency_key:crypto.randomUUID(),objective:objective.trim()||"将这张聊天截图归档到正确联系人，保存消息并给出有依据的分析。若公开职业线索充分，可自主搜索、读取并更新档案。",image,allow_public_research:research,captured_at:new Date().toISOString(),...(personID&&contextID?{selected_person_id:personID,selected_relationship_context_id:contextID}:{})};
      const result=await request<Task>("tasks",attempt.current);setTask(result);attempt.current=null;setFile(null);await loadHistory();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function resume(item:Task,selection?:{person_id:string;relationship_context_id:string}){
    setBusy(true);setError("");
    try{setTask(await request<Task>(`tasks/${item.task_id}/resume`,{expected_revision:item.revision,
      ...(selection?{selected_person_id:selection.person_id,selected_relationship_context_id:selection.relationship_context_id}:name.trim()?{new_contact_name:name.trim()}:{}),
      ...(!item.extraction&&file?{image:await imageInput(file)}:{})}));setName("");}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function openTask(id:string){setError("");try{setTask(await request<Task>(`tasks/${id}`));}catch(e){setError((e as Error).message);}}
  async function archive(){if(!personID||!revision)return;setBusy(true);try{const result=await request<{operation_id:string}>(`people/${personID}/archive`,{expected_revision:revision,idempotency_key:crypto.randomUUID(),decision:"archive"});setArchiveID(result.operation_id);setArchiveName(personName??null);setArchiveOpen(false);setProfileTasks([]);setTask(null);await loadHistory();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function restore(){if(!archiveID)return;try{await request(`archives/${archiveID}/restore`,{});setArchiveID(null);await Promise.all([loadProfile(),loadHistory()]);}catch(e){setError((e as Error).message);}}
  const shown=task?[task]:profileTasks;
  const scopedRecent=personID?recent.filter(item=>item.contact?.person_id===personID&&item.contact.relationship_context_id===contextID):recent;
  const personName=archiveName??profileTasks[0]?.contact?.display_name??task?.contact?.display_name;
  return <div className={styles.page}>
    <header className={styles.header}><Link href="/contact-agent" className={styles.brand}>Talent Signal <span>关系工作台</span></Link><Link href="/workspace">返回工作台</Link></header>
    <main className={styles.layout} id="main-content">
      <aside className={styles.sidebar}><p className={styles.eyebrow}>{personID?"这位联系人的整理记录":"最近整理"}</p>{scopedRecent.length===0?<p className={styles.muted}>你的截图任务会保留在这里。</p>:scopedRecent.map(item=><button key={item.task_id} onClick={()=>void openTask(item.task_id)} className={item.task_id===taskID?styles.selected:""}><strong>{item.contact?.display_name??"聊天截图"}</strong><span>{states[item.status]} · {new Date(item.created_at).toLocaleDateString("zh-CN")}</span></button>)}</aside>
      <div className={styles.content}>
        <div className={styles.intro}><p className={styles.eyebrow}>{personID?"联系人档案":"截图 → 联系人"}</p><h1>{personID?personName??"联系人":"让一段对话，成为可继续的关系。"}</h1><p>保存聊天中的消息，记住变化和待确认的问题。每条资料都能回到来源。</p>
          {personID&&revision&&!archiveID&&<button className={styles.textButton} onClick={()=>setArchiveOpen(true)}>归档联系人</button>}
        </div>
        {archiveID?<div className={styles.card}><p>联系人已归档，资料已从当前工作区隐藏。</p><button onClick={()=>void restore()}>撤销归档</button></div>:<details open={!personID} className={personID?styles.profileComposer:undefined}><summary hidden={!personID}>追加聊天截图</summary><section className={styles.composer} aria-label="导入聊天截图">
          <label className={styles.upload}><span>＋ 选择聊天截图</span><small>{file?file.name:"PNG、JPEG 或 WebP · 最大 10 MB"}</small><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="选择聊天截图" onChange={event=>{setFile(event.target.files?.[0]??null);attempt.current=null;}} disabled={busy||status==="running"}/></label>
          <label className={styles.label}>这次想了解什么？<textarea value={objective} onChange={e=>{setObjective(e.target.value);attempt.current=null;}} placeholder="例如：记下这次沟通，查找公开职业资料，帮我想清楚下一步。" rows={2}/></label>
          <div className={styles.composerActions}><label><input type="checkbox" checked={research} onChange={e=>{setResearch(e.target.checked);attempt.current=null;}}/>允许搜索公开职业资料</label><button className={styles.primary} onClick={()=>void submit()} disabled={!file||busy||status==="running"}>{busy?"正在提交…":"整理到联系人"}</button></div>
          <p className={styles.footnote}>发送后会自动查找或创建系统内联系人，并保存提取的消息与来源资料 30 天。原图只用于本次识别；遇到身份歧义会停下来请你确认。</p>
        </section></details>}
        {error&&<p role="alert" className={styles.error}>{error}</p>}
        {shown.map(item=><section className={styles.card} key={item.task_id} id={`contact-task-${item.task_id}`} aria-label="联系人分析卡片">
          <div className={styles.cardHeading}><div><p className={styles.eyebrow} role="status">{states[item.status]}</p><h2>{item.contact?.display_name??"正在识别这段对话"}</h2></div>{item.contact&&<Link className={styles.profileLink} href={`/contact-agent/people/${item.contact.person_id}?context=${item.contact.relationship_context_id}`}>打开档案 ↗</Link>}</div>
          {item.contact&&<p className={styles.muted}>{item.contact.disposition==="created"?"已创建联系人":"已复用已有联系人"} · 已保存 {item.message_count} 条消息 · {new Date(item.created_at).toLocaleDateString("zh-CN")}</p>}
          {item.summary&&<p className={styles.summary}>{item.summary}</p>}
          {item.status==="running"&&<div className={styles.progress}><span className={styles.pulse}/><span>{tools[item.events.at(-1)?.tool??""]??"Agent 正在读取截图并选择下一步"}</span><button onClick={()=>void request<Task>(`tasks/${item.task_id}/cancel`,{expected_revision:item.revision}).then(setTask).catch(e=>setError(e.message))}>停止</button></div>}
          {item.question&&<div className={styles.question}><h3>{item.question}</h3>{item.candidates.map(candidate=><button key={`${candidate.person_id}:${candidate.relationship_context_id}`} onClick={()=>void resume(item,candidate)} disabled={busy}>{candidate.display_name} · {candidate.relationship_label}</button>)}<label className={styles.label}>或指定本次归档的联系人姓名<input value={name} onChange={e=>setName(e.target.value)} maxLength={200}/></label><button onClick={()=>void resume(item)} disabled={busy||(!name.trim()&&!file)}>确认并继续</button></div>}
          {["failed","partial","cancelled"].includes(item.status)&&<button onClick={()=>void resume(item)} disabled={busy}>继续这个任务</button>}
          {item.findings.length>0&&<div className={styles.section}><h3>这次对话留下了什么</h3>{item.findings.map((finding,i)=><article className={styles.finding} key={i}><p>{finding.text}</p><blockquote>{finding.source_excerpt}</blockquote><small>{finding.epistemic_status==="inference"?"分析判断":"来源陈述"} · {finding.message_refs.join("、")}</small></article>)}</div>}
          {item.profile_fields.length>0&&<div className={styles.section}><h3>有来源的职业资料</h3><dl className={styles.profile}>{item.profile_fields.map((field,i)=><div key={i}><dt>{fields[field.field]}</dt><dd>{field.value}<details><summary>{field.epistemic_status==="inference"?"查看推断依据":"查看原文"}</summary><blockquote>{field.source_excerpt}</blockquote>{field.source_refs.map(ref=>{const source=item.public_sources.find(s=>s.source_id===ref);return source?<a key={ref} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>:<small key={ref}>{ref.startsWith("clue")?"截图线索":"聊天消息"} {ref}</small>;})}</details></dd></div>)}</dl><p className={styles.footnote}>这些是来源陈述或分析判断，保留冲突值，不覆盖人工确认的资料。</p></div>}
          {item.extraction&&<details className={styles.section}><summary>聊天原文 · {item.extraction.messages.length} 条</summary><ol className={styles.messages}>{item.extraction.messages.map(message=><li key={message.message_id}><small>{message.message_id} · {message.speaker_side==="left"?"画面左侧":message.speaker_side==="right"?"画面右侧":"说话人未确定"}{message.time_text?` · ${message.time_text}`:""}</small><p>{message.text}</p></li>)}</ol></details>}
          {item.public_sources.length>0&&<details className={styles.section}><summary>检索过的公开来源 · {item.public_sources.length}</summary><p className={styles.footnote}>检索结果可能包含同名人物；只有经过核对的引用才会进入上方资料。</p>{item.public_sources.map(source=><p key={source.source_id}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a><small className={styles.sourceMeta}>{source.channel} · {source.stage==="fetched"?"已读取正文":"待核对匹配"} · {new Date(source.retrieved_at).toLocaleDateString("zh-CN")}</small></p>)}</details>}
          {item.limitations.length>0&&<details className={styles.section}><summary>仍需注意与核对</summary><ul>{item.limitations.map((line,i)=><li key={i}>{line}</li>)}</ul></details>}
          <details className={styles.section}><summary>查看实际处理记录</summary><ol>{item.events.map(event=><li key={event.sequence}>{tools[event.tool]??event.tool} · {event.status==="completed"?"完成":event.status==="denied"?"请求未获执行":"未完成"}</li>)}</ol></details>
        </section>)}
      </div>
    </main>
    {archiveOpen&&<div className={styles.modalBackdrop}><section role="dialog" aria-modal="true" aria-labelledby="archive-title" className={styles.card}><h2 id="archive-title">归档 {personName}？</h2><p>联系人将从当前工作区隐藏，正在进行的整理会停止。资料仍按原保留期限保存，你可以撤销归档。</p><button onClick={()=>setArchiveOpen(false)}>取消</button><button className={styles.primary} disabled={busy} onClick={()=>void archive()}>归档这个联系人</button></section></div>}
  </div>;
}
