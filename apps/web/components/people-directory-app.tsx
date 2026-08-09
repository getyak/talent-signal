import type { PersonDirectoryItem } from "@talent-signal/contracts";
import {
  AddressBook,
  ArrowRight,
  ChatCircleDots,
  FileImage,
  House,
  MagnifyingGlass,
  Plus,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { ThemeToggle } from "./theme-toggle";
import styles from "./people-directory-app.module.css";

type Props = {
  error: string | null;
  people: PersonDirectoryItem[];
  query: string;
  user: {
    email?: string | null;
    name?: string | null;
  };
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

export function PeopleDirectoryApp({ error, people, query, user }: Props) {
  const accountLabel = user.name ?? "Recruiter";

  return (
    <div className={`context-workspace ${styles.shell}`}>
      <aside className="context-sidebar">
        <Link
          aria-label="Talent Signal home"
          className="context-brand"
          href="/"
        >
          <span aria-hidden="true">TS</span>
          <strong>Talent Signal</strong>
        </Link>

        <nav aria-label="Workspace navigation" className="context-nav">
          <Link aria-label="Relationship Agent" href="/workspace">
            <House aria-hidden="true" size={19} weight="duotone" />
            Agent
          </Link>
          <Link
            aria-current="page"
            aria-label="People directory"
            href="/workspace/people"
          >
            <AddressBook aria-hidden="true" size={19} weight="duotone" />
            People
          </Link>
          <Link
            aria-label="Governed sources"
            href="/workspace#relationship-resources"
          >
            <FileImage aria-hidden="true" size={19} weight="duotone" />
            Sources
          </Link>
        </nav>

        <Link
          aria-label="Add a governed source"
          className="context-new-capture"
          href="/workspace"
        >
          <Plus aria-hidden="true" size={18} />
          Add source
        </Link>

        <div className="context-sidebar__section">
          <div>
            <span>Directory</span>
          </div>
          <p className="context-sidebar__empty">
            Account-scoped people and their active relationship contexts.
          </p>
        </div>

        <div className="context-sidebar__account">
          <span>{initials(accountLabel)}</span>
          <p>
            <strong>{accountLabel}</strong>
            <small>{user.email ?? "Authenticated account"}</small>
          </p>
          <ThemeToggle />
        </div>
      </aside>

      <main className={styles.main} id="main-content">
        <header className={styles.topbar}>
          <p>
            Workspace <span>/</span> People
          </p>
          <div>
            <ShieldCheck aria-hidden="true" size={16} weight="duotone" />
            Account only
          </div>
        </header>

        <div className={styles.page}>
          <section className={styles.hero}>
            <div>
              <p className={styles.eyebrow}>Living relationship directory</p>
              <h1>People, with the context still attached.</h1>
              <p className={styles.intro}>
                Find the person, see the relationship in motion, and reopen the
                exact evidence. No lead score. No personality label.
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
