import type { PersonDirectoryItem } from "@talent-signal/contracts";
import {
  AddressBook,
  ArrowRight,
  ChatCircleDots,
  MagnifyingGlass,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import styles from "./people-directory-app.module.css";

type Props = {
  error: string | null;
  people: PersonDirectoryItem[];
  query: string;
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

function relationshipHref(person: PersonDirectoryItem) {
  const context = person.contexts[0];
  if (!context) {
    return "/workspace";
  }
  const search = new URLSearchParams({
    context: context.id,
    person: person.id,
  });
  return `/workspace?${search.toString()}`;
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

export function PeopleDirectoryApp({
  error,
  people,
  query,
  sessionRecoveryHref,
}: Props) {
  return (
    <div className={styles.shell}>
      <main className={styles.main} id="main-content">
        <div className={styles.page}>
          <section className={styles.hero}>
            <div>
              <p className={styles.eyebrow}>关系目录</p>
              <h1>联系人</h1>
              <p className={styles.intro}>
                按已确认线索检索联系人，并回到其关系情境与准确证据。
              </p>
            </div>

            <form action="/workspace/people" className={styles.search}>
              <MagnifyingGlass aria-hidden="true" size={19} />
              <input
                aria-label="按姓名或已确认联系方式搜索联系人"
                defaultValue={query}
                maxLength={160}
                name="query"
                placeholder="按姓名、邮箱或电话查找…"
                type="search"
              />
              <button type="submit">搜索</button>
            </form>
          </section>

          <section className={styles.directory}>
            <header>
              <div>
                <p>{query ? "搜索结果" : "联系人视图"}</p>
                <h2>
                  {query
                    ? `与“${query}”匹配的联系人`
                    : "近期活跃"}
                </h2>
              </div>
              <span>显示 {people.length} 人</span>
            </header>

            {error ? (
              <div className={styles.empty} role="status">
                <span aria-hidden="true">!</span>
                <div>
                  <strong>目录暂时不可用</strong>
                  <p>{error}</p>
                </div>
                {sessionRecoveryHref ? (
                  <Link href={sessionRecoveryHref}>重新登录</Link>
                ) : null}
              </div>
            ) : people.length === 0 ? (
              <div className={styles.empty}>
                <AddressBook aria-hidden="true" size={24} weight="duotone" />
                <div>
                  <strong>{query ? "没有匹配联系人" : "还没有联系人"}</strong>
                  <p>
                    {query
                      ? "请尝试其他姓名、邮箱或电话。联系方式会保持掩码，且只有在你明确输入时才会用于搜索。"
                      : "导入一份受治理的来源，创建第一张关系页面。"}
                  </p>
                </div>
                {query ? (
                  <Link href="/workspace/people">清除搜索</Link>
                ) : (
                  <Link href="/workspace">打开智能助理</Link>
                )}
              </div>
            ) : (
              <ol className={styles.peopleList}>
                {people.map((person) => {
                  const href = relationshipHref(person);
                  return (
                    <li key={person.id}>
                      <article className={styles.personCard}>
                        <span
                          aria-hidden="true"
                          className={styles.avatar}
                        >
                          {initials(person.display_label)}
                        </span>

                        <div className={styles.personIdentity}>
                          <h3>{person.display_label}</h3>
                          <span>
                            更新于{" "}
                            <time dateTime={person.last_activity_at}>
                              {formatActivity(person.last_activity_at)}
                            </time>
                          </span>
                          {person.identity_matches.length > 0 ? (
                            <ul className={styles.matchReasons}>
                              {person.identity_matches.map((match) => (
                                <li
                                  data-kind={match.kind}
                                  key={identityMatchLabel(match)}
                                >
                                  {identityMatchLabel(match)}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>

                        <div className={styles.contexts}>
                          <span>关系情境</span>
                          {person.contexts.length > 0 ? (
                            <ul>
                              {person.contexts.slice(0, 3).map((context) => (
                                <li key={context.id}>
                                  <Link
                                    href={`/workspace?person=${encodeURIComponent(person.id)}&context=${encodeURIComponent(context.id)}`}
                                  >
                                    {context.display_label}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p>没有活跃情境</p>
                          )}
                        </div>

                        <dl className={styles.evidence}>
                          <div>
                            <dt>来源</dt>
                            <dd>{person.capture_count}</dd>
                          </div>
                          <div>
                            <dt>已确认身份线索</dt>
                            <dd>{person.confirmed_identity_count}</dd>
                          </div>
                        </dl>

                        <Link
                          aria-label={`打开 ${person.display_label}`}
                          className={styles.openPerson}
                          href={href}
                        >
                          <ArrowRight aria-hidden="true" size={18} />
                        </Link>
                      </article>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <aside className={styles.methodNote}>
            <ChatCircleDots aria-hidden="true" size={20} weight="duotone" />
            <div>
              <strong>目录是索引，不是结论。</strong>
              <p>
                打开一段关系，检查来源原话、不确定性，以及形成当前状态的招聘顾问决定。
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
