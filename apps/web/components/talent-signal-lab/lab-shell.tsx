"use client";

import type {
  LabComparison,
  LabEvalCase,
  LabManifestResponse,
  LabRun,
  LabSession,
  RealityReceipt,
} from "@talent-signal/contracts";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowCounterClockwise,
  ArrowRight,
  Bug,
  CheckCircle,
  Flask,
  GitDiff,
  LockKey,
  MagnifyingGlass,
  Receipt,
  ShieldCheck,
  SpinnerGap,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  createContext,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import styles from "./talent-signal-lab.module.css";

type LabContextValue = {
  comparison: LabComparison | null;
  error: string | null;
  evalCase: LabEvalCase | null;
  manifest: LabManifestResponse | null;
  pending: string | null;
  receipt: RealityReceipt | null;
  run: LabRun | null;
  session: LabSession | null;
  compare: () => Promise<void>;
  openLens: () => void;
  openPanel: () => void;
  promote: () => Promise<void>;
  record: () => Promise<void>;
  replay: (variant?: "baseline" | "candidate") => Promise<void>;
  start: (scenarioId: string) => Promise<void>;
};

const LabContext = createContext<LabContextValue | null>(null);

export function useTalentSignalLab(): LabContextValue {
  const value = useContext(LabContext);
  if (!value) {
    throw new Error("Talent Signal Lab must be rendered inside its workspace shell.");
  }
  return value;
}

function responseMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return fallback;
}

async function post<T>(path: string, body: unknown, fallback: string): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || !payload) {
    throw new Error(responseMessage(payload, fallback));
  }
  return payload;
}

function versionLabel(session: LabSession | null): string {
  return session ? `Agent ${session.active_envelope.agent_version}` : "选择场景";
}

function LabPanel({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
}) {
  const { error, openLens, pending, record, run, session } = useTalentSignalLab();
  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog}>
          <header className={styles.dialogHeader}>
            <div>
              <p className={styles.eyebrow}>Talent Signal Lab</p>
              <Dialog.Title>当前测试世界</Dialog.Title>
              <Dialog.Description>
                先理解产品状态，再进入版本、Trace 与评测依据。
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="关闭 Lab" className={styles.closeButton}>
              <X aria-hidden="true" size={18} />
            </Dialog.Close>
          </header>

          <section className={styles.worldSummary}>
            {session ? (
              <>
                <div>
                  <span>环境</span>
                  <strong>{session.environment}</strong>
                </div>
                <div>
                  <span>测试身份</span>
                  <strong>{session.tester_identity}</strong>
                </div>
                <div>
                  <span>场景</span>
                  <strong>{session.scenario.title}</strong>
                </div>
                <div>
                  <span>隔离</span>
                  <strong><LockKey aria-hidden="true" size={15} /> 不接触生产数据</strong>
                </div>
              </>
            ) : (
              <p>还没有活动会话。先选择一个版本化场景。</p>
            )}
          </section>

          <nav aria-label="Lab 任务" className={styles.taskList}>
            <div className={styles.taskRow}>
              <ShieldCheck aria-hidden="true" size={22} />
              <span><strong>当前世界</strong><small>确认环境、身份、场景与隔离边界</small></span>
              <CheckCircle aria-hidden="true" size={18} weight="fill" />
            </div>
            <Dialog.Close asChild>
              <Link className={styles.taskRow} href="/workspace/lab">
                <ArrowCounterClockwise aria-hidden="true" size={22} />
                <span><strong>复现一个场景</strong><small>从冻结证据运行 baseline 或 candidate</small></span>
                <ArrowRight aria-hidden="true" size={18} />
              </Link>
            </Dialog.Close>
            <button className={styles.taskRow} disabled={!run} onClick={openLens} type="button">
              <MagnifyingGlass aria-hidden="true" size={22} />
              <span><strong>检查为什么</strong><small>{run ? "观察 → 解释 → 不确定性 → 依据" : "重放后可用"}</small></span>
              <ArrowRight aria-hidden="true" size={18} />
            </button>
            <button className={styles.taskRow} disabled={!run || pending !== null} onClick={() => void record()} type="button">
              <Receipt aria-hidden="true" size={22} />
              <span><strong>记录问题</strong><small>生成脱敏、可复现的 Reality Receipt</small></span>
              {pending === "receipt" ? <SpinnerGap aria-hidden="true" className={styles.spin} size={18} /> : <ArrowRight aria-hidden="true" size={18} />}
            </button>
          </nav>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <p className={styles.boundaryNote}>
            Lab 运行只能写入质量控制面；canonical relationship state 与外部系统始终为零写入。
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EvidenceStatus({ status }: { status: LabRun["output"]["evidence"][number]["status"] }) {
  const labels = {
    confirmed: "已确认",
    observation: "Observation",
    conflict: "冲突",
    unavailable: "不可用",
  } as const;
  return <span className={styles.evidenceStatus} data-status={status}>{labels[status]}</span>;
}

function SignalLens({ open, setOpen }: { open: boolean; setOpen: (value: boolean) => void }) {
  const { compare, pending, record, run } = useTalentSignalLab();
  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={`${styles.dialog} ${styles.lens}`}>
          <header className={styles.dialogHeader}>
            <div>
              <p className={styles.eyebrow}>Signal Lens</p>
              <Dialog.Title>{run?.output.headline ?? "还没有可检查的结果"}</Dialog.Title>
              <Dialog.Description>
                解释来自可检查的产品状态，不是隐藏思维链。
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="关闭 Signal Lens" className={styles.closeButton}>
              <X aria-hidden="true" size={18} />
            </Dialog.Close>
          </header>
          {run ? (
            <>
              <div className={styles.lensFlow}>
                <section>
                  <span>观察</span>
                  <p>{run.output.observation}</p>
                </section>
                <section className={styles.causalStep}>
                  <span>系统解释 · {run.output.lifecycle}</span>
                  <p>{run.output.interpretation}</p>
                </section>
                <section>
                  <span>不确定性</span>
                  <p>{run.output.uncertainty ?? "没有额外不确定性说明。"}</p>
                </section>
                {run.output.required_question ? (
                  <section>
                    <span>需要人的决定</span>
                    <p>{run.output.required_question}</p>
                  </section>
                ) : null}
              </div>
              <div className={styles.evidenceReceipt}>
                <header>
                  <span>证据状态</span>
                  <strong>
                    {run.output.evidence_summary.confirmed} 已确认 · {run.output.evidence_summary.observations} Observation · {run.output.evidence_summary.conflicts} 冲突 · {run.output.evidence_summary.unavailable} 不可用
                  </strong>
                </header>
                <div className={styles.evidenceList}>
                  {run.output.evidence.map((item) => (
                    <article key={item.id}>
                      <div><strong>{item.label}</strong><EvidenceStatus status={item.status} /></div>
                      <p>“{item.excerpt}”</p>
                      <small>{item.source_label} · {new Date(item.observed_at).toLocaleDateString("zh-CN")}</small>
                    </article>
                  ))}
                </div>
              </div>
              <dl className={styles.runtimeStrip}>
                <div><dt>运行版本</dt><dd>{run.envelope.web_build} · Backend {run.envelope.backend_revision} · Agent {run.envelope.agent_version} · Prompt {run.envelope.prompt_version}</dd></div>
                <div><dt>Evidence snapshot</dt><dd>{run.snapshot_hash.slice(0, 12)} · frozen</dd></div>
                <div><dt>Canonical state</dt><dd>r{run.canonical_revision_after} · isolated · 0 writes</dd></div>
              </dl>
              <footer className={styles.dialogActions}>
                <Dialog.Close asChild><Link className={styles.secondaryButton} href="/workspace/lab">重放这个场景</Link></Dialog.Close>
                <button className={styles.secondaryButton} disabled={pending !== null} onClick={() => void compare()} type="button"><GitDiff aria-hidden="true" size={17} /> 与基线比较</button>
                <button className={styles.primaryButton} disabled={pending !== null} onClick={() => void record()} type="button"><Bug aria-hidden="true" size={17} /> 记录问题</button>
              </footer>
            </>
          ) : (
            <p className={styles.empty}>先在 Lab 中重放一个场景，Signal Lens 才能绑定到确切运行回执。</p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function LabInspectable({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { openLens, run } = useTalentSignalLab();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelLongPress() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  function beginLongPress(event: ReactPointerEvent<HTMLElement>) {
    if (!run || (event.pointerType === "mouse" && event.button !== 0)) return;
    cancelLongPress();
    timer.current = setTimeout(openLens, 520);
  }

  return (
    <article
      aria-describedby={run ? "lab-inspectable-hint" : undefined}
      className={`${styles.inspectable} ${className}`}
      data-signal-lens={run ? "available" : "unavailable"}
      onKeyDown={(event) => {
        if (run && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          openLens();
        }
      }}
      onPointerCancel={cancelLongPress}
      onPointerDown={beginLongPress}
      onPointerLeave={cancelLongPress}
      onPointerUp={cancelLongPress}
      tabIndex={run ? 0 : undefined}
    >
      {children}
      {run ? <span className={styles.inspectHint} id="lab-inspectable-hint"><MagnifyingGlass aria-hidden="true" size={14} /> 长按或按 Enter 检查为什么</span> : null}
    </article>
  );
}

export function TalentSignalLabShell({
  children,
  initialManifest,
}: {
  children: ReactNode;
  initialManifest: LabManifestResponse | null;
}) {
  const [manifest, setManifest] = useState(initialManifest);
  const [session, setSession] = useState<LabSession | null>(initialManifest?.active_session ?? null);
  const [run, setRun] = useState<LabRun | null>(initialManifest?.latest_run ?? null);
  const [comparison, setComparison] = useState<LabComparison | null>(null);
  const [receipt, setReceipt] = useState<RealityReceipt | null>(null);
  const [evalCase, setEvalCase] = useState<LabEvalCase | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [lensOpen, setLensOpen] = useState(false);

  useEffect(() => {
    if (manifest) return;
    let cancelled = false;
    const controller = new AbortController();
    const timeoutID = window.setTimeout(() => controller.abort(), 6_000);
    void fetch("/api/lab", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | LabManifestResponse
          | { error?: { message?: string } }
          | null;
        if (!cancelled && response.ok && payload) {
          const nextManifest = payload as LabManifestResponse;
          setManifest(nextManifest);
          setSession(nextManifest.active_session);
          setRun(nextManifest.latest_run);
          setError(null);
        } else if (!cancelled) {
          const failure = payload as { error?: { message?: string } } | null;
          setError(
            failure?.error?.message ??
              "Lab 控制面当前不可用。没有创建测试状态。",
          );
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(
          caught instanceof DOMException && caught.name === "AbortError"
            ? "连接 Lab 控制面超时。没有创建测试状态。"
            : "Lab 控制面当前不可用。没有创建测试状态。",
        );
      })
      .finally(() => {
        window.clearTimeout(timeoutID);
      });
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutID);
    };
  }, [manifest]);

  async function perform(label: string, action: () => Promise<void>) {
    setPending(label);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Lab 操作未能完成。");
    } finally {
      setPending(null);
    }
  }

  async function start(scenarioId: string) {
    await perform("session", async () => {
      const payload = await post<{ session: LabSession }>(
        "/api/lab/sessions",
        { scenario_id: scenarioId, idempotency_key: crypto.randomUUID() },
        "无法创建隔离 Lab Session。",
      );
      setSession(payload.session);
      setRun(null);
      setComparison(null);
      setReceipt(null);
      setEvalCase(null);
      setManifest((current) => current ? { ...current, active_session: payload.session, latest_run: null } : current);
    });
  }

  async function replay(variant: "baseline" | "candidate" = "candidate") {
    if (!session) return;
    await perform("run", async () => {
      const payload = await post<{ run: LabRun }>(
        `/api/lab/sessions/${session.id}/runs`,
        { variant, idempotency_key: crypto.randomUUID() },
        "场景无法稳定重放。",
      );
      setRun(payload.run);
      setManifest((current) => current ? { ...current, latest_run: payload.run } : current);
      setReceipt(null);
      setEvalCase(null);
    });
  }

  async function compare() {
    if (!session) return;
    await perform("comparison", async () => {
      const payload = await post<{ comparison: LabComparison }>(
        `/api/lab/sessions/${session.id}/comparisons`,
        { idempotency_key: crypto.randomUUID() },
        "无法在同一快照上完成比较。",
      );
      setComparison(payload.comparison);
      setRun(payload.comparison.candidate_run);
      setManifest((current) => current ? { ...current, latest_run: payload.comparison.candidate_run } : current);
      setPanelOpen(false);
      setLensOpen(false);
    });
  }

  async function record() {
    if (!session || !run) return;
    await perform("receipt", async () => {
      const payload = await post<{ receipt: RealityReceipt }>(
        `/api/lab/sessions/${session.id}/receipts`,
        {
          run_id: run.id,
          idempotency_key: crypto.randomUUID(),
        },
        "Reality Receipt 未能保存。",
      );
      setReceipt(payload.receipt);
      setPanelOpen(false);
      setLensOpen(false);
    });
  }

  async function promote() {
    if (!receipt) return;
    await perform("promotion", async () => {
      const payload = await post<{ eval_case: LabEvalCase }>(
        `/api/lab/receipts/${receipt.id}/promotions`,
        {
          decision: "promote",
          idempotency_key: crypto.randomUUID(),
        },
        "Receipt 未能晋升为 Eval Case。",
      );
      setEvalCase(payload.eval_case);
      setReceipt((current) => current ? { ...current, status: "promoted" } : current);
      setManifest((current) => current ? { ...current, eval_cases: [payload.eval_case, ...current.eval_cases] } : current);
    });
  }

  const enabled = manifest?.capability.enabled === true;
  const context: LabContextValue = {
    comparison,
    error,
    evalCase,
    manifest,
    pending,
    receipt,
    run,
    session,
    compare,
    openLens: () => setLensOpen(true),
    openPanel: () => setPanelOpen(true),
    promote,
    record,
    replay,
    start,
  };

  return (
    <LabContext.Provider value={context}>
      {children}
      {enabled ? (
        <>
          <button
            aria-expanded={panelOpen}
            className={styles.capsule}
            data-active={session ? "true" : "false"}
            onClick={() => setPanelOpen(true)}
            title={session ? `${session.scenario.title} · ${session.workspace_ref}` : "选择一个隔离 Lab 场景"}
            type="button"
          >
            <Flask aria-hidden="true" size={15} weight="fill" />
            <span>LAB</span>
            <i aria-hidden="true" />
            <span>FAT</span>
            {session ? <><i aria-hidden="true" /><span>{session.tester_identity}</span></> : null}
            <i aria-hidden="true" />
            <span>{versionLabel(session)}</span>
            <LockKey aria-hidden="true" size={14} />
          </button>
          <LabPanel open={panelOpen} setOpen={setPanelOpen} />
          <SignalLens open={lensOpen} setOpen={setLensOpen} />
        </>
      ) : null}
    </LabContext.Provider>
  );
}
