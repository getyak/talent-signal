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
        "No additional reviewed relationship state is ready yet.",
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
        ? "Resolve conflicting evidence before relying on it"
        : "Review proposed facts before relying on them",
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
      title: nextMove.type === "next_action" ? "Proposed next move" : "No action",
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

  return (
    <section
      aria-labelledby="relationship-wiki-title"
      className="context-relationship-wiki"
    >
      <header>
        <div>
          <p className="eyebrow">RELATIONSHIP WIKI</p>
          <h2 id="relationship-wiki-title">
            What this relationship currently supports.
          </h2>
        </div>
        {view ? (
          <span>
            <ShieldCheck aria-hidden="true" size={15} weight="duotone" />
            {citationCount} governed references
          </span>
        ) : null}
      </header>

      {view && brief ? (
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
              Snapshot {view.snapshotId.slice(0, 8)} · compiled from the current
              authorized source set
            </footer>
          </article>
          <aside>
            {review ? (
              <article data-state="review">
                <span>Needs judgment</span>
                <h3>{review.title}</h3>
                <p>{review.body}</p>
                <button onClick={onReviewSources} type="button">
                  Review source
                  <ArrowRight aria-hidden="true" size={14} />
                </button>
              </article>
            ) : null}
            {nextMove ? (
              <article data-state="quiet">
                <span>Next move</span>
                <h3>{nextMove.title}</h3>
                <p>{nextMove.body}</p>
              </article>
            ) : null}
          </aside>
        </div>
      ) : (
        <div className="context-relationship-wiki__empty">
          <Quotes aria-hidden="true" size={26} weight="duotone" />
          <div>
            <strong>Compile a source-linked view when you need it.</strong>
            <p>
              Confirmed facts, unresolved evidence, sources, and the smallest
              supported next move will stay visibly separate.
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
            Compile Wiki
          </button>
        </div>
      )}
    </section>
  );
}
