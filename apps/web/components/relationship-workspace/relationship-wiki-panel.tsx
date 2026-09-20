"use client";

import type {
  ChatTaskResponse,
  KnowledgeSnapshot,
} from "@talent-signal/contracts";
import {
  ArrowRight,
  CircleNotch,
  Quotes,
  ShieldCheck,
  Sparkle,
} from "@phosphor-icons/react";

export type RelationshipWikiBlock = {
  body: string;
  citationDependencyIds: string[];
  id: string;
  kind: "action_proposal" | "fact_review" | "no_action" | "person_brief";
  status: "confirmed" | "needs_review" | "proposed";
  title: string;
};

export type RelationshipWikiView = {
  blocks: RelationshipWikiBlock[];
  snapshotId: string;
};

export type RelationshipMemorySection = {
  blocks: KnowledgeSnapshot["blocks"];
  description: string;
  key: "valuable" | "open" | "history";
  title: string;
};

const MEMORY_SECTION_TYPES = {
  valuable: new Set([
    "decision_driver",
    "constraint",
    "commitment",
    "deadline",
    "professional_history",
  ]),
  open: new Set(["current_dependency", "open_question", "conflict"]),
  history: new Set([
    "meaningful_change",
    "relationship_history",
    "observed_outcome",
    "sourced_research",
  ]),
} as const;

export function knowledgeSnapshotMemorySections(
  snapshot: KnowledgeSnapshot | null,
): RelationshipMemorySection[] {
  if (!snapshot || snapshot.status !== "published") return [];
  const definitions: Array<Omit<RelationshipMemorySection, "blocks">> = [
    {
      key: "valuable",
      title: "珍贵关系记忆",
      description: "影响沟通与决定的驱动、约束、承诺和期限。",
    },
    {
      key: "open",
      title: "仍需澄清",
      description: "不能被摘要抹平的依赖、问题与冲突。",
    },
    {
      key: "history",
      title: "变化与结果",
      description: "过去发生了什么，以及行动后观察到什么。",
    },
  ];
  return definitions.flatMap((definition) => {
    const blocks = snapshot.blocks.filter((block) =>
      MEMORY_SECTION_TYPES[definition.key].has(block.type as never),
    );
    return blocks.length > 0 ? [{ ...definition, blocks }] : [];
  });
}

function memoryTypeLabel(type: KnowledgeSnapshot["blocks"][number]["type"]) {
  const labels: Partial<Record<typeof type, string>> = {
    commitment: "承诺",
    conflict: "冲突",
    constraint: "约束",
    current_dependency: "当前依赖",
    deadline: "期限",
    decision_driver: "决定驱动",
    meaningful_change: "重要变化",
    observed_outcome: "观察结果",
    open_question: "待澄清",
    professional_history: "职业经历",
    relationship_history: "关系历程",
    sourced_research: "公开研究",
  };
  return labels[type] ?? type.replaceAll("_", " ");
}

function uniqueDependencies(blocks: KnowledgeSnapshot["blocks"]): string[] {
  return [
    ...new Set(
      blocks.flatMap((block) =>
        block.dependencies.map((dependency) => dependency.id),
      ),
    ),
  ];
}

export function knowledgeSnapshotWikiView(
  snapshot: KnowledgeSnapshot | null,
): RelationshipWikiView | null {
  if (!snapshot || snapshot.status !== "published") {
    return null;
  }
  const identity = snapshot.blocks.find(
    (block) => block.type === "identity_context",
  );
  if (!identity) {
    return null;
  }
  const contextBlocks = snapshot.blocks.filter(
    (block) =>
      !["identity_context", "next_action", "no_action"].includes(
        block.type,
      ),
  );
  const currentFactBlocks = contextBlocks.filter(
    (block) =>
      block.block_key.startsWith("fact.") && block.status === "confirmed",
  );
  const reviewBlocks = contextBlocks.filter(
    (block) =>
      block.type === "conflict" ||
      block.type === "open_question" ||
      block.block_key.startsWith("resource.resume.") ||
      block.block_key.startsWith("resource.document.") ||
      block.block_key.startsWith("resource.contact-record."),
  );
  const nextMove = snapshot.blocks.find(
    (block) => block.type === "next_action" || block.type === "no_action",
  );
  const blocks: RelationshipWikiBlock[] = [
    {
      body:
        currentFactBlocks
          .map((block) => block.content.headline)
          .join("\n") ||
        "尚无其他已审阅的关系状态可用。",
      citationDependencyIds: uniqueDependencies([
        identity,
        ...currentFactBlocks,
      ]),
      id: `${identity.id}:brief`,
      kind: "person_brief",
      status: contextBlocks.some((block) =>
        ["proposed", "contested"].includes(block.status),
      )
        ? "needs_review"
        : "confirmed",
      title: identity.content.headline,
    },
  ];
  if (reviewBlocks.length > 0) {
    const hasConflict = reviewBlocks.some(
      (block) => block.type === "conflict",
    );
    blocks.push({
      body: reviewBlocks.map((block) => block.content.headline).join("\n"),
      citationDependencyIds: uniqueDependencies(reviewBlocks),
      id: `${reviewBlocks[0].id}:review`,
      kind: "fact_review",
      status: "needs_review",
      title: hasConflict
        ? "依赖这些内容前，请先解决冲突证据"
        : "依赖这些内容前，请先审阅拟议事实",
    });
  }
  if (nextMove) {
    blocks.push({
      body:
        nextMove.type === "next_action"
          ? [
              nextMove.content.headline,
              nextMove.content.summary,
              ...nextMove.content.items,
            ]
              .filter(Boolean)
              .join("\n")
          : nextMove.content.headline,
      citationDependencyIds: uniqueDependencies([nextMove]),
      id: `${nextMove.id}:next`,
      kind:
        nextMove.type === "next_action" ? "action_proposal" : "no_action",
      status: nextMove.type === "next_action" ? "proposed" : "confirmed",
      title: nextMove.type === "next_action" ? "拟议下一步" : "无需行动",
    });
  }
  return { blocks, snapshotId: snapshot.id };
}

function bodyLines(body: string) {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function relationshipWikiView(
  response: ChatTaskResponse | null,
  snapshot: KnowledgeSnapshot | null,
): RelationshipWikiView | null {
  return response
    ? {
        blocks: response.blocks
          .filter((block) =>
            [
              "action_proposal",
              "fact_review",
              "no_action",
              "person_brief",
            ].includes(block.kind),
          )
          .map((block) => ({
            body: block.body,
            citationDependencyIds: block.citation_dependency_ids,
            id: block.id,
            kind: block.kind as RelationshipWikiBlock["kind"],
            status:
              block.status === "proposed"
                ? "proposed"
                : block.status === "needs_review"
                  ? "needs_review"
                  : "confirmed",
            title: block.title,
          })),
        snapshotId: response.knowledge_snapshot_id,
      }
    : knowledgeSnapshotWikiView(snapshot);
}

export function RelationshipWikiPanel({
  busy,
  personLabel,
  onCompile,
  onReviewSources,
  response,
  snapshot,
}: {
  busy: boolean;
  personLabel?: string;
  onCompile: () => void;
  onReviewSources: () => void;
  response: ChatTaskResponse | null;
  snapshot: KnowledgeSnapshot | null;
}) {
  const view = relationshipWikiView(response, snapshot);
  const brief = view?.blocks.find((block) => block.kind === "person_brief");
  const review = view?.blocks.find((block) => block.kind === "fact_review");
  const nextMove = view?.blocks.find(
    (block) => block.kind === "action_proposal" || block.kind === "no_action",
  );
  const citationCount = view
    ? new Set(
        view.blocks.flatMap((block) => block.citationDependencyIds),
      ).size
    : 0;
  const briefLines = brief ? bodyLines(brief.body) : [];
  const memorySections = response
    ? []
    : knowledgeSnapshotMemorySections(snapshot);

  return (
    <section
      aria-labelledby="relationship-wiki-title"
      className="context-relationship-wiki"
    >
      <header>
        <div>
          <p className="eyebrow">有来源的关系记录</p>
          <h2 id="relationship-wiki-title">
            沟通要点
          </h2>
        </div>
        {view ? (
          <span>
            <ShieldCheck aria-hidden="true" size={15} weight="duotone" />
            {citationCount} 条来源引用
          </span>
        ) : null}
      </header>

      {view && brief ? (
        <>
          <div className="context-relationship-wiki__grid">
            <article className="context-relationship-wiki__brief">
              <div>
                <span>人物简报</span>
                <i>{brief.status === "needs_review" ? "待审阅" : brief.status === "confirmed" ? "已确认" : "拟议内容"}</i>
              </div>
              {brief.title !== personLabel ? <h3>{brief.title}</h3> : null}
              <ul className="context-relationship-wiki__facts">
                {briefLines.map((line, index) => {
                  const separator = line.indexOf(":");
                  const label = separator > 0 ? line.slice(0, separator) : "";
                  const value =
                    separator > 0 ? line.slice(separator + 1).trim() : line;
                  return (
                    <li key={`${line}:${index}`}>
                      {label ? <strong>{label}</strong> : null}
                      <span>{value}</span>
                    </li>
                  );
                })}
              </ul>
              <footer>
                快照 {view.snapshotId.slice(0, 8)} · 根据当前已授权来源集合编译
              </footer>
            </article>
            <aside>
              {review ? (
                <article data-state="review">
                  <span>需要判断</span>
                  <h3>{review.title}</h3>
                  <p>{review.body}</p>
                  <button onClick={onReviewSources} type="button">
                    审阅来源
                    <ArrowRight aria-hidden="true" size={14} />
                  </button>
                </article>
              ) : null}
              {nextMove ? (
                <article data-state="quiet">
                  <span>下一步</span>
                  <h3>{nextMove.title}</h3>
                  <p>{nextMove.body}</p>
                </article>
              ) : null}
            </aside>
          </div>
          {memorySections.length > 0 ? (
            <div className="context-relationship-memory">
              {memorySections.map((section) => {
                const content = (
                  <ul>
                    {section.blocks.map((block) => (
                      <li data-status={block.status} key={block.id}>
                        <div>
                          <span>{memoryTypeLabel(block.type)}</span>
                          <i>{{ proposed: "待确认", confirmed: "已确认", contested: "存在冲突", expired: "已过期", superseded: "已被更新", deleted: "已删除" }[block.status]}</i>
                        </div>
                        <strong>{block.content.headline}</strong>
                        {block.content.summary ? (
                          <p>{block.content.summary}</p>
                        ) : null}
                        <button onClick={onReviewSources} type="button">
                          {block.dependencies.length} 条来源依赖
                          <ArrowRight aria-hidden="true" size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                );
                return section.key === "history" ? (
                  <details key={section.key}>
                    <summary>
                      <span>
                        <strong>{section.title}</strong>
                        <small>{section.description}</small>
                      </span>
                      <i>{section.blocks.length}</i>
                    </summary>
                    {content}
                  </details>
                ) : (
                  <section
                    aria-labelledby={`memory-${section.key}`}
                    key={section.key}
                  >
                    <header>
                      <div>
                        <h3 id={`memory-${section.key}`}>{section.title}</h3>
                        <p>{section.description}</p>
                      </div>
                      <span>{section.blocks.length}</span>
                    </header>
                    {content}
                  </section>
                );
              })}
            </div>
          ) : null}
        </>
      ) : (
        <div className="context-relationship-wiki__empty">
          <Quotes aria-hidden="true" size={26} weight="duotone" />
          <div>
            <strong>还没有沟通简报</strong>
            <p>
              从已有来源整理要点，待核对内容会单独标明。
            </p>
          </div>
          <button
            className="context-secondary-button"
            disabled={busy}
            onClick={onCompile}
            type="button"
          >
            {busy ? (
              <CircleNotch aria-hidden="true" className="spin" size={17} />
            ) : (
              <Sparkle aria-hidden="true" size={17} weight="fill" />
            )}
            整理简报
          </button>
        </div>
      )}
    </section>
  );
}
