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
    return "Activity recorded";
  }
  const includeYear = date.getUTCFullYear() !== new Date().getUTCFullYear();
  return new Intl.DateTimeFormat("en", {
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
    return "Name match";
  }
  if (match.kind === "confirmed_handle") {
    return `Current ${match.handle_type}: ${match.display_hint}`;
  }
  return `Historical ${match.handle_type}: ${match.display_hint}`;
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
              <p className={styles.eyebrow}>Living relationship directory</p>
              <h1>People</h1>
              <p className={styles.intro}>
                Relationships, with context attached. Find the person and
                reopen the exact evidence—never a lead score or personality
                label.
              </p>
            </div>

            <form action="/workspace/people" className={styles.search}>
              <MagnifyingGlass aria-hidden="true" size={19} />
              <input
                aria-label="Search people by name or confirmed contact handle"
                defaultValue={query}
                maxLength={160}
                name="query"
                placeholder="Find by name, email, or phone…"
                type="search"
              />
              <button type="submit">Search</button>
            </form>
          </section>

          <section className={styles.directory}>
            <header>
              <div>
                <p>{query ? "Search result" : "Recently active"}</p>
                <h2>
                  {query
                    ? `People matching “${query}”`
                    : "Relationships in motion"}
                </h2>
              </div>
              <span>{people.length} visible</span>
            </header>

            {error ? (
              <div className={styles.empty} role="status">
                <span aria-hidden="true">!</span>
                <div>
                  <strong>Directory temporarily unavailable</strong>
                  <p>{error}</p>
                </div>
                {sessionRecoveryHref ? (
                  <Link href={sessionRecoveryHref}>Sign in again</Link>
                ) : null}
              </div>
            ) : people.length === 0 ? (
              <div className={styles.empty}>
                <AddressBook aria-hidden="true" size={24} weight="duotone" />
                <div>
                  <strong>{query ? "No matching person" : "No person yet"}</strong>
                  <p>
                    {query
                      ? "Try a different name, email, or phone. Contact handles stay masked and are searched only when explicitly typed."
                      : "Bring one governed source to create the first relationship page."}
                  </p>
                </div>
                {query ? (
                  <Link href="/workspace/people">Clear search</Link>
                ) : (
                  <Link href="/workspace">Open Agent</Link>
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
                            Updated{" "}
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
                          <span>Relationship context</span>
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
                            <p>No active context</p>
                          )}
                        </div>

                        <dl className={styles.evidence}>
                          <div>
                            <dt>Sources</dt>
                            <dd>{person.capture_count}</dd>
                          </div>
                          <div>
                            <dt>Confirmed IDs</dt>
                            <dd>{person.confirmed_identity_count}</dd>
                          </div>
                        </dl>

                        <Link
                          aria-label={`Open ${person.display_label}`}
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
              <strong>The directory is an index, not a verdict.</strong>
              <p>
                Open a relationship to inspect source words, uncertainty, and
                the recruiter decisions that produced its current state.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
