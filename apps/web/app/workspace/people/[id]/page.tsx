import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { MemoryReviewCard } from "@/components/memory-review/memory-review-card";
import { PersonDirectoryAvatar } from "@/components/person-directory-avatar";
import {
  validReturnSessionId,
  withReturnSession,
} from "@/components/session-return-navigation";
import {
  backendSessionRecoveryHref,
  isBackendSessionExpiredError,
} from "@/lib/backend-session";
import { isIntegrationMode, loadPersonMemory } from "@/lib/server/localBackend";
import { contactHandoffSessionVersion } from "@/lib/server/contact-handoff-session";
import { mintMemoryEntryCapability } from "@/lib/server/memoryEntryCapability";
import { readBackendSessionClaims } from "@/lib/server/backendAuth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "人物 · Talent Signal",
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SCOPE_LABELS: Record<string, string> = {
  self: "关于我",
  person: "关于对方",
  relationship: "我们之间",
};

export default async function PersonMemoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const { id } = await params;
  const returnSessionId = validReturnSessionId((await searchParams).session);
  const href = withReturnSession(`/workspace/people/${id}`, returnSessionId);
  const session = await auth();
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(href)}`);
  }
  if (!isIntegrationMode()) {
    redirect("/workspace");
  }
  if (!UUID.test(id)) {
    return (
      <section className="workspace-section" aria-labelledby="person-invalid">
        <h1 id="person-invalid">人物不可用</h1>
        <p>这个人物标识无效。</p>
        <Link href={withReturnSession("/workspace/people", returnSessionId)}>
          返回人物目录
        </Link>
      </section>
    );
  }

  const claims = await readBackendSessionClaims();
  if (!claims) {
    redirect(backendSessionRecoveryHref(href));
  }
  const binding = contactHandoffSessionVersion(claims);
  const entryCapability = mintMemoryEntryCapability(claims, {
    purpose: "people",
    personId: id,
  });

  let data: Awaited<ReturnType<typeof loadPersonMemory>> | null = null;
  let error: string | null = null;
  try {
    data = await loadPersonMemory(id);
  } catch (caught) {
    error = isBackendSessionExpiredError(caught)
      ? "登录已过期，请重新登录后查看这个人物。"
      : "无法读取这个人物的记忆；系统不会用缓存或示例内容代替。";
  }

  if (!data) {
    return (
      <section className="workspace-section" aria-labelledby="person-unavailable">
        <h1 id="person-unavailable">人物记忆不可用</h1>
        <p role="alert">{error}</p>
        <Link href={withReturnSession("/workspace/people", returnSessionId)}>
          返回人物目录
        </Link>
      </section>
    );
  }

  const { person, proposals, items } = data;
  const grouped = new Map<string, typeof items>();
  for (const item of items) {
    const list = grouped.get(item.scope) ?? [];
    list.push(item);
    grouped.set(item.scope, list);
  }

  return (
    <div className="workspace-section">
      <header className="context-contact-header">
        <PersonDirectoryAvatar
          className="context-contact-header__avatar"
          label={person?.display_label ?? "人物"}
          url={person?.avatar?.url ?? null}
        />
        <div className="context-contact-header__identity">
          <h1>{person?.display_label ?? "人物"}</h1>
          <p>
            {person?.identity_matches[0]
              ? "已确认的联系方式"
              : person?.profile?.headline ?? "身份线索待补充"}
          </p>
        </div>
      </header>

      {person && person.contexts.length > 0 ? (
        <nav aria-label="关系情境">
          <p>关系情境</p>
          <ul>
            {person.contexts.map((context) => (
              <li key={context.id}>
                <Link
                  href={withReturnSession(
                    `/workspace?person=${encodeURIComponent(person.id)}&context=${encodeURIComponent(context.id)}`,
                    returnSessionId,
                  )}
                >
                  {context.display_label ?? "关系情境"}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : (
        <p>
          {person
            ? "这个人还没有关系情境；先从这里查看人物记忆，或在对话中建立关系。"
            : "人物目录暂时没有这个人的条目。"}
        </p>
      )}

      <section aria-labelledby="person-memory-pending">
        <h2 id="person-memory-pending">待确认变化</h2>
        {proposals.length === 0 ? (
          <p>没有等待确认的变化。</p>
        ) : (
          proposals.map((proposal) => (
            <MemoryReviewCard
              binding={binding}
              contextId={proposal.relationship_context_id ?? null}
              entryCapability={entryCapability}
              key={proposal.proposal_id}
              personId={person?.id ?? id}
              proposal={{ proposal_id: proposal.proposal_id, revision: proposal.revision }}
              purpose="people"
            />
          ))
        )}
      </section>

      <section aria-labelledby="person-memory-accepted">
        <h2 id="person-memory-accepted">已保存的记忆</h2>
        {items.length === 0 ? (
          <p>还没有在这个人物上保存记忆。</p>
        ) : (
          Array.from(grouped.entries()).map(([scope, scopeItems]) => (
            <article key={scope}>
              <h3>{SCOPE_LABELS[scope] ?? scope}</h3>
              <ul>
                {scopeItems.map((item) => (
                  <li key={item.id}>
                    <p>{item.display_text}</p>
                    <small>
                      {item.statement_kind === "source_statement"
                        ? `来源陈述${item.speaker ? ` · ${item.speaker}` : ""}`
                        : item.statement_kind === "user_opinion"
                          ? "用户观点"
                          : "已保存事实"}
                    </small>
                  </li>
                ))}
              </ul>
            </article>
          ))
        )}
      </section>

      <p>
        <Link href={withReturnSession("/workspace/people", returnSessionId)}>
          返回人物目录
        </Link>
      </p>
    </div>
  );
}
