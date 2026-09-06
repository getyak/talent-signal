"use client";

import type {
  LabFailureCategory,
  LabJob,
  LabJobAttempt,
  LabJobCatalog,
  LabJobReview,
  LabJobTask,
  LabPromptPreset,
  LabRegression,
  LabRegressionList,
  LabRegressionSummary,
} from "@talent-signal/contracts";
import {
  ArrowClockwise,
  ArrowRight,
  CheckCircle,
  Flask,
  GitDiff,
  PauseCircle,
  ShieldCheck,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

import {
  activeLabJobStatuses,
  attemptRunLabel,
  compareJobCases,
  isTerminalLabJob,
  jobProgress,
  regressionEligibleAttempts,
  releaseEvidence,
} from "@/lib/labBatchReview";

import styles from "./talent-signal-lab.module.css";

type Configuration = { model: string; prompt_preset: LabPromptPreset };
type MutationState =
  | "start"
  | "cancel"
  | "review"
  | "regression"
  | "rerun"
  | null;

const promptLabels: Record<LabPromptPreset, string> = {
  baseline: "当前基线",
  concise: "简洁回答",
  evidence_first: "证据优先",
};
const taskLabels: Record<LabJobTask, string> = {
  relationship_text: "关系证据回答",
  relationship_image: "图片理解",
  unscoped_chat: "Workspace Agent",
};
const statusLabels: Record<LabJob["status"], string> = {
  queued: "等待执行",
  running: "正在执行",
  cancelling: "正在停止",
  cancelled: "已停止",
  completed: "已完成",
  partial: "部分完成",
  failed: "失败",
  unknown: "结果未知",
};
const categoryLabels: Record<LabFailureCategory, string> = {
  unsupported_claim: "无依据断言",
  wrong_identity: "身份错误",
  missed_uncertainty: "遗漏不确定性",
  stale_evidence: "使用过期证据",
  unsafe_action: "越权动作",
  bad_structure: "结构错误",
  provider_failure: "模型服务失败",
  latency: "耗时问题",
  other: "其他",
};
const reviewLabels: Record<Exclude<LabJob["review"], "unreviewed">, string> = {
  a: "配置 A 更好",
  b: "配置 B 更好",
  tie: "表现相当",
  inconclusive: "证据不足",
};

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

async function requestJSON<T>(
  path: string,
  options: RequestInit,
  fallback: string,
): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...options });
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || !payload) throw new Error(responseMessage(payload, fallback));
  return payload;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function AttemptColumn({
  attempt,
  label,
}: {
  attempt: LabJobAttempt;
  label: string;
}) {
  const failedChecks = attempt.checks.filter((check) => check.verdict === "fail");
  return (
    <article className={styles.batchAttempt} data-state={attempt.status}>
      <header>
        <div>
          <span>{label} · {attemptRunLabel(attempt)}</span>
          <strong>{attempt.actual_model ?? attempt.requested_model}</strong>
        </div>
        <span>{attempt.status === "completed" ? "已返回" : attempt.status === "unknown" ? "未知" : attempt.status === "failed" ? "失败" : "等待"}</span>
      </header>
      {attempt.title ? <h4>{attempt.title}</h4> : null}
      {attempt.answer ? <p>{attempt.answer}</p> : (
        <p className={styles.batchMuted}>{attempt.error_code ?? "尚无模型输出"}</p>
      )}
      <dl>
        <div><dt>耗时</dt><dd>{attempt.duration_ms === null ? "未知" : `${attempt.duration_ms} ms`}</dd></div>
        <div><dt>Prompt</dt><dd>{attempt.actual_prompt_revision ?? attempt.prompt_revision}</dd></div>
        <div><dt>用量</dt><dd>{attempt.input_tokens === null || attempt.output_tokens === null ? "未知" : `${attempt.input_tokens} / ${attempt.output_tokens}`}</dd></div>
      </dl>
      <div className={styles.batchChecks}>
        {attempt.checks.length === 0 ? <span data-verdict="unknown">没有可判定的硬检查</span> : attempt.checks.map((check) => (
          <span data-verdict={check.verdict} key={check.id}>
            {check.verdict === "pass" ? "通过" : check.verdict === "fail" ? "失败" : check.verdict === "skipped" ? "跳过" : "未知"} · {check.summary}
          </span>
        ))}
      </div>
      {failedChecks.length > 0 ? (
        <strong className={styles.batchHardFailure}>
          <WarningCircle aria-hidden="true" size={16} /> {failedChecks.length} 个硬性失败，不能被平均分抵消
        </strong>
      ) : null}
    </article>
  );
}

function ConfigEditor({
  catalog,
  label,
  value,
  onChange,
}: {
  catalog: LabJobCatalog;
  label: string;
  value: Configuration;
  onChange: (value: Configuration) => void;
}) {
  const model = catalog.models.find((item) => item.id === value.model);
  return (
    <fieldset className={styles.batchConfig}>
      <legend>{label}</legend>
      <label>
        <span>模型</span>
        <select
          aria-label={`${label}模型`}
          onChange={(event) => {
            const next = catalog.models.find((item) => item.id === event.target.value);
            if (next?.prompt_presets[0]) {
              onChange({ model: next.id, prompt_preset: next.prompt_presets[0] });
            }
          }}
          value={value.model}
        >
          {catalog.models.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
        </select>
      </label>
      <label>
        <span>提示词预设</span>
        <select
          aria-label={`${label}提示词预设`}
          onChange={(event) => onChange({ ...value, prompt_preset: event.target.value as LabPromptPreset })}
          value={value.prompt_preset}
        >
          {(model?.prompt_presets ?? []).map((preset) => <option key={preset} value={preset}>{promptLabels[preset]}</option>)}
        </select>
      </label>
    </fieldset>
  );
}

export function LabBatchWorkspace() {
  const [catalog, setCatalog] = useState<LabJobCatalog | null>(null);
  const [task, setTask] = useState<LabJobTask>("relationship_text");
  const [regressions, setRegressions] = useState<LabRegressionSummary[]>([]);
  const [selectedCases, setSelectedCases] = useState<string[]>([]);
  const [configA, setConfigA] = useState<Configuration | null>(null);
  const [configB, setConfigB] = useState<Configuration | null>(null);
  const [repetitions, setRepetitions] = useState(1);
  const [job, setJob] = useState<LabJob | null>(null);
  const [regression, setRegression] = useState<LabRegression | null>(null);
  const [review, setReview] = useState<LabJobReview["review"]>("inconclusive");
  const [categories, setCategories] = useState<LabFailureCategory[]>([]);
  const [regressionAttempt, setRegressionAttempt] = useState<LabJobAttempt | null>(null);
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [pending, setPending] = useState<MutationState>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadIndex = useCallback(async (isCancelled: () => boolean = () => false) => {
    try {
      const [jobPayload, regressionPayload] = await Promise.all([
        requestJSON<LabJobCatalog>("/api/lab/experiment-jobs", {}, "批量实验目录当前不可用。"),
        requestJSON<LabRegressionList>("/api/lab/regressions", {}, "回归案例当前不可用。"),
      ]);
      if (isCancelled()) return;
      setError(null);
      setCatalog(jobPayload);
      setRegressions(regressionPayload.regressions);
      setSelectedCases((current) => current.length > 0
        ? current
        : jobPayload.cases.slice(0, 3).map((sample) => sample.id));
      const first = jobPayload.models[0];
      const second = jobPayload.models[1] ?? first;
      if (first?.prompt_presets[0]) {
        setConfigA((current) => current ?? { model: first.id, prompt_preset: first.prompt_presets[0] });
      }
      if (second) {
        const preset = second.prompt_presets.find((item) => item !== first?.prompt_presets[0]) ?? second.prompt_presets[0];
        if (preset) setConfigB((current) => current ?? { model: second.id, prompt_preset: preset });
      }
    } catch (caught) {
      if (isCancelled()) return;
      setError(caught instanceof Error ? caught.message : "批量实验当前不可用。");
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (!cancelled) await loadIndex(() => cancelled);
    })();
    return () => { cancelled = true; };
  }, [loadIndex]);

  const loadJob = useCallback(async (id: string) => {
    try {
      const payload = await requestJSON<{ job: LabJob }>(`/api/lab/experiment-jobs/${id}`, {}, "实验结果当前不可读取。");
      setJob(payload.job);
      setReview(payload.job.review === "unreviewed" ? "inconclusive" : payload.job.review);
      setCategories(payload.job.failure_categories);
      setError(null);
      return payload.job;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "实验结果当前不可读取。");
      return null;
    }
  }, []);

  const loadRegression = useCallback(async (id: string) => {
    try {
      const payload = await requestJSON<{ regression: LabRegression }>(`/api/lab/regressions/${id}`, {}, "回归案例当前不可读取。");
      setRegression(payload.regression);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "回归案例当前不可读取。");
    }
  }, []);

  useEffect(() => {
    if (!job || !activeLabJobStatuses.has(job.status)) return;
    const timer = window.setInterval(() => {
      void loadJob(job.id).then((next) => {
        if (next && isTerminalLabJob(next.status)) {
          void loadIndex();
          if (regression) void loadRegression(regression.id);
        }
      });
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [job, loadIndex, loadJob, loadRegression, regression]);

  const plannedCalls = selectedCases.length * 2 * repetitions;
  const progress = job ? jobProgress(job) : null;
  const caseComparisons = job ? compareJobCases(job) : [];
  const eligibleAttempts = job ? regressionEligibleAttempts(job) : [];

  async function startJob(request?: {
    task?: LabJobTask;
    caseIds: string[];
    configurations: [Configuration, Configuration];
    regressionSource?: { id: string; content_hash: string };
  }) {
    if (!catalog || pending || (!request && (!configA || !configB || selectedCases.length === 0))) return;
    const caseIds = request?.caseIds ?? selectedCases;
    const selectedTask = request?.task ?? task;
    const configurations: [Configuration, Configuration] = request?.configurations ?? [configA!, configB!];
    const repeatCount = request ? 1 : repetitions;
    setPending(request ? "rerun" : "start");
    setError(null);
    try {
      const payload = await requestJSON<{ job: LabJob }>(
        "/api/lab/experiment-jobs",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            catalog_revision: catalog.catalog_revision,
            task: selectedTask,
            id: crypto.randomUUID(),
            case_ids: caseIds,
            configurations,
            repetitions: repeatCount,
            call_limit: caseIds.length * 2 * repeatCount,
            ...(request?.regressionSource ? { regression_source: request.regressionSource } : {}),
          }),
        },
        "批量实验未能创建。",
      );
      setJob(payload.job);
      setRegressionAttempt(null);
      await loadIndex();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "批量实验未能创建。");
    } finally {
      setPending(null);
    }
  }

  async function cancelJob() {
    if (!job || pending) return;
    setPending("cancel"); setError(null);
    try {
      const payload = await requestJSON<{ job: LabJob }>(
        `/api/lab/experiment-jobs/${job.id}/cancel`,
        { method: "POST" },
        "停止请求未能保存。",
      );
      setJob(payload.job);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "停止请求未能保存。");
    } finally { setPending(null); }
  }

  async function saveReview() {
    if (!job || pending || !isTerminalLabJob(job.status)) return;
    setPending("review"); setError(null);
    try {
      const payload = await requestJSON<{ job: LabJob }>(
        `/api/lab/experiment-jobs/${job.id}/review`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ review, failure_categories: categories }),
        },
        "人工比较结论未能保存。",
      );
      setJob(payload.job);
      await loadIndex();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "人工比较结论未能保存。");
    } finally { setPending(null); }
  }

  function beginRegression(attempt: LabJobAttempt) {
    if (!job) return;
    const sample = job.definition.cases.find((item) => item.id === attempt.case_id);
    setRegressionAttempt(attempt);
    setExpectedBehavior(sample?.expected ?? "");
    setReviewNote("");
  }

  async function saveRegression() {
    if (!job || !regressionAttempt || categories.length === 0 || pending) return;
    setPending("regression"); setError(null);
    try {
      const payload = await requestJSON<{ regression: LabRegression }>(
        "/api/lab/regressions",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: crypto.randomUUID(),
            source_job_id: job.id,
            source_attempt_id: regressionAttempt.id,
            source_definition_hash: job.definition_hash,
            failure_categories: categories,
            expected_behavior: expectedBehavior,
            review_note: reviewNote,
          }),
        },
        "失败案例未能保存为回归证据。",
      );
      setRegression(payload.regression);
      setRegressionAttempt(null);
      await loadIndex();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "失败案例未能保存为回归证据。");
    } finally { setPending(null); }
  }

  async function rerunRegression() {
    if (!regression) return;
    const configurations = regression.snapshot.configurations.map(({ model, prompt_preset }) => ({ model, prompt_preset })) as [Configuration, Configuration];
    await startJob({
      task: regression.snapshot.task ?? regression.snapshot.case.task ?? "relationship_text",
      caseIds: [regression.snapshot.case.id],
      configurations,
      regressionSource: { id: regression.id, content_hash: regression.content_hash },
    });
  }

  function toggleCategory(category: LabFailureCategory) {
    setCategories((current) => current.includes(category) ? current.filter((item) => item !== category) : [...current, category]);
  }

  if (loading) {
    return (
      <section className={styles.batchUnavailable} aria-live="polite">
        <SpinnerGap aria-hidden="true" className={styles.spin} size={24} />
        <div><strong>正在读取批量实验与回归证据</strong><p>不会在加载时启动模型调用。</p></div>
      </section>
    );
  }

  if (!catalog || !catalog.enabled || catalog.models.length === 0) {
    return (
      <section className={styles.batchUnavailable}>
        <Flask aria-hidden="true" size={24} />
        <div><strong>批量真实模型实验未配置</strong><p>{error ?? "本地确定性场景仍可使用；配置批准模型后才会开放调用。"}</p></div>
        <button onClick={() => void loadIndex()} type="button">重新检查</button>
      </section>
    );
  }

  const taskCases = catalog.cases.filter((sample) => (sample.task ?? "relationship_text") === task);
  const taskModels = catalog.models.filter((model) => (model.task ?? "relationship_text") === task);
  const taskCatalog = { ...catalog, cases: taskCases, models: taskModels };

  return (
    <section aria-labelledby="batch-lab-title" className={styles.batchWorkspace}>
      <header className={styles.batchHeader}>
        <div>
          <p className={styles.eyebrow}>真实模型 · 冻结案例 · 可恢复</p>
          <h2 id="batch-lab-title">批量比较与回归审阅</h2>
          <p>同一批合成案例运行 A/B 配置。硬性失败、未知结果和人工判断保持独立。</p>
        </div>
        <div className={styles.batchBoundary}>
          <ShieldCheck aria-hidden="true" size={20} />
          <span><strong>0 次业务写入</strong><small>模型调用上限 {catalog.daily_call_limit - catalog.daily_calls_reserved} 次可用 · 费用未知</small></span>
        </div>
      </header>

      <div className={styles.batchCreateGrid}>
        <div className={styles.batchCasePicker}>
          <header><strong>1 · 产品路径与冻结案例</strong><span>{selectedCases.length} 个独立案例</span></header>
          <label>
            <span><strong>被测产品路径</strong><small>图片与 Agent 使用各自真实适配器</small></span>
            <select aria-label="被测产品路径" onChange={(event) => {
              const next = event.target.value as LabJobTask;
              const nextCases = catalog.cases.filter((sample) => (sample.task ?? "relationship_text") === next);
              const nextModels = catalog.models.filter((model) => (model.task ?? "relationship_text") === next);
              setTask(next); setSelectedCases(nextCases.slice(0, 3).map((sample) => sample.id));
              const first = nextModels[0], second = nextModels[1] ?? first;
              if (first?.prompt_presets[0]) setConfigA({ model: first.id, prompt_preset: first.prompt_presets[0] });
              if (second?.prompt_presets[0]) setConfigB({ model: second.id, prompt_preset: second.prompt_presets[0] });
            }} value={task}>
              {(Object.keys(taskLabels) as LabJobTask[]).filter((candidate) =>
                catalog.cases.some((sample) => (sample.task ?? "relationship_text") === candidate)
                  && catalog.models.some((model) => (model.task ?? "relationship_text") === candidate))
                .map((candidate) => <option key={candidate} value={candidate}>{taskLabels[candidate]}</option>)}
            </select>
          </label>
          {taskCases.map((sample) => (
            <label data-selected={selectedCases.includes(sample.id)} key={sample.id}>
              <input
                checked={selectedCases.includes(sample.id)}
                onChange={() => setSelectedCases((current) => current.includes(sample.id) ? current.filter((id) => id !== sample.id) : [...current, sample.id])}
                type="checkbox"
              />
              <span><strong>{sample.title}</strong><small>{sample.partition === "held_out" ? "独立保留集" : "开发集"} · {sample.revision}</small></span>
            </label>
          ))}
        </div>
        <div className={styles.batchSetup}>
          <header><strong>2 · 只改要比较的变量</strong><span>目录 {catalog.catalog_revision.slice(0, 10)}</span></header>
          <div className={styles.batchConfigPair}>
            {configA ? <ConfigEditor catalog={taskCatalog} label="配置 A" onChange={setConfigA} value={configA} /> : null}
            {configB ? <ConfigEditor catalog={taskCatalog} label="配置 B" onChange={setConfigB} value={configB} /> : null}
          </div>
          <label className={styles.batchRepeat}>
            <span>每个配置重复次数</span>
            <select onChange={(event) => setRepetitions(Number(event.target.value))} value={repetitions}>
              <option value={1}>1 次</option><option value={2}>2 次</option><option value={3}>3 次</option>
            </select>
          </label>
          <div className={styles.batchBudget}>
            <span>案例 {selectedCases.length}</span><ArrowRight aria-hidden="true" size={15} /><span>配置 2</span><ArrowRight aria-hidden="true" size={15} /><span>最多 {plannedCalls} 次调用</span>
          </div>
          <button
            className={styles.primaryButton}
            disabled={pending !== null || plannedCalls < 2 || plannedCalls > 120 || plannedCalls > catalog.daily_call_limit - catalog.daily_calls_reserved}
            onClick={() => void startJob()}
            type="button"
          >
            {pending === "start" ? <SpinnerGap aria-hidden="true" className={styles.spin} size={17} /> : <Flask aria-hidden="true" size={17} />}
            审阅后开始批量比较
          </button>
        </div>
      </div>

      <div className={styles.batchHistory}>
        <header><strong>最近批次</strong><button onClick={() => void loadIndex()} type="button"><ArrowClockwise aria-hidden="true" size={15} />刷新</button></header>
        {catalog.jobs.length === 0 ? <p>还没有批量运行。</p> : catalog.jobs.map((item) => (
          <button aria-current={job?.id === item.id ? "true" : undefined} key={item.id} onClick={() => void loadJob(item.id)} type="button">
            <span data-state={item.status}>{statusLabels[item.status]}</span>
            <strong>{item.models.join(" ↔ ")}</strong>
            <small>{taskLabels[item.task ?? "relationship_text"]} · {item.case_count} 案例 · {item.planned_calls} 计划调用 · {formatDate(item.created_at)}</small>
          </button>
        ))}
      </div>

      {job && progress ? (
        <section aria-labelledby="batch-result-title" className={styles.batchResult}>
          <header>
            <div><p className={styles.eyebrow}>运行 {job.id.slice(0, 8)}</p><h3 id="batch-result-title">逐案例比较</h3></div>
            <span data-state={job.status}>{statusLabels[job.status]}</span>
          </header>
          <div className={styles.batchProgress}>
            <div><span>已发出</span><strong>{progress.issued}/{progress.planned}</strong></div>
            <div><span>完成</span><strong>{progress.completed}</strong></div>
            <div><span>硬性失败</span><strong>{progress.hardFailures}</strong></div>
            <div><span>失败 / 未知</span><strong>{progress.failed} / {progress.unknown}</strong></div>
            <div><span>定义指纹</span><code>{job.definition_hash.slice(0, 12)}</code></div>
          </div>
          {activeLabJobStatuses.has(job.status) ? (
            <div className={styles.batchRunning}>
              <SpinnerGap aria-hidden="true" className={styles.spin} size={18} />
              <span>服务端拥有运行；离开页面后可按同一 ID 恢复。</span>
              <button disabled={pending !== null} onClick={() => void cancelJob()} type="button"><PauseCircle aria-hidden="true" size={17} />停止未开始的调用</button>
            </div>
          ) : null}
          <div className={styles.batchCaseResults}>
            {caseComparisons.map((comparison) => (
              <details key={comparison.caseId} open={comparison.hardFailures > 0 || comparison.unknownOutcomes > 0}>
                <summary>
                  <span><strong>{comparison.title}</strong><small>{comparison.partition === "held_out" ? "独立保留集" : "开发集"} · {comparison.expected}</small></span>
                  <span>{comparison.hardFailures > 0 ? `${comparison.hardFailures} 硬性失败` : comparison.unknownOutcomes > 0 ? `${comparison.unknownOutcomes} 未知` : "等待人工比较"}</span>
                </summary>
                <div className={styles.batchAttemptPair}>
                  <div>{comparison.a.map((attempt) => <AttemptColumn attempt={attempt} key={attempt.id} label="A" />)}</div>
                  <div>{comparison.b.map((attempt) => <AttemptColumn attempt={attempt} key={attempt.id} label="B" />)}</div>
                </div>
              </details>
            ))}
          </div>

          {isTerminalLabJob(job.status) ? (
            <div className={styles.batchReview}>
              <div>
                <strong>3 · 人工判断</strong>
                <p>选择整体结论。硬性失败仍独立保留，不会因偏好选择而消失。</p>
              </div>
              <select aria-label="人工比较结论" onChange={(event) => setReview(event.target.value as LabJobReview["review"])} value={review}>
                {Object.entries(reviewLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <div className={styles.batchCategoryPicker}>
                {(Object.keys(categoryLabels) as LabFailureCategory[]).map((category) => (
                  <label key={category}><input checked={categories.includes(category)} onChange={() => toggleCategory(category)} type="checkbox" />{categoryLabels[category]}</label>
                ))}
              </div>
              <button className={styles.secondaryButton} disabled={pending !== null} onClick={() => void saveReview()} type="button">
                {pending === "review" ? <SpinnerGap aria-hidden="true" className={styles.spin} size={17} /> : <CheckCircle aria-hidden="true" size={17} />}保存人工结论
              </button>
            </div>
          ) : null}

          {eligibleAttempts.length > 0 ? (
            <div className={styles.batchRegressionCandidates}>
              <header><strong>4 · 从失败保存回归案例</strong><span>需要先选择至少一个错误类别</span></header>
              {eligibleAttempts.map((attempt) => (
                <button key={attempt.id} onClick={() => beginRegression(attempt)} type="button">
                  <WarningCircle aria-hidden="true" size={17} />
                  <span><strong>{job.definition.cases.find((item) => item.id === attempt.case_id)?.title}</strong><small>配置 {attempt.configuration_index === 0 ? "A" : "B"} · {attempt.error_code ?? "硬检查失败"}</small></span>
                  <ArrowRight aria-hidden="true" size={16} />
                </button>
              ))}
            </div>
          ) : null}

          {regressionAttempt ? (
            <div className={styles.batchRegressionForm}>
              <label><span>必须保护的行为</span><textarea maxLength={2000} onChange={(event) => setExpectedBehavior(event.target.value)} value={expectedBehavior} /></label>
              <label><span>审阅备注（仅合成案例）</span><textarea maxLength={2000} onChange={(event) => setReviewNote(event.target.value)} value={reviewNote} /></label>
              <p>保存会冻结案例、配置、失败执行和审阅身份；不会获得执行产品动作的权限。</p>
              <div><button className={styles.secondaryButton} onClick={() => setRegressionAttempt(null)} type="button">取消</button><button className={styles.primaryButton} disabled={pending !== null || categories.length === 0 || !expectedBehavior.trim()} onClick={() => void saveRegression()} type="button">保存不可变回归案例</button></div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="regression-library-title" className={styles.batchRegressionLibrary}>
        <header><div><p className={styles.eyebrow}>Saved ≠ enforced</p><h3 id="regression-library-title">回归证据库</h3></div><span>{regressions.length} 条</span></header>
        {regressions.length === 0 ? <p>失败保存后会出现在这里；没有记录不表示没有回归风险。</p> : (
          <div className={styles.batchRegressionList}>{regressions.map((item) => (
            <button aria-current={regression?.id === item.id ? "true" : undefined} key={item.id} onClick={() => void loadRegression(item.id)} type="button">
              <span data-release={item.release_check}>{item.release_check === "ci_verified" ? "CI 已验证" : item.release_check === "ci_needs_refresh" ? "需要重验" : "未接入 CI"}</span>
              <strong>{item.title}</strong>
              <small>{item.failure_categories.map((category) => categoryLabels[category]).join(" · ")}</small>
              <code>{item.content_hash.slice(0, 12)}</code>
            </button>
          ))}</div>
        )}
        {regression ? (() => {
          const release = releaseEvidence(regression);
          return (
            <article className={styles.batchRegressionDetail}>
              <header><div><span data-tone={release.tone}>{release.label}</span><h4>{regression.snapshot.case.title}</h4></div><code>{regression.content_hash}</code></header>
              <p>{release.detail}</p>
              <dl>
                <div><dt>期望行为</dt><dd>{regression.snapshot.expected_behavior}</dd></div>
                <div><dt>来源执行</dt><dd>{regression.snapshot.source_job_id.slice(0, 8)} · {regression.snapshot.source_attempt.status}</dd></div>
                <div><dt>冻结版本</dt><dd>{regression.snapshot.backend_revision ?? "未报告"} · {regression.snapshot.instrument_revision}</dd></div>
                <div><dt>重跑</dt><dd>{regression.reruns.length} 次</dd></div>
              </dl>
              <button className={styles.primaryButton} disabled={pending !== null} onClick={() => void rerunRegression()} type="button">
                {pending === "rerun" ? <SpinnerGap aria-hidden="true" className={styles.spin} size={17} /> : <GitDiff aria-hidden="true" size={17} />}用冻结案例重新比较
              </button>
            </article>
          );
        })() : null}
      </section>

      {error ? <p className={styles.batchError} role="alert">{error}</p> : null}
      <div aria-live="polite" className={styles.srOnly}>{pending ? `Lab 操作进行中：${pending}` : job ? `批量实验状态：${statusLabels[job.status]}` : ""}</div>
    </section>
  );
}
