"use client";

import Link from "next/link";
import { ProductFeedback } from "@/components/product-feedback";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScreenshotContactTaskResponse, ScreenshotContactTaskRequest, ContactProfileConfirmation, TextContactTaskRequest } from "@talent-signal/agent";
import { ContactProfileReview, ReviewedContactProfile } from "./contact-profile-review";
import styles from "./contact-agent.module.css";

type Task=ScreenshotContactTaskResponse;
type Attachment={id:string;file:File;url:string};
type Intelligence={person_revision:number;tasks:Task[];archive?:{operation_id:string;display_name:string}|null};
type Recent=Pick<Task,"task_id"|"status"|"contact"|"summary"|"created_at"|"revision"|"source">;
const states:Record<string,string>={running:"正在整理",waiting_for_user:"需要你确认",completed:"已整理",partial:"已保存，部分未完成",failed:"尚未完成",cancelled:"已停止",deleted:"来源已不可用"};
const failureCopy=(item:Task)=>item.limitations.includes("CONTACT_AGENT_PROVIDER_HTTP_429")?"AI 服务暂时繁忙，来源已经保存。稍后可继续这条任务。":item.limitations.includes("CONTACT_AGENT_SERVER_STOPPED")?"服务重启中断了处理。来源仍在，可以从这条任务继续。":null;
const fields:Record<string,string>={headline:"一句话背景",company:"公司",job_title:"职位",location:"地点",professional_background:"职业背景",professional_topics:"职业议题",public_profile:"公开主页"};
const tools:Record<string,string>={extract_chat_screenshot:"读取截图",extract_web_text:"读取网页文字",search_contacts:"查找已有联系人",read_contact:"读取联系人",create_contact:"创建联系人并保存消息",save_contact_chat:"保存聊天消息",search_contact_public:"搜索公开资料",fetch_contact_source:"读取公开来源",update_contact:"更新有来源的档案",finish_contact_task:"整理分析",ask_contact_clarification:"等待身份确认"};
async function request<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch(`/api/contact-agent/${path}`,{method:body?"POST":"GET",cache:"no-store",headers:{"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.json();if(!response.ok)throw new Error(value.message??value.error?.message??"暂时无法完成，请重试。");return value as T;
}
async function imageInput(file:File):Promise<ScreenshotContactTaskRequest["image"]>{
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>10_000_000)throw new Error("请选择 10 MB 以内的 PNG、JPEG 或 WebP 截图。");
  const bytes=await file.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),v=>v.toString(16).padStart(2,"0")).join("");
  const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]!);reader.onerror=()=>reject(new Error("截图读取失败。"));reader.readAsDataURL(file);});
  return {media_type:file.type as ScreenshotContactTaskRequest["image"]["media_type"],byte_size:file.size,content_hash:hash,data_base64:data};
}

export function ContactAgentWorkspace({personID,contextID,embedded=false,initialTaskID}:{personID?:string;contextID?:string;embedded?:boolean;initialTaskID?:string}){
  const [text,setText]=useState("");const [inputMode,setInputMode]=useState<"image"|"text">("image");const [filter,setFilter]=useState("all");const [deleteID,setDeleteID]=useState<string|null>(null);
  const [attachments,setAttachments]=useState<Attachment[]>([]);
  const previewURLs=useRef(new Set<string>());
  useEffect(()=>{const urls=previewURLs.current;return()=>{urls.forEach(url=>URL.revokeObjectURL(url));};},[]);const [objective,setObjective]=useState("");const [research,setResearch]=useState(false);
  const [task,setTask]=useState<Task|null>(null);const [recent,setRecent]=useState<Recent[]>([]);const [profileTasks,setProfileTasks]=useState<Task[]>([]);
  const [revision,setRevision]=useState<number|null>(null);const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [name,setName]=useState("");
  const [archiveName,setArchiveName]=useState<string|null>(null);
  const [archiveOpen,setArchiveOpen]=useState(false);const [archiveID,setArchiveID]=useState<string|null>(null);
  const attempt=useRef<ScreenshotContactTaskRequest|TextContactTaskRequest|null>(null);
  const loadHistory=useCallback(async()=>{const result=await request<{tasks:Recent[]}>("tasks");setRecent(result.tasks);},[]);
  const loadProfile=useCallback(async()=>{if(!personID||!contextID)return;const result=await request<Intelligence>(`people/${personID}/contact-intelligence?relationship_context_id=${encodeURIComponent(contextID)}`);setProfileTasks(result.tasks);setRevision(result.person_revision);setArchiveID(result.archive?.operation_id??null);setArchiveName(result.archive?.display_name??null);},[personID,contextID]);
  useEffect(()=>{
    let valid=true;
    request<{tasks:Recent[]}>("tasks").then(result=>{if(valid)setRecent(result.tasks);}).catch(e=>{if(valid)setError(e.message);});
    if(personID&&contextID)request<Intelligence>(`people/${personID}/contact-intelligence?relationship_context_id=${encodeURIComponent(contextID)}`)
      .then(result=>{if(valid){setProfileTasks(result.tasks);setRevision(result.person_revision);setArchiveID(result.archive?.operation_id??null);setArchiveName(result.archive?.display_name??null);}}).catch(e=>{if(valid)setError(e.message);});
    return()=>{valid=false;};
  },[personID,contextID]);
  useEffect(()=>{
    let valid=true;
    if(initialTaskID)request<Task>(`tasks/${initialTaskID}`).then(value=>{if(valid)setTask(value);}).catch(e=>{if(valid)setError(e.message);});
    return()=>{valid=false;};
  },[initialTaskID]);
  useEffect(()=>{
    let valid=true;let timer:ReturnType<typeof setTimeout>;
    const refresh=async()=>{
      try{if(document.visibilityState==="visible"){const value=await request<{tasks:Recent[]}>("tasks");if(valid)setRecent(value.tasks);}}
      catch(e){if(valid)setError((e as Error).message);}
      if(valid)timer=setTimeout(refresh,4500);
    };
    timer=setTimeout(refresh,4500);return()=>{valid=false;clearTimeout(timer);};
  },[]);
  const taskID=task?.task_id;const status=task?.status;
  useEffect(()=>{
    if(!taskID||status!=="running")return;
    let valid=true;let timeout:ReturnType<typeof setTimeout>;
    const poll=async()=>{try{const next=await request<Task>(`tasks/${taskID}`);if(!valid)return;setTask(next);setError("");if(next.status==="running")timeout=setTimeout(poll,2200);else await Promise.all([loadHistory(),loadProfile()]);}catch(e){if(valid){setError((e as Error).message);timeout=setTimeout(poll,5000);}}};
    timeout=setTimeout(poll,1500);return()=>{valid=false;clearTimeout(timeout);};
  },[taskID,status,loadHistory,loadProfile]);
  useEffect(()=>{if(taskID)document.getElementById(`contact-task-${taskID}`)?.scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});},[taskID]);
  function clearAttachments(){previewURLs.current.forEach(url=>URL.revokeObjectURL(url));previewURLs.current.clear();setAttachments([]);}
  function selectFiles(files:FileList|null){
    if(!files?.length)return;
    const selected=Array.from(files);
    if(attachments.length+selected.length>10){setError("每次最多发送 10 张图片。");return;}
    if(selected.some(file=>!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size===0||file.size>10_000_000)){
      setError("请选择 10 MB 以内的 PNG、JPEG 或 WebP 图片。");return;
    }
    if([...attachments.map(a=>a.file),...selected].reduce((sum,file)=>sum+file.size,0)>30_000_000){setError("图片总计不能超过 30 MB，请分开发送。");return;}
    const added=selected.map(file=>{const url=URL.createObjectURL(file);previewURLs.current.add(url);return {id:crypto.randomUUID(),file,url};});
    setAttachments(current=>[...current,...added]);attempt.current=null;setError("");
  }
  function removeAttachment(id:string){
    const removed=attachments.find(a=>a.id===id);if(removed){URL.revokeObjectURL(removed.url);previewURLs.current.delete(removed.url);}
    setAttachments(current=>current.filter(a=>a.id!==id));attempt.current=null;
  }
  async function submit(){
    if(inputMode==="image"?!attachments.length:!text.trim())return;setBusy(true);setError("");
    try{
      if(inputMode==="text"&&!attempt.current)attempt.current={idempotency_key:crypto.randomUUID(),objective:objective.trim()||"整理这段来源，识别人物并保存准确证据。身份不清时询问，没有人物不创建。",text:text.trim(),source:{kind:"selected_text",title:"粘贴的文字",url:"",time_basis:"imported_at"},...(personID&&contextID?{selected_person_id:personID,selected_relationship_context_id:contextID}:{}),allow_public_research:research,captured_at:new Date().toISOString()};
      const images=inputMode==="image"?await Promise.all(attachments.map(attachment=>imageInput(attachment.file))):[];
      const image=images[0]!;
      if(!attempt.current)attempt.current={idempotency_key:crypto.randomUUID(),objective:objective.trim()||"识别这些截图中的聊天或个人主页；聊天按顺序归档，个人主页生成可核对的资料草稿。若公开职业线索充分，可自主搜索、读取并更新档案。",image,...(images.length>1?{additional_images:images.slice(1)}:{}),allow_public_research:research,captured_at:new Date().toISOString(),...(personID&&contextID?{selected_person_id:personID,selected_relationship_context_id:contextID}:{})};
      const result=await request<Task>("tasks",attempt.current);setTask(result);attempt.current=null;clearAttachments();setText("");await loadHistory();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function resume(item:Task,selection?:{person_id:string;relationship_context_id:string}){
    setBusy(true);setError("");
    try{setTask(await request<Task>(`tasks/${item.task_id}/resume`,{expected_revision:item.revision,
      ...(selection?{selected_person_id:selection.person_id,selected_relationship_context_id:selection.relationship_context_id}:name.trim()?{new_contact_name:name.trim()}:{}),
      ...(!item.extraction&&!item.source_images?.length&&attachments[0]?{image:await imageInput(attachments[0].file)}:{})}));setName("");}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function confirmProfile(item:Task,review:ContactProfileConfirmation){
    setBusy(true);setError("");
    try{setTask(await request<Task>(`tasks/${item.task_id}/profile-confirmation`,review));await Promise.all([loadHistory(),loadProfile()]);}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function removeSource(item:Task){setBusy(true);try{setTask(await request<Task>(`tasks/${item.task_id}/delete`,{expected_revision:item.revision}));setDeleteID(null);await loadHistory();}catch(e){setError((e as Error).message);await openTask(item.task_id);}finally{setBusy(false);}}
  async function openTask(id:string){setError("");try{setTask(await request<Task>(`tasks/${id}`));}catch(e){setError((e as Error).message);}}
  async function archive(){if(!personID||!revision)return;setBusy(true);try{const result=await request<{operation_id:string}>(`people/${personID}/archive`,{expected_revision:revision,idempotency_key:crypto.randomUUID(),decision:"archive"});setArchiveID(result.operation_id);setArchiveName(personName??null);setArchiveOpen(false);setProfileTasks([]);setTask(null);await loadHistory();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function restore(){if(!archiveID)return;try{await request(`archives/${archiveID}/restore`,{});setArchiveID(null);await Promise.all([loadProfile(),loadHistory()]);}catch(e){setError((e as Error).message);}}
  const shown=task?[task]:profileTasks;
  const scopedRecent=(personID?recent.filter(item=>item.contact?.person_id===personID&&item.contact.relationship_context_id===contextID):recent).filter(item=>filter==="all"||item.status==="waiting_for_user"||item.status==="failed"||item.status==="partial");
  const personName=archiveName??profileTasks[0]?.contact?.display_name??task?.contact?.display_name;
  return <div className={`${styles.page} ${embedded?styles.embedded:""}`}>
    {!embedded&&<header className={styles.header}><Link href="/contact-agent" className={styles.brand}>Talent Signal <span>关系工作台</span></Link><Link href="/workspace">返回工作台</Link></header>}
    <main className={styles.layout} id="main-content">
      <aside className={styles.sidebar}><p className={styles.eyebrow}>{personID?"这位联系人的整理记录":"采集记录"}</p><div className={styles.filters}><button aria-pressed={filter==="all"} onClick={()=>setFilter("all")}>全部</button><button aria-pressed={filter==="attention"} onClick={()=>setFilter("attention")}>待处理</button></div>{scopedRecent.length===0?<p className={styles.muted}>插件发送的网页与截图会自动出现在这里。</p>:scopedRecent.map(item=><button key={item.task_id} onClick={()=>void openTask(item.task_id)} aria-pressed={item.task_id===taskID} className={item.task_id===taskID?styles.selected:""}><strong>{item.contact?.display_name??item.source?.title??"截图"}</strong>{item.contact&&item.source&&<span className={styles.recentSource} title={item.source.title}>{item.source.title}</span>}<span>{states[item.status]} · {new Date(item.created_at).toLocaleDateString("zh-CN")}</span></button>)}</aside>
      <div className={styles.content}>
        <div className={styles.intro}><p className={styles.eyebrow}>{personID?"联系人档案":"来源 · 人物 · 后续"}</p><h1>{personID?personName??"联系人":"采集"}</h1><p>从网页或屏幕留下线索，在这里继续。识别人物、保存来源，把需要判断的地方留给你。</p>
          {personID&&revision&&!archiveID&&<button className={styles.textButton} onClick={()=>setArchiveOpen(true)}>归档联系人</button>}
        </div>
        {archiveID?<div className={styles.card}><p>联系人已归档，资料已从当前工作区隐藏。</p><button onClick={()=>void restore()}>撤销归档</button></div>:<details open={!personID&&!taskID} className={styles.profileComposer}><summary hidden={!personID&&!taskID}>{personID?"追加来源":"添加新的采集"}</summary><section className={styles.composer} aria-label="添加来源">
          <div className={styles.inputModes}><button aria-pressed={inputMode==="image"} onClick={()=>{setInputMode("image");attempt.current=null;}} disabled={busy}>截图</button><button aria-pressed={inputMode==="text"} onClick={()=>{setInputMode("text");attempt.current=null;}} disabled={busy}>文字</button><span>也可以从浏览器插件发送</span></div>
          {inputMode==="text"?<label className={styles.label}>来源文字<textarea rows={5} maxLength={50000} value={text} onChange={e=>{setText(e.target.value);attempt.current=null;}} placeholder="粘贴人物介绍、网页片段或对话原文…" disabled={busy}/></label>:<>
          <label className={styles.upload}><span>＋ {attachments.length?"添加图片":"选择聊天截图"}</span>{attachments.length>0&&<span>{attachments.length} / 10</span>}<input type="file" multiple accept="image/png,image/jpeg,image/webp" aria-label="选择聊天截图" onChange={event=>{selectFiles(event.target.files);event.target.value="";}} disabled={busy||status==="running"}/></label>
          {attachments.length>0&&<ol className={styles.attachments} aria-label="待发送图片">{attachments.map((attachment,index)=><li key={attachment.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={attachment.url} alt={`第 ${index+1} 张：${attachment.file.name}`}/><span>{index+1}</span><button aria-label={`移除第 ${index+1} 张图片`} onClick={()=>removeAttachment(attachment.id)} disabled={busy||status==="running"}>×</button>
          </li>)}</ol>}
          </>}<label className={styles.label}>这次想了解什么？<textarea value={objective} onChange={e=>{setObjective(e.target.value);attempt.current=null;}} placeholder="例如：记下这次沟通，查找公开职业资料，帮我想清楚下一步。" rows={2}/></label>
          <div className={styles.composerActions}><label><input type="checkbox" checked={research} onChange={e=>{setResearch(e.target.checked);attempt.current=null;}}/>允许搜索公开职业资料</label><button className={styles.primary} onClick={()=>void submit()} disabled={(inputMode==="image"?!attachments.length:!text.trim())||busy||status==="running"}>{busy?"正在提交…":"保存并整理"}</button></div>
        <p className={styles.retention}>发送后由 AI 整理并归档人物；原文与分析保留最多 30 天，可随时删除。</p></section></details>}
        {error&&<p role="alert" className={styles.error}>{error}</p>}
        {shown.map(item=><section className={styles.card} key={item.task_id} id={`contact-task-${item.task_id}`} aria-label="联系人分析卡片">
          <div className={styles.cardHeading}><div><p className={styles.eyebrow} role="status">{states[item.status]}</p><h2>{item.contact?.display_name??item.contact_draft?.display_name??item.source?.title??(item.status==="completed"?"已检查来源":"采集结果")}</h2></div>{item.contact&&<Link className={styles.profileLink} href={`/workspace/captures/people/${item.contact.person_id}?context=${item.contact.relationship_context_id}`}>打开档案 ↗</Link>}</div>
          {item.contact&&<p className={styles.muted}>{item.contact.disposition==="created"?"已创建联系人":"已复用已有联系人"} · 已保存 {item.message_count} {item.extraction?.conversation_kind==="not_chat"?"段来源":"条消息"} · {new Date(item.created_at).toLocaleDateString("zh-CN")}</p>}
          {item.source&&<div className={styles.sourceBar}><span>{item.source.kind.includes("text")?"网页文字":item.source.kind==="screen"?"屏幕截取":"截图"}</span><span>{item.source.title}</span>{/^https?:\/\//.test(item.source.url)&&<a href={item.source.url} target="_blank" rel="noreferrer">打开来源 ↗</a>}<span>{item.source.time_basis==="imported_at"?"导入时间":"截取时间"} · {new Date(item.source_captured_at??item.created_at).toLocaleString("zh-CN")}</span></div>}
          {item.source_text&&<details className={styles.sourceText}><summary>查看提交的原文</summary><pre>{item.source_text}</pre></details>}
          {(item.summary||failureCopy(item))&&<p className={styles.summary}>{["failed","partial"].includes(item.status)?failureCopy(item)??item.summary:item.summary}</p>}
          {item.status==="running"&&<div className={styles.progress}><span className={styles.pulse}/><span>{tools[item.events.at(-1)?.tool??""]??"正在提取来源并查找人物"}</span><button onClick={()=>void request<Task>(`tasks/${item.task_id}/cancel`,{expected_revision:item.revision}).then(setTask).catch(e=>setError(e.message))}>停止</button></div>}
          {item.summary&&<ProductFeedback key={item.task_id} taskID={item.task_id}/>}
          {item.contact_draft&&<ContactProfileReview key={item.task_id} task={item} busy={busy} onConfirm={review=>confirmProfile(item,review)}/>}
          {item.reviewed_profile&&<ReviewedContactProfile profile={item.reviewed_profile}/>}
          {item.question&&!item.contact_draft&&<div className={styles.question}><h3>{item.question}</h3>{item.candidates.map(candidate=><button key={`${candidate.person_id}:${candidate.relationship_context_id}`} onClick={()=>void resume(item,candidate)} disabled={busy}>{candidate.display_name} · {candidate.relationship_label}</button>)}{item.extraction&&<><label className={styles.label}>或指定本次归档的联系人姓名<input value={name} onChange={e=>setName(e.target.value)} maxLength={200}/></label><button onClick={()=>void resume(item)} disabled={busy||(!name.trim()&&!attachments.length)}>确认并继续</button></>}</div>}
          {["failed","partial","cancelled"].includes(item.status)&&!item.limitations.includes("CONTACT_SOURCE_DELETION_PENDING")&&<button onClick={()=>void resume(item)} disabled={busy}>继续这个任务</button>}
          {item.status!=="deleted"&&<div className={styles.deleteSource}>{deleteID===item.task_id?<><p>删除本次来源、原图及衍生分析。若人物已无其他来源，也会移除该人物及关系记录。</p><button onClick={()=>void removeSource(item)} disabled={busy}>确认删除来源</button><button onClick={()=>setDeleteID(null)} disabled={busy}>保留</button></>:<button className={styles.textButton} onClick={()=>setDeleteID(item.task_id)}>删除这次采集</button>}</div>}
          {item.findings.length>0&&<div className={styles.section}><h3>这次来源留下了什么</h3>{item.findings.map((finding,i)=><article className={styles.finding} key={i}><p>{finding.text}</p><blockquote>{finding.source_excerpt}</blockquote><small>{finding.epistemic_status==="inference"?"分析判断":"来源陈述"} · {finding.message_refs.join("、")}</small></article>)}</div>}
          {item.profile_fields.length>0&&<div className={styles.section}><h3>有来源的职业资料</h3><dl className={styles.profile}>{item.profile_fields.map((field,i)=><div key={i}><dt>{fields[field.field]}</dt><dd>{field.value}<details><summary>{field.epistemic_status==="inference"?"查看推断依据":"查看原文"}</summary><blockquote>{field.source_excerpt}</blockquote>{field.source_refs.map(ref=>{const source=item.public_sources.find(s=>s.source_id===ref);return source?<a key={ref} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>:<small key={ref}>{ref.startsWith("clue")?"截图线索":"聊天消息"} {ref}</small>;})}</details></dd></div>)}</dl></div>}
          {!!item.source_images?.length&&<details className={styles.section}><summary>原始图片 · {item.source_images.length}</summary><div className={styles.sourceImages}>{item.source_images.map(source=><a key={source.image_index} href={`/api/contact-agent/tasks/${item.task_id}/images/${source.image_index}`} target="_blank" rel="noreferrer">查看图片 {source.image_index+1}</a>)}</div></details>}
          {item.extraction&&<details className={styles.section}><summary>提取内容（未确认） · {item.extraction.messages.length} 条</summary><ol className={styles.messages}>{item.extraction.messages.map(message=><li key={message.message_id}><small>{item.source_images?.[message.source_image_index??-1]&&<><a href={`/api/contact-agent/tasks/${item.task_id}/images/${message.source_image_index}`} target="_blank" rel="noreferrer">图片 {(message.source_image_index??0)+1}</a> · </>}{message.message_id} · {message.speaker_side==="left"?"画面左侧":message.speaker_side==="right"?"画面右侧":"说话人未确定"}{message.time_text?` · ${message.time_text}`:""}</small><p>{message.text}</p></li>)}</ol></details>}
          {item.public_sources.length>0&&<details className={styles.section}><summary>检索过的公开来源 · {item.public_sources.length}</summary>{item.public_sources.map(source=><p key={source.source_id}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a><small className={styles.sourceMeta}>{source.channel} · {source.stage==="fetched"?"已读取正文":"待核对匹配"} · {new Date(source.retrieved_at).toLocaleDateString("zh-CN")}</small></p>)}</details>}
          {item.limitations.length>0&&<details className={styles.section}><summary>仍需注意与核对</summary><ul>{item.limitations.map((line,i)=><li key={i}>{line}</li>)}</ul></details>}
          <details className={styles.section}><summary>查看实际处理记录</summary><ol>{item.events.map(event=><li key={event.sequence}>{tools[event.tool]??event.tool} · {event.status==="completed"?"完成":event.status==="denied"?"请求未获执行":"未完成"}</li>)}</ol></details>
        </section>)}
      </div>
    </main>
    {archiveOpen&&<div className={styles.modalBackdrop}><section role="dialog" aria-modal="true" aria-labelledby="archive-title" className={styles.card}><h2 id="archive-title">归档 {personName}？</h2><p>联系人将从当前工作区隐藏，正在进行的整理会停止。资料仍按原保留期限保存，你可以撤销归档。</p><button onClick={()=>setArchiveOpen(false)}>取消</button><button className={styles.primary} disabled={busy} onClick={()=>void archive()}>归档这个联系人</button></section></div>}
  </div>;
}
