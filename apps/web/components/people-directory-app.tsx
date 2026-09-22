import type { PersonDirectoryItem } from "@talent-signal/contracts";
import {
  AddressBook,
  ArrowRight,
  MagnifyingGlass,
  UserPlus,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import Form from "next/form";

import styles from "./people-directory-app.module.css";
import { withReturnSession } from "./session-return-navigation";
import { PersonDirectoryAvatar } from "./person-directory-avatar";
import { WorkspaceDisconnectedState } from "./workspace-disconnected-state";

type Props = {
  error: string | null;
  people: PersonDirectoryItem[];
  query: string;
  returnSessionId: string | null;
  sessionRecoveryHref: string | null;
};

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
  // The production person-only route retains the person id even when no
  // relationship context exists; existing contexts link from that page.
  return withReturnSession(
    `/workspace/people/${encodeURIComponent(person.id)}`,
    returnSessionId,
  );
}

function identityHandleLabel(type: string) {
  const labels: Record<string, string> = {
    email: "邮箱", phone: "电话", wechat: "微信", linkedin_url: " LinkedIn",
    public_profile_url: "公开主页", source_native_id: "来源标识",
  };
  return labels[type] ?? "联系方式";
}

function identityMatchLabel(
  match: PersonDirectoryItem["identity_matches"][number],
) {
  if (match.kind === "name") {
    return "姓名匹配";
  }
  if (match.kind === "confirmed_handle") {
    return `当前${identityHandleLabel(match.handle_type)}：${match.display_hint}`;
  }
  return `历史${identityHandleLabel(match.handle_type)}：${match.display_hint}`;
}

function personChange(person: PersonDirectoryItem) {
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
                查找你认识的人，回顾沟通与下一步。
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
              添加联系人
            </Link>
          </header>

          <div className={styles.listTools}>
            <Form action="/workspace/people" className={styles.search} scroll={false}>
              <MagnifyingGlass aria-hidden="true" size={16} />
              <input
                aria-label="按姓名或已确认联系方式搜索人物"
                defaultValue={query}
                key={query}
                maxLength={160}
                name="query"
                placeholder="按姓名、邮箱或电话查找…"
                type="search"
              />
              {returnSessionId ? (
                <input name="session" type="hidden" value={returnSessionId} />
              ) : null}
              <button aria-label="搜索人物" type="submit">
                <ArrowRight aria-hidden="true" size={15} />
              </button>
            </Form>
            <span aria-live="polite">{error ? "暂不可用" : `${people.length} 位${query ? "匹配人物" : "人物"}`}</span>
          </div>

          {error ? (
            <div className={styles.disconnectedState}>
              <WorkspaceDisconnectedState
                description={error}
                hint={
                  sessionRecoveryHref
                    ? "重新登录后会回到同一目录视图；系统不会用陈旧联系人状态替代当前结果。"
                    : "请稍后重新载入；你的联系人和已保存的来源不会因此丢失。"
                }
                primaryHref={
                  sessionRecoveryHref
                    ? sessionRecoveryHref
                    : withReturnSession(`/workspace/people${query ? `?query=${encodeURIComponent(query)}` : ""}`, returnSessionId)
                }
                primaryLabel={sessionRecoveryHref ? "重新登录" : "重新载入"}
                secondaryHref="/workspace"
                secondaryLabel="返回对话"
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
                    : "从一段聊天或人物介绍开始，整理你的第一位联系人。"}
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
                  添加第一位联系人
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
                          <PersonDirectoryAvatar
                            className={styles.avatar}
                            label={person.display_label}
                            url={person.avatar?.url ?? null}
                          />
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
