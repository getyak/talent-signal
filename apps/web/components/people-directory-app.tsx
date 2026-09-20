import type { PersonDirectoryItem } from "@talent-signal/contracts";
import {
  AddressBook,
  ArrowRight,
  MagnifyingGlass,
  UserPlus,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import styles from "./people-directory-app.module.css";
import { withReturnSession } from "./session-return-navigation";
import { WorkspaceDisconnectedState } from "./workspace-disconnected-state";

type Props = {
  error: string | null;
  people: PersonDirectoryItem[];
  query: string;
  returnSessionId: string | null;
  sessionRecoveryHref: string | null;
};

function initials(label: string) {
  return (
    label
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function formatActivity(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "已有活动记录";
  }
  const includeYear = date.getUTCFullYear() !== new Date().getUTCFullYear();
  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    month: "short",
    ...(includeYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(date);
}

function relationshipHref(
  person: PersonDirectoryItem,
  returnSessionId: string | null,
) {
  const context = person.contexts[0];
  if (!context) {
    return withReturnSession("/workspace?surface=desk", returnSessionId);
  }
  const search = new URLSearchParams({
    context: context.id,
    person: person.id,
  });
  return withReturnSession(`/workspace?${search.toString()}`, returnSessionId);
}

function identityMatchLabel(
  match: PersonDirectoryItem["identity_matches"][number],
) {
  if (match.kind === "name") {
    return "姓名匹配";
  }
  if (match.kind === "confirmed_handle") {
    return `当前 ${match.handle_type}：${match.display_hint}`;
  }
  return `历史 ${match.handle_type}：${match.display_hint}`;
}

function personChange(person: PersonDirectoryItem) {
  const headline = person.profile?.headline;
  if (headline) return headline;
  if (person.contexts.length > 1) {
    return `${person.contexts.length} 个关系情境`;
  }
  if (person.capture_count > 0) {
    return `来源 ${person.capture_count} · 已确认线索 ${person.confirmed_identity_count}`;
  }
  return "暂无已确认的来源";
}

export function PeopleDirectoryApp({
  error,
  people,
  query,
  returnSessionId,
  sessionRecoveryHref,
}: Props) {
  return (
    <div className={styles.shell}>
      <main className={styles.main} id="main-content" tabIndex={-1}>
        <div className={styles.page}>
          <header className={styles.pageHeading}>
            <div>
              <h1>人物</h1>
              <p>
                按已确认线索检索人物，并回到其关系情境与准确证据。
                {returnSessionId
                  ? " 这次选择会保留原对话入口，但不会自动改变对话范围。"
                  : ""}
              </p>
            </div>
            <Link
              className={styles.createPerson}
              href={withReturnSession(
                "/workspace?surface=desk&intent=create-contact",
                returnSessionId,
              )}
            >
              <UserPlus aria-hidden="true" size={16} />
              使用 Agent 新建联系人
            </Link>
          </header>

          <div className={styles.listTools}>
            <form action="/workspace/people" className={styles.search}>
              <MagnifyingGlass aria-hidden="true" size={16} />
              <input
                aria-label="按姓名或已确认联系方式搜索人物"
                defaultValue={query}
                maxLength={160}
                name="query"
                placeholder="按姓名、邮箱或电话查找…"
                type="search"
              />
              {returnSessionId ? (
                <input name="session" type="hidden" value={returnSessionId} />
              ) : null}
            </form>
            <span>{people.length} 位</span>
          </div>

          {error ? (
            <div className={styles.disconnectedState}>
              <WorkspaceDisconnectedState
                description={error}
                hint={
                  sessionRecoveryHref
                    ? "重新登录后会回到同一目录视图；系统不会用陈旧联系人状态替代当前结果。"
                    : "目录不会用旧缓存推断关系状态。排查本地后端后可重试；如果只是继续验证产品闭环，可以先进入冻结边界案例。"
                }
                primaryHref={
                  sessionRecoveryHref
                    ? sessionRecoveryHref
                    : "/workspace/boundaries"
                }
                primaryLabel={sessionRecoveryHref ? "重新登录" : "打开冻结边界案例"}
                secondaryHref="/relationships"
                secondaryLabel="查看关系产品视图"
                title="人物目录暂时不可用。"
              />
            </div>
          ) : people.length === 0 ? (
            <div className={styles.empty}>
              <AddressBook aria-hidden="true" size={24} weight="duotone" />
              <div>
                <strong>{query ? "没有匹配人物" : "还没有人物"}</strong>
                <p>
                  {query
                    ? "请尝试其他姓名、邮箱或电话。联系方式会保持掩码，且只有在你明确输入时才会用于搜索。"
                    : "导入一份受治理的来源，创建第一张关系页面。"}
                </p>
              </div>
              {query ? (
                <Link
                  href={withReturnSession("/workspace/people", returnSessionId)}
                >
                  清除搜索
                </Link>
              ) : (
                <Link
                  href={withReturnSession("/workspace?surface=desk", returnSessionId)}
                >
                  打开智能助理
                </Link>
              )}
            </div>
          ) : (
            <>
              <div aria-hidden="true" className={styles.tableHeader}>
                <span>人物</span>
                <span>关系与最近变化</span>
                <span>更新</span>
              </div>
              <ol className={styles.peopleList}>
                {people.map((person) => {
                  const match = person.identity_matches[0];
                  const context = person.contexts[0];
                  return (
                    <li key={person.id}>
                      <Link
                        className={styles.personRow}
                        href={relationshipHref(person, returnSessionId)}
                      >
                        <span className={styles.personIdentity}>
                          <span aria-hidden="true" className={styles.avatar}>
                            {initials(person.display_label)}
                          </span>
                          <span className={styles.personName}>
                            <strong>{person.display_label}</strong>
                            <small>
                              {match ? identityMatchLabel(match) : person.profile?.headline ?? "身份待补充"}
                            </small>
                          </span>
                        </span>
                        <span className={styles.personChange}>
                          <span className={styles.contextLabel}>
                            {context?.display_label ?? "没有活跃情境"}
                          </span>
                          <small>{personChange(person)}</small>
                        </span>
                        <span className={styles.personMeta}>
                          <time dateTime={person.last_activity_at}>
                            {formatActivity(person.last_activity_at)}
                          </time>
                          <ArrowRight aria-hidden="true" size={15} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
