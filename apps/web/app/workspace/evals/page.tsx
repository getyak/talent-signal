import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { EvalTraceCapture } from "@/components/eval-trace-capture";
import { EvalAgentLab } from "@/components/eval-agent-lab";
import { EvalTraceList } from "@/components/eval-trace-list";
import { LabEvalCases } from "@/components/talent-signal-lab/lab-eval-cases";
import { WorkspaceDisconnectedState } from "@/components/workspace-disconnected-state";
import styles from "@/components/eval-workbench.module.css";
import { loadLabManifest } from "@/lib/server/labBackend";
import { loadTelemetryTraces } from "@/lib/server/telemetryBackend";
import { loadEvalAgentLab } from "@/lib/server/pursuitBackend";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "评估追踪",
  description: "账号范围内的智能助理追踪、受治理制品与评估依据。",
  robots: { follow: false, index: false },
};

export default async function EvalWorkbenchPage() {
  if (!(await auth())?.user) redirect("/login?callbackUrl=%2Fworkspace%2Fevals");
  let traces: Awaited<ReturnType<typeof loadTelemetryTraces>>["traces"] = [];
  let lab: Awaited<ReturnType<typeof loadEvalAgentLab>> | null = null;
  let labCases: Awaited<ReturnType<typeof loadLabManifest>>["eval_cases"] = [];
  let error: string | null = null;
  try {
    const [traceResult, labResult] = await Promise.all([
      loadTelemetryTraces(),
      loadEvalAgentLab(),
    ]);
    traces = traceResult.traces;
    lab = labResult;
  } catch {
    error = "账号范围内的追踪存储不可用，未使用测试追踪替代。";
  }
  try {
    labCases = (await loadLabManifest()).eval_cases;
  } catch {
    // Eval traces remain usable when the isolated Lab control plane is off.
  }
  return (
    <main className={styles.page} id="main-content" tabIndex={-1}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>智能助理质量系统</p>
          <h1>评估追踪</h1>
          <p>
            跟踪一次交互如何经过界面、后端、模型、工具、验证与结果。内容保持受治理，遥测保持可检查。
          </p>
        </div>
        <span className={styles.health} data-state={error ? "offline" : "ready"}>
          {error ? "采集器不可用" : "采集器已连接"}
        </span>
      </header>
      {error ? (
        <>
          <div className={styles.offlinePanel}>
            <WorkspaceDisconnectedState
              description={error}
              hint="评测索引、Agent Lab 和实时采集都依赖同一个账号范围后端。恢复后端后返回此页即可继续；在此之前不要把表单失败误当成评测结果。"
              primaryHref="/workspace/boundaries"
              primaryLabel="打开冻结边界案例"
              secondaryHref="/demo"
              secondaryLabel="继续查看受控演示"
              title="当前无法写入或读取账号范围内的评测追踪。"
            />
          </div>
          <LabEvalCases cases={labCases} />
        </>
      ) : (
        <>
          {lab ? <EvalAgentLab provider={lab.provider} targets={[...lab.targets]} /> : null}
          <LabEvalCases cases={labCases} />
          <section className={styles.grid}>
            <EvalTraceCapture />
            <div className={styles.tracePanel}>
              <header className={styles.panelHeader}>
                <div>
                  <p className={styles.eyebrow}>账号追踪索引</p>
                  <h2>最近执行</h2>
                </div>
                <span>{traces.length} 条追踪</span>
              </header>
              {traces.length === 0 ? (
                <p className={styles.empty}>尚无追踪。请采集一次合成交互来验证管线。</p>
              ) : (
                <EvalTraceList traces={traces} />
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
