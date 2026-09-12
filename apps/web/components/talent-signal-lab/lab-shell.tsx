"use client";

import { workspaceSessionFetch } from "@/components/workspace-session-request";

import type {
  LabComparison,
  LabEvalCase,
  LabManifestResponse,
  LabRun,
  LabSession,
  RealityReceipt,
} from "@talent-signal/contracts";
import { Flask, LockKey, MagnifyingGlass } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { LabContext, useTalentSignalLab } from "./lab-context";
import type { LabContextValue } from "./lab-context";
export { useTalentSignalLab } from "./lab-context";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import styles from "./talent-signal-lab.module.css";

// Dialog code is fetched only when opened. The provider stays mounted across navigation.
// https://nextjs.org/docs/app/guides/lazy-loading#nextdynamic
const LabPanel = dynamic(() => import("./lab-dialogs").then((module) => module.LabPanel));
const SignalLens = dynamic(() => import("./lab-dialogs").then((module) => module.SignalLens));

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
  const response = await workspaceSessionFetch(path, {
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
    void workspaceSessionFetch("/api/lab", {
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
          {panelOpen ? <LabPanel open={panelOpen} setOpen={setPanelOpen} /> : null}
          {lensOpen ? <SignalLens open={lensOpen} setOpen={setLensOpen} /> : null}
        </>
      ) : null}
    </LabContext.Provider>
  );
}
