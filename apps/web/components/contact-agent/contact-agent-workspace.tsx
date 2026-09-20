"use client";

import {
  ArrowUpRight,
  Browser,
  FileImage,
  FileText,
  HandPointing,
  Images,
  Monitor,
  Plus,
  ShieldCheck,
  TextT,
  Tray,
  UsersThree,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type SyntheticEvent,
} from "react";
import type {
  ContactProfileConfirmation,
  ScreenshotContactTaskRequest,
  ScreenshotContactTaskResponse,
  TextContactTaskRequest,
} from "@talent-signal/agent";

import { ProductFeedback } from "@/components/product-feedback";
import { workspaceSessionFetch } from "@/components/workspace-session-request";

import {
  ACCEPTED_IMAGE_TYPES,
  AdmissionGuard,
  SelectionGate,
  dataTransferHasFileEntries,
  imageFilesFromClipboard,
  reuseOrCreateAttempt,
  targetsTextEntry,
  validateAttachmentBatch,
} from "./capture-intake";
import {
  ContactProfileReview,
  ReviewedContactProfile,
} from "./contact-profile-review";
import styles from "./contact-agent.module.css";

type Task = ScreenshotContactTaskResponse;
type Attachment = { id: string; file: File; url: string };
type Intelligence = {
  person_revision: number;
  tasks: Task[];
  archive?: { operation_id: string; display_name: string } | null;
};
type Recent = Pick<
  Task,
  "task_id" | "status" | "contact" | "summary" | "created_at" | "revision" | "source"
>;
type ComposerMode = "image" | "text";
type HistoryFilter = "all" | "attention";
type HistoryStatus = "loading" | "ready" | "error";
type CandidateSelection = { person_id: string; relationship_context_id: string };

const states: Record<string, string> = {
  running: "正在整理",
  waiting_for_user: "需要你确认",
  completed: "已整理",
  partial: "已保存，部分未完成",
  failed: "尚未完成",
  cancelled: "已停止",
  deleted: "来源已不可用",
};

const attentionStatuses = ["waiting_for_user", "failed", "partial"];

const fields: Record<string, string> = {
  headline: "一句话背景",
  company: "公司",
  job_title: "职位",
  location: "地点",
  professional_background: "职业背景",
  professional_topics: "职业议题",
  public_profile: "公开主页",
};

const tools: Record<string, string> = {
  extract_chat_screenshot: "读取截图",
  extract_web_text: "读取网页文字",
  search_contacts: "查找已有联系人",
  read_contact: "读取联系人",
  create_contact: "创建联系人并保存消息",
  save_contact_chat: "保存聊天消息",
  search_contact_public: "搜索公开资料",
  fetch_contact_source: "读取公开来源",
  update_contact: "更新有来源的档案",
  finish_contact_task: "整理分析",
  ask_contact_clarification: "等待身份确认",
};

const defaultTextObjective =
  "整理这段来源，识别人物并保存准确证据。身份不清时询问，没有人物不创建。";
const defaultImageObjective =
  "识别这些截图中的聊天或个人主页；聊天按顺序归档，个人主页生成可核对的资料草稿。若公开职业线索充分，可自主搜索、读取并更新档案。";

function isAttention(status: string): boolean {
  return attentionStatuses.includes(status);
}

function failureCopy(item: Task): string | null {
  if (item.limitations.includes("CONTACT_AGENT_PROVIDER_HTTP_429")) {
    return "AI 服务暂时繁忙，来源已经保存。稍后可继续这条任务。";
  }
  if (item.limitations.includes("CONTACT_AGENT_SERVER_STOPPED")) {
    return "服务重启中断了处理。来源仍在，可以从这条任务继续。";
  }
  return null;
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await workspaceSessionFetch(`/api/contact-agent/${path}`, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  if (!response.ok) {
    const code = value.code ?? value.error?.code;
    const message = value.message ?? value.error?.message;
    if (
      code === "CONTACT_AGENT_UNAVAILABLE" ||
      message === "Screenshot contact Agent is not configured."
    ) {
      throw new Error(
        "来源整理服务暂未就绪。当前输入仍在，请保留此页面，稍后重试。",
      );
    }
    throw new Error(message ?? "暂时无法完成，请重试。");
  }
  return value as T;
}

async function imageInput(
  file: File,
): Promise<ScreenshotContactTaskRequest["image"]> {
  if (
    !ACCEPTED_IMAGE_TYPES.includes(
      file.type as (typeof ACCEPTED_IMAGE_TYPES)[number],
    ) ||
    file.size > 10_000_000
  ) {
    throw new Error("请选择 10 MB 以内的 PNG、JPEG 或 WebP 截图。");
  }
  const bytes = await file.arrayBuffer();
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]!);
    reader.onerror = () => reject(new Error("截图读取失败。"));
    reader.readAsDataURL(file);
  });
  return {
    media_type: file.type as ScreenshotContactTaskRequest["image"]["media_type"],
    byte_size: file.size,
    content_hash: hash,
    data_base64: data,
  };
}

function SourceTypeIcon({ kind }: { kind?: string }) {
  if (kind === "page_text" || kind === "selected_text") return <TextT aria-hidden />;
  if (kind === "screen") return <Monitor aria-hidden />;
  if (kind === "visible_tab") return <Browser aria-hidden />;
  return <FileImage aria-hidden />;
}

function IntakeGuide() {
  return (
    <section className={styles.intakeGuide} aria-label="来源会如何整理">
      <h2>来源会如何整理</h2>
      <div className={styles.guideStep}>
        <FileText aria-hidden />
        <div>
          <strong>保留原文</strong>
          <p>保留期内，随时回看截图与原文。</p>
        </div>
      </div>
      <div className={styles.guideStep}>
        <UsersThree aria-hidden />
        <div>
          <strong>串起人物</strong>
          <p>身份明确时归入对应人物。</p>
        </div>
      </div>
      <div className={styles.guideStep}>
        <HandPointing aria-hidden />
        <div>
          <strong>把判断留给你</strong>
          <p>不确定的身份与资料会请你确认。</p>
        </div>
      </div>
    </section>
  );
}

function HistorySkeleton() {
  return (
    <div className={styles.historyLoading} role="status">
      <p>正在读取来源记录</p>
      <span aria-hidden />
      <span aria-hidden />
      <span aria-hidden />
    </div>
  );
}

function HistoryError({
  message,
  disabled,
  onRetry,
}: {
  message: string;
  disabled: boolean;
  onRetry: () => void;
}) {
  return (
    <div className={styles.historyError} role="alert">
      <WarningCircle aria-hidden />
      <p>{message}</p>
      <button type="button" onClick={onRetry} disabled={disabled}>
        重试
      </button>
    </div>
  );
}

function HistoryRow({
  item,
  selected,
  onSelect,
  disabled,
}: {
  item: Recent;
  selected: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  const title = item.contact?.display_name ?? item.source?.title ?? "来源";
  return (
    <button
      type="button"
      className={`${styles.historyItem} ${selected ? styles.selected : ""}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => onSelect(item.task_id)}
    >
      <span className={styles.historyIcon}>
        <SourceTypeIcon kind={item.source?.kind} />
      </span>
      <span className={styles.historyBody}>
        <strong>{title}</strong>
        {item.contact && item.source ? (
          <span className={styles.recentSource} title={item.source.title}>
            {item.source.title}
          </span>
        ) : null}
        <span>{new Date(item.created_at).toLocaleDateString("zh-CN")}</span>
        <span className={styles.statusLabel} data-status={item.status}>
          {states[item.status]}
        </span>
      </span>
    </button>
  );
}

type TaskCardProps = {
  item: Task;
  busy: boolean;
  deleteID: string | null;
  name: string;
  hasDraftImage: boolean;
  onNameChange: (value: string) => void;
  onResume: (item: Task, selection?: CandidateSelection) => Promise<void>;
  onConfirm: (
    item: Task,
    review: ContactProfileConfirmation,
  ) => Promise<void>;
  onCancelTask: (item: Task) => Promise<void>;
  onRequestDelete: (id: string) => void;
  onCancelDelete: () => void;
  onDelete: (item: Task) => Promise<void>;
};

function TaskEvidenceCard({
  item,
  busy,
  deleteID,
  name,
  hasDraftImage,
  onNameChange,
  onResume,
  onConfirm,
  onCancelTask,
  onRequestDelete,
  onCancelDelete,
  onDelete,
}: TaskCardProps) {
  const heading =
    item.contact?.display_name ??
    item.contact_draft?.display_name ??
    item.source?.title ??
    (item.status === "completed" ? "已检查来源" : "采集结果");
  const failure = failureCopy(item);
  const showFailure = ["failed", "partial"].includes(item.status);

  return (
    <section
      className={styles.card}
      id={`contact-task-${item.task_id}`}
      aria-label="联系人分析卡片"
    >
      <div className={styles.cardHeading}>
        <div>
          <p className={styles.statusLabel} data-status={item.status} role="status">
            {states[item.status]}
          </p>
          <h2>{heading}</h2>
        </div>
        {item.contact ? (
          <Link
            className={styles.profileLink}
            href={`/workspace/captures/people/${item.contact.person_id}?context=${item.contact.relationship_context_id}`}
          >
            打开档案 ↗
          </Link>
        ) : null}
      </div>

      {item.contact ? (
        <p className={styles.muted}>
          {item.contact.disposition === "created"
            ? "已创建联系人"
            : "已复用已有联系人"}{" "}
          · 已保存 {item.message_count}{" "}
          {item.extraction?.conversation_kind === "not_chat"
            ? "段来源"
            : "条消息"}{" "}
          · {new Date(item.created_at).toLocaleDateString("zh-CN")}
        </p>
      ) : null}

      {item.source ? (
        <div className={styles.sourceBar}>
          <span>
            {item.source.kind.includes("text")
              ? "网页文字"
              : item.source.kind === "screen"
                ? "屏幕截取"
                : "截图"}
          </span>
          <span>{item.source.title}</span>
          {/^https?:\/\//.test(item.source.url) ? (
            <a href={item.source.url} target="_blank" rel="noreferrer">
              打开来源 ↗
            </a>
          ) : null}
          <span>
            {item.source.time_basis === "imported_at" ? "导入时间" : "截取时间"} ·{" "}
            {new Date(
              item.source_captured_at ?? item.created_at,
            ).toLocaleString("zh-CN")}
          </span>
        </div>
      ) : null}

      {item.source_text ? (
        <details className={styles.sourceText}>
          <summary>查看提交的原文</summary>
          <pre>{item.source_text}</pre>
        </details>
      ) : null}

      {item.summary || failure ? (
        <p className={styles.summary}>
          {showFailure ? (failure ?? item.summary) : item.summary}
        </p>
      ) : null}

      {item.status === "running" ? (
        <div className={styles.progress}>
          <span className={styles.pulse} />
          <span>{tools[item.events.at(-1)?.tool ?? ""] ?? "正在提取来源并查找人物"}</span>
          <button type="button" onClick={() => void onCancelTask(item)}>
            停止
          </button>
        </div>
      ) : null}

      {item.summary ? (
        <ProductFeedback key={item.task_id} taskID={item.task_id} />
      ) : null}

      {item.contact_draft ? (
        <ContactProfileReview
          key={item.task_id}
          task={item}
          busy={busy}
          onConfirm={(review) => onConfirm(item, review)}
        />
      ) : null}

      {item.reviewed_profile ? (
        <ReviewedContactProfile profile={item.reviewed_profile} />
      ) : null}

      {item.question && !item.contact_draft ? (
        <div className={styles.question}>
          <h3>{item.question}</h3>
          {item.candidates.map((candidate) => (
            <button
              key={`${candidate.person_id}:${candidate.relationship_context_id}`}
              type="button"
              onClick={() => void onResume(item, candidate)}
              disabled={busy}
            >
              {candidate.display_name} · {candidate.relationship_label}
            </button>
          ))}
          {item.extraction ? (
            <>
              <label className={styles.label}>
                或指定本次归档的联系人姓名
                <input
                  value={name}
                  onChange={(event) => onNameChange(event.target.value)}
                  maxLength={200}
                  disabled={busy}
                />
              </label>
              <button
                type="button"
                onClick={() => void onResume(item)}
                disabled={busy || (!name.trim() && !hasDraftImage)}
              >
                确认并继续
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {["failed", "partial", "cancelled"].includes(item.status) &&
      !item.limitations.includes("CONTACT_SOURCE_DELETION_PENDING") ? (
        <button type="button" onClick={() => void onResume(item)} disabled={busy}>
          继续这个任务
        </button>
      ) : null}

      {item.status !== "deleted" ? (
        <div className={styles.deleteSource}>
          {deleteID === item.task_id ? (
            <>
              <p>
                删除本次来源、原图及衍生分析。若人物已无其他来源，也会移除该人物及关系记录。
              </p>
              <button type="button" onClick={() => void onDelete(item)} disabled={busy}>
                确认删除来源
              </button>
              <button type="button" onClick={onCancelDelete} disabled={busy}>
                保留
              </button>
            </>
          ) : (
            <button
              className={styles.textButton}
              type="button"
              onClick={() => onRequestDelete(item.task_id)}
            >
              删除这次采集
            </button>
          )}
        </div>
      ) : null}

      {item.findings.length > 0 ? (
        <div className={styles.section}>
          <h3>这次来源留下了什么</h3>
          {item.findings.map((finding, index) => (
            <article className={styles.finding} key={index}>
              <p>{finding.text}</p>
              <blockquote>{finding.source_excerpt}</blockquote>
              <small>
                {finding.epistemic_status === "inference" ? "分析判断" : "来源陈述"} ·{" "}
                {finding.message_refs.join("、")}
              </small>
            </article>
          ))}
        </div>
      ) : null}

      {item.profile_fields.length > 0 ? (
        <div className={styles.section}>
          <h3>有来源的职业资料</h3>
          <dl className={styles.profile}>
            {item.profile_fields.map((field, index) => (
              <div key={index}>
                <dt>{fields[field.field]}</dt>
                <dd>
                  {field.value}
                  <details>
                    <summary>
                      {field.epistemic_status === "inference"
                        ? "查看推断依据"
                        : "查看原文"}
                    </summary>
                    <blockquote>{field.source_excerpt}</blockquote>
                    {field.source_refs.map((ref) => {
                      const source = item.public_sources.find(
                        (candidate) => candidate.source_id === ref,
                      );
                      return source ? (
                        <a
                          key={ref}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {source.title} ↗
                        </a>
                      ) : (
                        <small key={ref}>
                          {ref.startsWith("clue") ? "截图线索" : "聊天消息"} {ref}
                        </small>
                      );
                    })}
                  </details>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {item.source_images && item.source_images.length > 0 ? (
        <details className={styles.section}>
          <summary>原始图片 · {item.source_images.length}</summary>
          <div className={styles.sourceImages}>
            {item.source_images.map((source) => (
              <a
                key={source.image_index}
                href={`/api/contact-agent/tasks/${item.task_id}/images/${source.image_index}`}
                target="_blank"
                rel="noreferrer"
              >
                查看图片 {source.image_index + 1}
              </a>
            ))}
          </div>
        </details>
      ) : null}

      {item.extraction ? (
        <details className={styles.section}>
          <summary>
            提取内容（未确认） · {item.extraction.messages.length} 条
          </summary>
          <ol className={styles.messages}>
            {item.extraction.messages.map((message) => (
              <li key={message.message_id}>
                <small>
                  {item.source_images?.[message.source_image_index ?? -1] ? (
                    <>
                      <a
                        href={`/api/contact-agent/tasks/${item.task_id}/images/${message.source_image_index}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        图片 {(message.source_image_index ?? 0) + 1}
                      </a>{" "}
                      ·{" "}
                    </>
                  ) : null}
                  {message.message_id} ·{" "}
                  {message.speaker_side === "left"
                    ? "画面左侧"
                    : message.speaker_side === "right"
                      ? "画面右侧"
                      : "说话人未确定"}
                  {message.time_text ? ` · ${message.time_text}` : ""}
                </small>
                <p>{message.text}</p>
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {item.public_sources.length > 0 ? (
        <details className={styles.section}>
          <summary>检索过的公开来源 · {item.public_sources.length}</summary>
          {item.public_sources.map((source) => (
            <p key={source.source_id}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title} ↗
              </a>
              <small className={styles.sourceMeta}>
                {source.channel} ·{" "}
                {source.stage === "fetched" ? "已读取正文" : "待核对匹配"} ·{" "}
                {new Date(source.retrieved_at).toLocaleDateString("zh-CN")}
              </small>
            </p>
          ))}
        </details>
      ) : null}

      {item.limitations.length > 0 ? (
        <details className={styles.section}>
          <summary>仍需注意与核对</summary>
          <ul>
            {item.limitations.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <details className={styles.section}>
        <summary>查看实际处理记录</summary>
        <ol>
          {item.events.map((event) => (
            <li key={event.sequence}>
              {tools[event.tool] ?? event.tool} ·{" "}
              {event.status === "completed"
                ? "完成"
                : event.status === "denied"
                  ? "请求未获执行"
                  : "未完成"}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

type WorkspaceProps = {
  personID?: string;
  contextID?: string;
  embedded?: boolean;
  initialTaskID?: string;
};

export function ContactAgentWorkspace(props: WorkspaceProps) {
  // Person changes reset private local drafts; workspace changes remount the
  // surrounding authenticated shell using its account scope key.
  return <CaptureWorkspace key={JSON.stringify([props.personID, props.contextID])} {...props} />;
}

function CaptureWorkspace({ personID, contextID, embedded = false, initialTaskID }: WorkspaceProps) {
  const [text, setText] = useState("");
  const [inputMode, setInputMode] = useState<ComposerMode>("image");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [objective, setObjective] = useState("");
  const [research, setResearch] = useState(false);
  const [task, setTask] = useState<Task | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [profileTasks, setProfileTasks] = useState<Task[]>([]);
  const [revision, setRevision] = useState<number | null>(null);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>("loading");
  const [historyError, setHistoryError] = useState("");
  const [composerError, setComposerError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [archiveName, setArchiveName] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveID, setArchiveID] = useState<string | null>(null);
  const [deleteID, setDeleteID] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(
    !personID && !initialTaskID,
  );

  const previewURLs = useRef(new Set<string>());
  const textAttempt = useRef<TextContactTaskRequest | null>(null);
  const imageAttempt = useRef<ScreenshotContactTaskRequest | null>(null);
  const recordsToken = useRef(0);
  const dragDepth = useRef(0);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [admission] = useState(() => new AdmissionGuard());
  const [selection] = useState(() => new SelectionGate());

  useEffect(() => {
    const urls = previewURLs.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const loadRecords = useCallback(() => {
    const token = ++recordsToken.current;
    return Promise.all([
      request<{ tasks: Recent[] }>("tasks"),
      personID && contextID
        ? request<Intelligence>(`people/${personID}/contact-intelligence?relationship_context_id=${encodeURIComponent(contextID)}`)
        : Promise.resolve<Intelligence | null>(null),
    ]).then(([historyResult, profileResult]) => {
      if (token !== recordsToken.current) return;
      setRecent(historyResult.tasks);
      if (profileResult) {
        setProfileTasks(profileResult.tasks);
        setRevision(profileResult.person_revision);
        setArchiveID(profileResult.archive?.operation_id ?? null);
        setArchiveName(profileResult.archive?.display_name ?? null);
      }
      setHistoryError("");
      setHistoryStatus("ready");
    }).catch((error: Error) => {
      if (token !== recordsToken.current) return;
      setHistoryError(error.message);
      setHistoryStatus((current) => current === "loading" ? "error" : current);
    });
  }, [personID, contextID]);

  useEffect(() => {
    void loadRecords();
    return () => {
      recordsToken.current += 1;
    };
  }, [loadRecords]);

  useEffect(() => {
    let valid = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (document.visibilityState === "visible") await loadRecords();
      if (valid) timer = setTimeout(tick, 4500);
    };
    timer = setTimeout(tick, 4500);
    return () => {
      valid = false;
      clearTimeout(timer);
    };
  }, [loadRecords]);

  useEffect(() => () => { selection.cancel(); }, [selection]);

  useEffect(() => {
    if (!initialTaskID) return;
    let valid = true;
    const token = selection.begin();
    request<Task>(`tasks/${initialTaskID}`)
      .then((value) => {
        if (!valid || !selection.isCurrent(token)) return;
        setTask(value);
        setComposerOpen(false);
      })
      .catch((error) => {
        if (!valid || !selection.isCurrent(token)) return;
        setActionError((error as Error).message);
      });
    return () => {
      valid = false;
    };
  }, [initialTaskID, selection]);

  const taskID = task?.task_id;
  const status = task?.status;
  useEffect(() => {
    if (!taskID || status !== "running") return;
    let valid = true;
    let timeout: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await request<Task>(`tasks/${taskID}`);
        if (!valid) return;
        setTask(next);
        setActionError("");
        if (next.status === "running") {
          timeout = setTimeout(poll, 2200);
        } else {
          await loadRecords();
        }
      } catch (error) {
        if (!valid) return;
        setActionError((error as Error).message);
        timeout = setTimeout(poll, 5000);
      }
    };
    timeout = setTimeout(poll, 1500);
    return () => {
      valid = false;
      clearTimeout(timeout);
    };
  }, [taskID, status, loadRecords]);

  useEffect(() => {
    if (!taskID) return;
    document
      .getElementById(`contact-task-${taskID}`)
      ?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [taskID]);

  function clearAttachments() {
    previewURLs.current.forEach((url) => URL.revokeObjectURL(url));
    previewURLs.current.clear();
    setAttachments([]);
  }

  function removeAttachment(id: string) {
    if (attachmentsLocked || admission.pending) return;
    const removed = attachments.find((attachment) => attachment.id === id);
    if (removed) {
      URL.revokeObjectURL(removed.url);
      previewURLs.current.delete(removed.url);
    }
    setAttachments((current) =>
      current.filter((attachment) => attachment.id !== id),
    );
    imageAttempt.current = null;
  }

  function addFiles(files: File[]) {
    if (!files.length || attachmentsLocked || admission.pending) return;
    const result = validateAttachmentBatch(
      attachments.map((attachment) => attachment.file),
      files,
    );
    if (!result.ok) {
      setComposerError(result.error);
      return;
    }
    const added = result.accepted.map((file) => {
      const url = URL.createObjectURL(file);
      previewURLs.current.add(url);
      return { id: crypto.randomUUID(), file, url };
    });
    setAttachments((current) => [...current, ...added]);
    imageAttempt.current = null;
    setComposerError("");
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    addFiles(files);
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (attachmentsLocked) return;
    dragDepth.current += 1;
    setDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    // Always cancel the browser's default so even an invalid drop cannot
    // navigate away from the page.
    event.preventDefault();
    if (attachmentsLocked) return;
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDragging(false);
    if (attachmentsLocked) return;
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) {
      if (dataTransferHasFileEntries(Array.from(event.dataTransfer?.items ?? []))) {
        setComposerError("暂不支持文件夹，请拖入 PNG、JPEG 或 WebP 截图文件。");
      }
      return;
    }
    addFiles(files);
  }

  function handlePaste(event: ClipboardEvent<HTMLElement>) {
    if (attachmentsLocked || inputMode !== "image") return;
    // Never hijack ordinary text paste into the textarea/inputs.
    if (targetsTextEntry(event.target)) return;
    const files = imageFilesFromClipboard(
      Array.from(event.clipboardData?.items ?? []),
    );
    if (!files.length) return;
    event.preventDefault();
    addFiles(files);
  }

  function selectMode(mode: ComposerMode) {
    if (busy || admission.pending || mode === inputMode) return;
    setInputMode(mode);
    setComposerError("");
  }

  function startNewSource() {
    if (busy || admission.pending) return;
    selection.cancel();
    setTask(null);
    setDeleteID(null);
    setActionError("");
    setComposerError("");
    setComposerOpen(true);
  }

  async function openTask(id: string) {
    if (busy || admission.pending) return;
    const token = selection.begin();
    setActionError("");
    try {
      const value = await request<Task>(`tasks/${id}`);
      if (!selection.isCurrent(token)) return;
      setTask(value);
      setDeleteID(null);
      setComposerOpen(false);
    } catch (error) {
      if (!selection.isCurrent(token)) return;
      setActionError((error as Error).message);
    }
  }

  async function submit() {
    if (busy || status === "running") return;
    const hasDraft = inputMode === "image" ? attachments.length > 0 : text.trim().length > 0;
    if (!hasDraft) return;
    // Synchronous ref gate: a rapid second activation cannot admit twice.
    if (!admission.tryEnter()) return;
    selection.cancel();
    setBusy(true);
    setComposerError("");
    try {
      if (inputMode === "text") {
        const body = reuseOrCreateAttempt(textAttempt.current, () => ({
          idempotency_key: crypto.randomUUID(),
          objective: objective.trim() || defaultTextObjective,
          text: text.trim(),
          source: {
            kind: "selected_text" as const,
            title: "粘贴的文字",
            url: "",
            time_basis: "imported_at" as const,
          },
          allow_public_research: research,
          captured_at: new Date().toISOString(),
          ...(personID && contextID
            ? {
                selected_person_id: personID,
                selected_relationship_context_id: contextID,
              }
            : {}),
        }));
        textAttempt.current = body;
        const result = await request<Task>("tasks", body);
        setTask(result);
        textAttempt.current = null;
        setText("");
      } else {
        const images = await Promise.all(
          attachments.map((attachment) => imageInput(attachment.file)),
        );
        const body = reuseOrCreateAttempt(imageAttempt.current, () => {
          const image = images[0]!;
          return {
            idempotency_key: crypto.randomUUID(),
            objective: objective.trim() || defaultImageObjective,
            image,
            ...(images.length > 1
              ? { additional_images: images.slice(1) }
              : {}),
            allow_public_research: research,
            captured_at: new Date().toISOString(),
            ...(personID && contextID
              ? {
                  selected_person_id: personID,
                  selected_relationship_context_id: contextID,
                }
              : {}),
          };
        });
        imageAttempt.current = body;
        const result = await request<Task>("tasks", body);
        setTask(result);
        imageAttempt.current = null;
        clearAttachments();
      }
      setComposerOpen(false);
      await loadRecords();
    } catch (error) {
      // Keep the attempt so an unknown failure retries with the same
      // idempotency key and payload.
      setComposerError((error as Error).message);
    } finally {
      setBusy(false);
      admission.leave();
    }
  }

  async function resume(item: Task, selected?: CandidateSelection) {
    setBusy(true);
    setActionError("");
    try {
      const body: Record<string, unknown> = {
        expected_revision: item.revision,
        ...(selected
          ? {
              selected_person_id: selected.person_id,
              selected_relationship_context_id:
                selected.relationship_context_id,
            }
          : name.trim()
            ? { new_contact_name: name.trim() }
            : {}),
      };
      if (
        !item.extraction &&
        !item.source_images?.length &&
        attachments[0]
      ) {
        body.image = await imageInput(attachments[0].file);
      }
      setTask(await request<Task>(`tasks/${item.task_id}/resume`, body));
      setName("");
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmProfile(
    item: Task,
    review: ContactProfileConfirmation,
  ) {
    setBusy(true);
    setActionError("");
    try {
      setTask(
        await request<Task>(`tasks/${item.task_id}/profile-confirmation`, review),
      );
      await loadRecords();
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelTask(item: Task) {
    setBusy(true);
    setActionError("");
    try {
      setTask(
        await request<Task>(`tasks/${item.task_id}/cancel`, {
          expected_revision: item.revision,
        }),
      );
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeSource(item: Task) {
    setBusy(true);
    setActionError("");
    try {
      setTask(
        await request<Task>(`tasks/${item.task_id}/delete`, {
          expected_revision: item.revision,
        }),
      );
      setDeleteID(null);
      await loadRecords();
    } catch (error) {
      setActionError((error as Error).message);
      await openTask(item.task_id);
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!personID || !revision) return;
    setBusy(true);
    setActionError("");
    try {
      const result = await request<{ operation_id: string }>(
        `people/${personID}/archive`,
        {
          expected_revision: revision,
          idempotency_key: crypto.randomUUID(),
          decision: "archive",
        },
      );
      setArchiveID(result.operation_id);
      setArchiveName(personName ?? null);
      setArchiveOpen(false);
      setProfileTasks([]);
      setTask(null);
      await loadRecords();
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!archiveID) return;
    setBusy(true);
    setActionError("");
    try {
      await request(`archives/${archiveID}/restore`, {});
      setArchiveID(null);
      await loadRecords();
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const allScopedRecent = personID
    ? recent.filter(
        (item) =>
          item.contact?.person_id === personID &&
          item.contact.relationship_context_id === contextID,
      )
    : recent;
  const attentionCount = allScopedRecent.filter((item) =>
    isAttention(item.status),
  ).length;
  const scopedRecent =
    filter === "attention"
      ? allScopedRecent.filter((item) => isAttention(item.status))
      : allScopedRecent;
  const shown = task ? [task] : profileTasks;
  const hasRecords =
    allScopedRecent.length > 0 || profileTasks.length > 0 || Boolean(task);
  const showSidebar = hasRecords;
  const showEmpty = historyStatus === "ready" && !hasRecords;
  const personName =
    archiveName ??
    profileTasks[0]?.contact?.display_name ??
    task?.contact?.display_name;
  const attachmentsLocked = busy || status === "running";
  const composerCollapsible = !showEmpty && Boolean(personID || task);
  const composerExpanded = composerCollapsible ? composerOpen : true;
  const Layout = "main";

  const composer = (
    <details
      className={styles.profileComposer}
      open={composerExpanded}
      onToggle={(event: SyntheticEvent<HTMLDetailsElement>) => {
        if (composerCollapsible) setComposerOpen(event.currentTarget.open);
      }}
    >
      <summary hidden={!composerCollapsible}>
        {task ? "追加来源" : "添加来源"}
      </summary>
      <section className={styles.composer} aria-label="添加来源" onPaste={handlePaste}>
        <div className={styles.composerHeader}>
          <div className={styles.inputModes} role="group" aria-label="来源类型">
            <button
              type="button"
              aria-pressed={inputMode === "image"}
              onClick={() => selectMode("image")}
              disabled={busy}
            >
              <Images aria-hidden /> 截图
            </button>
            <button
              type="button"
              aria-pressed={inputMode === "text"}
              onClick={() => selectMode("text")}
              disabled={busy}
            >
              <TextT aria-hidden /> 文字
            </button>
          </div>
        </div>

        {inputMode === "image" ? (
          <div
            className={styles.dropzone}
            data-dragging={dragging ? "true" : "false"}
            data-has-attachments={attachments.length > 0 ? "true" : "false"}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            tabIndex={attachmentsLocked ? -1 : 0}
          >
            <input
              ref={fileInput}
              className={styles.fileInput}
              type="file"
              multiple
              accept={ACCEPTED_IMAGE_TYPES.join(",")}
              aria-label="选择聊天截图"
              onChange={handleFileInput}
              disabled={attachmentsLocked}
            />
            <div className={styles.dropTarget}>
              {attachments.length === 0 ? (
                <>
                  <div className={styles.uploadArt}><Images aria-hidden weight="light" /></div>
                  <strong>拖入截图，或直接粘贴</strong>
                  <p className={styles.uploadHint}>PNG、JPEG、WebP · 最多 10 张，每张 10 MB</p>
                </>
              ) : (
                <ol className={styles.attachments} aria-label="待发送截图">
                  {attachments.map((attachment, index) => (
                    <li key={attachment.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={attachment.url} alt={`第 ${index + 1} 张截图预览`} />
                      <span className={styles.attachmentIndex} aria-hidden>
                        {index + 1}
                      </span>
                      <span className={styles.attachmentName} title={attachment.file.name}>
                        {attachment.file.name}
                      </span>
                      <button
                        type="button"
                        aria-label={`移除第 ${index + 1} 张截图`}
                        onClick={() => removeAttachment(attachment.id)}
                        disabled={attachmentsLocked}
                      >
                        <X aria-hidden />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <button
                type="button"
                className={styles.chooseFiles}
                onClick={() => fileInput.current?.click()}
                disabled={attachmentsLocked}
              >
                <Plus aria-hidden />{" "}
                {attachments.length > 0 ? "添加更多截图" : "选择截图"}
              </button>
            </div>
          </div>
        ) : (
          <label className={styles.sourceLabel}>
            来源文字
            <textarea
              className={styles.sourceTextarea}
              rows={8}
              maxLength={50000}
              minLength={1}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                textAttempt.current = null;
                setComposerError("");
              }}
              placeholder="粘贴对话原文、人物介绍或网页片段…"
              disabled={busy}
            />
            <span className={styles.characterCount}>{text.length} / 50000</span>
          </label>
        )}

        <details className={styles.intentDetails}>
          <summary>
            添加整理要求 <span>可选</span>
          </summary>
          <label className={styles.label}>
            这次想了解什么？
            <textarea
              value={objective}
              onChange={(event) => {
                setObjective(event.target.value);
                textAttempt.current = null;
                imageAttempt.current = null;
                setComposerError("");
              }}
              placeholder="例如：记下这次沟通，查找公开职业资料，帮我想清楚下一步。"
              rows={3}
              maxLength={4000}
              disabled={busy}
            />
          </label>
        </details>

        {composerError ? (
          <p className={styles.composerError} role="alert">
            {composerError}
          </p>
        ) : null}

        <label className={styles.researchOption}>
            <input
              type="checkbox"
              checked={research}
              onChange={(event) => {
                setResearch(event.target.checked);
                textAttempt.current = null;
                imageAttempt.current = null;
              }}
              disabled={busy}
            />
            <span>
              允许搜索公开职业资料
            </span>
          </label>
        <div className={styles.composerFooter}>
          <details className={styles.retentionDisclosure}>
            <summary>
              <ShieldCheck aria-hidden /> 原文与分析最多保留 30 天
            </summary>
            <p>
              保存后会自动进行内部整理：来源原文与分析最多保留 30
              天。身份或资料有歧义时会请你确认，不会自动对外发送消息或修改公开资料。你可以随时删除这次采集及其衍生分析。
            </p>
          </details>
          <button
            type="button"
            className={styles.primary}
            onClick={() => void submit()}
            disabled={
              busy ||
              status === "running" ||
              (inputMode === "image" ? attachments.length === 0 : !text.trim())
            }
          >
            <ArrowUpRight aria-hidden /> {busy ? "正在提交…" : "保存并整理"}
          </button>
        </div>
      </section>
    </details>
  );

  function renderHistory() {
    if (historyStatus === "loading") return <HistorySkeleton />;
    if (historyStatus === "error") {
      return (
        <HistoryError
          message={historyError || "来源记录暂时无法读取。"}
          disabled={busy}
          onRetry={() => void loadRecords()}
        />
      );
    }
    const errorBanner = historyError ? (
      <HistoryError
        message={historyError}
        disabled={busy}
        onRetry={() => void loadRecords()}
      />
    ) : null;
    if (scopedRecent.length === 0) {
      if (errorBanner) return errorBanner;
      return (
        <p className={styles.muted}>
          {filter === "attention" ? "暂时没有待处理的来源。" : "还没有来源记录。"}
        </p>
      );
    }
    return (
      <>
        {errorBanner}
        <div className={styles.historyList}>
          {scopedRecent.map((item) => (
            <HistoryRow
              key={item.task_id}
              item={item}
              selected={item.task_id === taskID}
              disabled={busy}
              onSelect={(id) => void openTask(id)}
            />
          ))}
        </div>
      </>
    );
  }

  return (
    <div className={`${styles.page} ${embedded ? styles.embedded : ""}`}>
      {!embedded ? (
        <header className={styles.header}>
          <Link href="/contact-agent" className={styles.brand}>
            Talent Signal <span>关系工作台</span>
          </Link>
          <Link href="/workspace">返回工作台</Link>
        </header>
      ) : null}

      <Layout
        className={`${styles.layout} ${!showSidebar ? styles.emptyLayout : ""}`}
        id="main-content"
      >
        <header className={styles.intro}>
          <div className={styles.titleBlock}>
            {personID ? <p className={styles.eyebrow}>联系人档案</p> : null}
            <h1>{personID ? (personName ?? "联系人") : "来源"}</h1>
            <p>截图、文字与网页，整理成可追溯的人物线索。</p>
          </div>
          {task ? (
            <button
              type="button"
              className={styles.newSource}
              onClick={startNewSource}
              disabled={busy}
            >
              <Plus aria-hidden /> 添加来源
            </button>
          ) : null}
          {personID && revision && !archiveID ? (
            <button
              type="button"
              className={styles.textButton}
              onClick={() => setArchiveOpen(true)}
            >
              归档联系人
            </button>
          ) : null}
        </header>

        {showSidebar ? (
          <aside className={styles.sidebar} aria-label="来源记录">
            <div className={styles.historyHeading}>
              <p className={styles.eyebrow}>
                {personID ? "这位联系人的整理记录" : "采集记录"}
              </p>
              {hasRecords && !task ? (
                <button
                  type="button"
                  className={styles.newSource}
                  onClick={startNewSource}
                  disabled={busy}
                >
                  <Plus aria-hidden /> 添加来源
                </button>
              ) : null}
            </div>
            <div className={styles.filters}>
              <button
                type="button"
                aria-pressed={filter === "all"}
                onClick={() => setFilter("all")}
              >
                全部 <span>{allScopedRecent.length}</span>
              </button>
              <button
                type="button"
                aria-pressed={filter === "attention"}
                onClick={() => setFilter("attention")}
              >
                待处理 <span>{attentionCount}</span>
              </button>
            </div>
            {renderHistory()}
          </aside>
        ) : null}

        <div className={styles.content}>
          {archiveID ? (
            <div className={styles.card}>
              <p>联系人已归档，资料已从当前工作区隐藏。</p>
              <button type="button" onClick={() => void restore()} disabled={busy}>
                撤销归档
              </button>
            </div>
          ) : !hasRecords ? (
            <>
              <div className={styles.intakeGrid}>
                {composer}
                <IntakeGuide />
              </div>
              {historyStatus === "loading" ? <HistorySkeleton /> : historyError ? (
                <HistoryError message={historyError} disabled={busy} onRetry={() => void loadRecords()} />
              ) : <div className={styles.emptyHistory}>
                <Tray aria-hidden />
                <strong>还没有来源</strong>
                <p>添加后，处理进度与结果会留在这里。</p>
              </div>}
            </>
          ) : (
            composer
          )}

          {actionError ? (
            <p className={styles.error} role="alert">
              {actionError}
            </p>
          ) : null}

          {shown.map((item) => (
            <TaskEvidenceCard
              key={item.task_id}
              item={item}
              busy={busy}
              deleteID={deleteID}
              name={name}
              hasDraftImage={attachments.length > 0}
              onNameChange={setName}
              onResume={resume}
              onConfirm={confirmProfile}
              onCancelTask={cancelTask}
              onRequestDelete={setDeleteID}
              onCancelDelete={() => setDeleteID(null)}
              onDelete={removeSource}
            />
          ))}
        </div>
      </Layout>

      {archiveOpen ? (
        <div className={styles.modalBackdrop}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-title"
            className={styles.card}
          >
            <h2 id="archive-title">归档 {personName}？</h2>
            <p>
              联系人将从当前工作区隐藏，正在进行的整理会停止。资料仍按原保留期限保存，你可以撤销归档。
            </p>
            <button type="button" onClick={() => setArchiveOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className={styles.primary}
              disabled={busy}
              onClick={() => void archive()}
            >
              归档这个联系人
            </button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
