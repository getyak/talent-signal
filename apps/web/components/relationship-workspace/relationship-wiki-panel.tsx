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

export function RelationshipWikiPanel({
  busy,
  onCompile,
  onReviewSources,
  response,
  snapshot,
}: {
  busy: boolean;
  onCompile: () => void;
  onReviewSources: () => void;
  response: ChatTaskResponse | null;
  snapshot: KnowledgeSnapshot | null;
}) {
  const view: RelationshipWikiView | null = response
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
          <p className="eyebrow">关系 MEMORY</p>
          <h2 id="relationship-wiki-title">
            记住会改变下一次沟通的内容，而不是堆积一份人物百科。
          </h2>
        </div>
        {view ? (
          <span>
            <ShieldCheck aria-hidden="true" size={15} weight="duotone" />
            {citationCount} 条受治理引用
          </span>
        ) : null}
      </header>

      {view && brief ? (
        <>
          <div className="context-relationship-wiki__grid">
            <article className="context-relationship-wiki__brief">
              <div>
                <span>{brief.kind.replaceAll("_", " ")}</span>
                <i>{brief.status.replaceAll("_", " ")}</i>
              </div>
              <h3>{brief.title}</h3>
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
                          <i>{block.status.replaceAll("_", " ")}</i>
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
            <strong>需要时再编译一份关联来源的视图。</strong>
            <p>
              已确认事实、未解决证据、来源与有依据的最小下一步会清晰分离。
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
            编译 Memory
          </button>
        </div>
      )}
    </section>
  );
}
