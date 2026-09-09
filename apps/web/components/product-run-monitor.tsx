"use client";
import { workspaceSessionFetch } from "./workspace-session-request";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowClockwise, ArrowLeft, ArrowUpRight, ChatCircle, Check, Circle, Desktop, MagnifyingGlass, DeviceMobile, ThumbsDown, ThumbsUp } from "@phosphor-icons/react";
import type { ProductRunDetail, ProductRunList, ProductRunSummary } from "@talent-signal/contracts";
import { reasonLabels } from "./product-feedback";
import styles from "./product-run-monitor.module.css";
const states: Record<string, string> = { completed: "已完成", running: "运行中", failed: "失败", fallback: "已降级", interrupted: "已中断", waiting_for_user: "待确认", partial: "部分完成", cancelled: "已停止" };
const sentimentName = (value: string | null) => value === "helpful" ? "有帮助" : value === "unhelpful" ? "没帮上" : "未反馈";
const stamp = (value: string) => new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
async function request<T>(path: string): Promise<T> {
  const response = await workspaceSessionFetch(`/api/product-runs${path}`, { cache: "no-store" });
  const value = await response.json(); if (!response.ok) throw new Error(value.message ?? "运行记录暂时不可用。"); return value;
}
function DataPreview({ value }: { value: unknown }) {
  if (value == null) return <p className={styles.muted}>未记录</p>;
  if (typeof value === "string") return <p className={styles.prose}>{value}</p>;
  if (Array.isArray(value)) return <div className={styles.dataList}>{value.map((item, index) => <DataPreview key={index} value={item} />)}</div>;
  const data = object(value);
  if (data.type === "image_url" || data.type === "image") return <p className={styles.muted}>图片输入 · 原图见「上下文」</p>;
  if (data.role && data.content) return <section className={styles.message}><small>{String(data.role)}</small><DataPreview value={data.content} /></section>;
  if (typeof data.text === "string") return <p className={styles.prose}>{data.text}</p>;
  if (data.status && ["complete", "redacted", "truncated", "unavailable"].includes(String(data.status)))
    return data.value !== undefined ? <DataPreview value={data.value} /> : <p className={styles.muted}>{data.status === "truncated" ? "内容超过采集上限，未保留正文" : "内容未记录"}</p>;
  return <pre className={styles.json}>{JSON.stringify(value, (key, item) => key === "data_base64" || (typeof item === "string" && item.startsWith("data:image/")) ? "[image content]" : item, 2)}</pre>;
}
function Answer({ output }: { output: unknown }) {
  const data = object(output), blocks = Array.isArray(data.blocks) ? data.blocks : [];
  if (!blocks.length) return <DataPreview value={data.summary ?? output} />;
  return <div>{blocks.map((raw, index) => { const block = object(raw); return <section className={styles.answerBlock} key={String(block.id ?? index)}>
    <h3>{String(block.title ?? "回答")}</h3><p className={styles.prose}>{String(block.body ?? "")}</p>
  </section>; })}</div>;
}
function CaseCapture({ detail }: { detail: ProductRunDetail }) {
  const [expected, setExpected] = useState(detail.run.feedback.correction || "");
  const [state, setState] = useState(""), [busy, setBusy] = useState(false);
  const [savedCaseID, setSavedCaseID] = useState<string | null>(null);
  const operation = useRef<{ id: string; output_hash: string; expected_behavior: string } | null>(null);
  const supported = detail.spans.some(span => span.name === "relationship.answer" && span.status === "completed"
    && !((object(span.input.value).images as unknown[] | undefined)?.length));
  async function save() {
    setBusy(true);
    const body = operation.current ?? { id: crypto.randomUUID(), output_hash: detail.run.output_hash!, expected_behavior: expected };
    operation.current = body;
    try {
      const response = await workspaceSessionFetch(`/api/product-runs/${detail.run.id}/cases`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const value = await response.json(); if (!response.ok) throw new Error(value.message);
      setSavedCaseID(body.id); setState("saved");
    } catch (error) { setState((error as Error).message); }
    finally { setBusy(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ schema_version: "product-run-review.v1", ...detail }, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `product-run-${detail.run.id}.json`; anchor.click(); URL.revokeObjectURL(url);
  }
  return <details className={styles.caseCapture}><summary>把这次运行用于 Eval</summary>
    <p>保留原始问题、回答和反馈。填写可判断的预期行为，再用原始输入比较不同模型或提示词。</p>
    {supported ? state === "saved" ? <p role="status">已加入回归证据库。<Link href={`/workspace/lab?regression=${savedCaseID}`}>打开 Lab 比较版本 →</Link></p> : <>
      <label>怎样的回答才符合预期？<textarea maxLength={2000} value={expected} disabled={busy} onChange={event => { setExpected(event.target.value); operation.current = null; }} placeholder="例如：保留‘时间待确认’，先问清日期。" /></label>
      {state && <p role="alert">{state}</p>}<button disabled={busy || !expected.trim()} onClick={() => void save()}>{busy ? "正在保存…" : "加入回归证据库"}</button>
    </> : <p>这类任务的自动回放尚未接入；可以先导出完整运行用于分析与案例设计。</p>}
    <button onClick={download}>导出运行与反馈</button>
  </details>;
}
export function ProductRunMonitor() {
  const [list, setList] = useState<ProductRunList | null>(null), [detail, setDetail] = useState<ProductRunDetail | null>(null);
  const [selectedID, setSelectedID] = useState<string | null>(null), [tab, setTab] = useState("answer");
  const [sentiment, setSentiment] = useState(""), [platform, setPlatform] = useState(""), [status, setStatus] = useState(""), [query, setQuery] = useState("");
  const [error, setError] = useState(""), [detailError, setDetailError] = useState(""), [loading, setLoading] = useState(true), [updated, setUpdated] = useState<string | null>(null);
  const paginated = useRef(false);
  const generation = useRef(0), detailGeneration = useRef(0);
  const load = useCallback(async (cursor?: string) => {
    const ticket = ++generation.current; paginated.current = !!cursor;
    const params = new URLSearchParams(); if (sentiment) params.set("sentiment", sentiment); if (platform) params.set("platform", platform);
    if (status) params.set("status", status); if (query.trim()) params.set("q", query.trim()); if (cursor) params.set("cursor", cursor);
    try {
      const next = await request<ProductRunList>(`?${params}`); if (ticket !== generation.current) return;
      setList(current => cursor && current ? { ...next, runs: [...current.runs, ...next.runs] } : next);
      setUpdated(new Date().toISOString()); setError("");
    } catch (caught) { if (ticket === generation.current) setError((caught as Error).message); }
    finally { if (ticket === generation.current) setLoading(false); }
  }, [sentiment, platform, status, query]);
  const loadDetail = useCallback(async (id: string) => {
    const ticket = ++detailGeneration.current;
    try { const next = await request<ProductRunDetail>(`/${id}`); if (ticket === detailGeneration.current) { setDetail(next); setDetailError(""); } }
    catch (caught) { if (ticket === detailGeneration.current) setDetailError((caught as Error).message); }
  }, []);
  useEffect(() => {
    const requestGeneration = generation;
    const timer = setTimeout(() => void load(), 200);
    const interval = setInterval(() => { if (document.visibilityState === "visible" && !paginated.current) void load(); }, 10_000);
    return () => { clearTimeout(timer); clearInterval(interval); requestGeneration.current++; };
  }, [load]);
  useEffect(() => {
    const requestGeneration = detailGeneration;
    if (!selectedID) return;
    const initial = setTimeout(() => void loadDetail(selectedID), 0);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void loadDetail(selectedID); }, 10_000);
    return () => { clearTimeout(initial); clearInterval(timer); requestGeneration.current++; };
  }, [selectedID, loadDetail]);
  function select(run: ProductRunSummary) { setSelectedID(run.id); setDetail(null); setDetailError(""); setTab("answer"); }
  const current = detail?.run;
  return <main className={styles.page} id="main-content">
    <header className={styles.header}><div><p className={styles.eyebrow}>AGENT / QUALITY</p><h1>运行与反馈<span>每次回答，都有来处</span></h1><p>查看 Web 与 iOS 的真实运行，理解用户觉得有用的地方，以及下一次可以改善什么。</p></div>
      <Link href="/workspace/evals">实验与回归 <ArrowUpRight size={16} /></Link></header>
    <div className={styles.toolbar}><div className={styles.filters} aria-label="反馈筛选">{[["", "全部", "all"], ["helpful", "有帮助", "helpful"], ["unhelpful", "没帮上", "unhelpful"], ["unrated", "未反馈", "unrated"]].map(([value, label, key]) =>
      <button key={key} aria-pressed={sentiment === value} onClick={() => setSentiment(value!)}>{label}<span>{list?.counts[key as keyof ProductRunList["counts"]] ?? "—"}</span></button>)}</div>
      <div className={styles.refresh}><span role="status"><i data-error={!!error} />{error ? "连接中断" : updated ? `更新于 ${new Date(updated).toLocaleTimeString("zh-CN")}` : "正在连接"}</span><button aria-label="刷新运行" onClick={() => { void load(); if (selectedID) void loadDetail(selectedID); }}><ArrowClockwise size={18} /></button></div></div>
    <div className={styles.searchBar}><label><MagnifyingGlass size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索当时的问题" aria-label="搜索运行" /></label>
      <select value={platform} onChange={event => setPlatform(event.target.value)} aria-label="来源平台"><option value="">所有平台</option><option value="web">Web</option><option value="ios">iOS</option><option value="unknown">其他／未标识</option></select>
      <select value={status} onChange={event => setStatus(event.target.value)} aria-label="执行状态"><option value="interrupted">已中断</option><option value="waiting_for_user">待确认</option><option value="partial">部分完成</option><option value="cancelled">已停止</option><option value="">所有状态</option><option value="completed">已完成</option><option value="running">运行中</option><option value="failed">失败</option><option value="fallback">已降级</option></select>
      <span>未反馈表示尚无评价</span></div>
    {error && <div role="alert" className={styles.error}>{error} <button onClick={() => void load()}>重新连接</button>{list && <span>以下保留上次读取的结果</span>}</div>}
    <div className={styles.workspace} data-selected={!!selectedID}>
      <section className={styles.list} aria-label="运行列表"><div className={styles.listHeading}><span>最近运行</span><small>每 10 秒更新</small></div>
        {loading && !list ? <p className={styles.empty}>正在读取运行记录…</p> : !list?.runs.length ? <div className={styles.empty}><ChatCircle size={30} /><h2>{sentiment || query || platform || status ? "没有匹配的运行" : "等待第一条真实运行"}</h2><p>在 Web 或 iOS 发送一条消息，运行就会出现在这里。无需先点赞。</p></div> : list.runs.map(run => <button className={styles.run} aria-pressed={selectedID === run.id} key={run.id} onClick={() => select(run)}>
          <div className={styles.runMeta}>{run.platform === "ios" ? <DeviceMobile size={15} /> : <Desktop size={15} />}<span>{run.platform === "unknown" ? "未标识" : run.platform === "ios" ? "iOS" : "Web"}</span><time>{stamp(run.created_at)}</time></div>
          <strong>{run.objective || "截图与关系整理"}</strong><div className={styles.runFooter}><span className={styles.sentiment} data-value={run.feedback.sentiment ?? "unrated"}>{run.feedback.sentiment === "helpful" ? <ThumbsUp /> : run.feedback.sentiment === "unhelpful" ? <ThumbsDown /> : <Circle />}{sentimentName(run.feedback.sentiment)}</span><span>{states[run.status] ?? run.status}{run.duration_ms !== null ? ` · ${(run.duration_ms / 1000).toFixed(1)}s` : ""}</span></div>
        </button>)}
        {list?.next_cursor && <button className={styles.more} onClick={() => void load(list.next_cursor!)}>加载更多</button>}
      </section>
      <section className={styles.detail} aria-label="运行详情"><button className={styles.back} onClick={() => { setSelectedID(null); setDetail(null); }}><ArrowLeft size={16} /> 返回运行列表</button>
        {detailError ? <div className={styles.empty} role="alert">{detailError}<button onClick={() => selectedID && void loadDetail(selectedID)}>重试</button></div> : !detail ? <div className={styles.placeholder}><ChatCircle size={34} /><h2>{selectedID ? "正在读取这次运行…" : "从一次真实回答开始"}</h2><p>选择左侧运行，预览用户的问题、当时的回答与完整执行细节。</p><div><span><ThumbsUp /> 看懂为什么有用</span><span><ThumbsDown /> 定位哪里没帮上</span><span><Circle /> 发现未反馈的运行</span></div></div> : <>
          <header className={styles.detailHeader}><div><p>{current!.platform.toUpperCase()} <span>·</span> {stamp(current!.created_at)} <span>·</span> {states[current!.status] ?? current!.status}</p><h2>{current!.objective || "截图与关系整理"}</h2></div><span className={styles.sentiment} data-value={current!.feedback.sentiment ?? "unrated"}>{sentimentName(current!.feedback.sentiment)}</span></header>
          <nav className={styles.tabs} aria-label="详情内容">{[["answer", "回答预览"], ["feedback", `反馈${detail.history.length ? ` · ${detail.history.length}` : ""}`], ["context", "上下文"], ["trace", `执行链路 · ${detail.spans.length}`]].map(([value, label]) => <button key={value} aria-current={tab === value ? "page" : undefined} onClick={() => setTab(value!)}>{label}</button>)}</nav>
          <div className={styles.detailBody}>{!current!.content_available ? <p className={styles.empty}>原始内容已不可用，运行状态仍可核对。</p> : tab === "answer" ? <><div className={styles.userQuestion}><small>用户的问题</small><p>{current!.objective}</p></div><div className={styles.answer}><small>当时返回的回答</small><Answer output={detail.output} /></div><CaseCapture key={current!.id} detail={detail} /></> : tab === "feedback" ? <>
            {!detail.history.length ? <div className={styles.empty}><Circle size={24} /><h3>还没有反馈</h3><p>运行已记录；没有评价不会被计为满意或不满意。</p></div> : detail.history.map((event, index) => <article className={styles.feedbackEvent} key={event.id}><header><strong>{event.sentiment ? sentimentName(event.sentiment) : "已撤回评价"}</strong><small>v{event.revision} · {stamp(event.updated_at!)}{index === 0 && event.output_hash === current!.output_hash && event.revision === current!.feedback.revision && event.sentiment === current!.feedback.sentiment ? " · 当前" : " · 历史"}</small></header><div className={styles.reasonTags}>{event.reasons.map(reason => <span key={reason}>{reasonLabels[reason] ?? reason}</span>)}</div>{event.selected_text && <blockquote>{event.selected_text}</blockquote>}{event.comment && <p className={styles.prose}>{event.comment}</p>}<details><summary>反馈对应的答案版本</summary><Answer output={event.output} /></details>{event.correction && <div className={styles.correction}><small>用户希望怎样回答</small><p>{event.correction}</p></div>}</article>)}
            {!!detail.corrections.length && <details><summary>已关联的纠正与回归案例</summary><DataPreview value={detail.corrections} /></details>}
          </> : tab === "context" ? <><h3>原始输入</h3><DataPreview value={detail.input} />{current!.task_kind === "screenshot" && current!.task_id && <div className={styles.images}>{(Array.isArray(object(detail.output).source_images) ? object(detail.output).source_images as unknown[] : [{image_index:0}]).map((item,index) => { const imageIndex=Number(object(item).image_index ?? index);const src=`/api/contact-agent/tasks/${current!.task_id}/images/${imageIndex}`;return <a key={imageIndex} href={src} target="_blank" rel="noreferrer"><Image unoptimized src={src} width={220} height={320} alt={`原始截图 ${imageIndex+1}`} /><span>查看截图 {imageIndex+1} <ArrowUpRight size={14} /></span></a>; })}</div>}<h3>冻结的 Memory、来源与模型输入</h3>{detail.execution ? <DataPreview value={detail.execution} /> : <>{detail.spans.filter(span => span.kind === "context" || span.kind === "llm").map(span => <details key={span.id}><summary>{span.name} · {stamp(span.started_at)}</summary><DataPreview value={span.input} /></details>)}{!detail.spans.length && <p className={styles.muted}>这次运行没有记录模型上下文。请查看执行状态与原始输入。</p>}</>}<details><summary>版本与关联标识</summary><DataPreview value={{ run_id: current!.id, task_id: current!.task_id, session_id: current!.session_id, output_hash: current!.output_hash, attempts: current!.attempts, model: current!.model }} /></details></> : <>
            <div className={styles.traceSummary}><div><small>总耗时</small><strong>{current!.duration_ms === null ? "进行中" : `${(current!.duration_ms / 1000).toFixed(2)} s`}</strong></div><div><small>模型</small><strong>{current!.model ?? "未调用或未报告"}</strong></div><div><small>请求次数</small><strong>{current!.attempts}</strong></div></div>
            <ol className={styles.timeline}><li><Check size={15} /><div><strong>收到用户输入</strong><small>{stamp(current!.created_at)}</small></div></li>{detail.spans.map(span => <li key={span.id}><span className={styles.dot} data-failed={span.status === "failed"} /><details><summary><strong>{span.name}</strong><small>{span.status === "failed" ? "失败" : "完成"} · {Math.max(0, Date.parse(span.finished_at) - Date.parse(span.started_at))} ms</small></summary><h4>输入</h4><DataPreview value={span.input} /><h4>输出</h4><DataPreview value={span.output} />{span.error && <p className={styles.error}>{span.error}</p>}<details><summary>调用元数据</summary><DataPreview value={span.metadata} /></details></details></li>)}<li><Check size={15} /><div><strong>{states[current!.status] ?? current!.status}</strong><small>{stamp(current!.updated_at)}</small></div></li></ol>
          </>}</div>
        </>}
      </section>
    </div>
  </main>;
}
