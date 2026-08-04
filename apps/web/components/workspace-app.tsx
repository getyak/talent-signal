"use client";

import {
  ArrowSquareOut,
  CalendarBlank,
  CardsThree,
  ClockCounterClockwise,
  ListBullets,
  MagnifyingGlass,
  NotePencil,
  SignOut,
  UsersThree,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { signOutOfWorkspace } from "@/app/login/actions";
import {
  candidateRecords,
  type CandidateRecord,
} from "@/lib/candidates";
import { BrandMark } from "./brand-mark";
import { ThemeToggle } from "./theme-toggle";

type CandidateView = "card" | "list";

function initialsForUser(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.split("@")[0] || "TS";
  return source
    .split(/[\s._-]+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function CandidateCollectionItem({
  candidate,
  selected,
  view,
  onSelect,
}: {
  candidate: CandidateRecord;
  onSelect: () => void;
  selected: boolean;
  view: CandidateView;
}) {
  return (
    <article
      className="workspace-candidate"
      data-selected={selected}
      data-view={view}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        aria-label={`Open ${candidate.name}`}
      >
        <span className="candidate-avatar">{candidate.initials}</span>
        <span className="workspace-candidate__identity">
          <strong>{candidate.name}</strong>
          <small>
            {candidate.role}, {candidate.company}
          </small>
        </span>
        <span className="workspace-candidate__signal">
          <small>{candidate.verdict}</small>
          <strong>{candidate.currentSignal}</strong>
        </span>
        <span className="candidate-tags">
          {candidate.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </span>
        <span className="workspace-candidate__time">
          <small>{candidate.lastInteraction}</small>
          <strong>{candidate.nextDue}</strong>
        </span>
      </button>
    </article>
  );
}

export function WorkspaceApp({
  user,
}: {
  user: { email?: string | null; name?: string | null };
}) {
  const [view, setView] = useState<CandidateView>("card");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(candidateRecords[0].id);
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(
    candidateRecords[0].timeline[0].id,
  );

  const visibleCandidates = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return candidateRecords;
    }

    return candidateRecords.filter((candidate) =>
      [
        candidate.name,
        candidate.role,
        candidate.company,
        ...candidate.tags,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [query]);

  const selectedCandidate =
    candidateRecords.find((candidate) => candidate.id === selectedId) ??
    candidateRecords[0];

  return (
    <div className="workspace">
      <aside className="workspace-sidebar">
        <div className="workspace-sidebar__brand">
          <BrandMark compact />
          <span>Talent Signal</span>
        </div>
        <nav aria-label="Workspace">
          <a href="#today">
            <CalendarBlank aria-hidden="true" size={18} />
            Today
          </a>
          <a href="#candidate-library" aria-current="page">
            <UsersThree aria-hidden="true" size={18} />
            Candidates
          </a>
          <Link href="/demo">
            <NotePencil aria-hidden="true" size={18} />
            Evidence review
          </Link>
        </nav>
        <div className="workspace-sidebar__foot">
          <Link href="/">
            <ArrowSquareOut aria-hidden="true" size={17} />
            Product site
          </Link>
          <form action={signOutOfWorkspace}>
            <button type="submit">
              <SignOut aria-hidden="true" size={17} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="workspace-stage">
        <header className="workspace-topbar">
          <div>
            <span>Sample workspace</span>
            <p>Candidate knowledge</p>
          </div>
          <div className="workspace-user">
            <ThemeToggle />
            <span>{initialsForUser(user.name, user.email)}</span>
            <div>
              <strong>{user.name ?? "Recruiter"}</strong>
              <small>{user.email ?? "Signed in"}</small>
            </div>
          </div>
        </header>

        <main id="main-content" className="workspace-main">
          <section id="today" className="workspace-context">
            <p>Today</p>
            <h1>One clear move for every active relationship.</h1>
            <span>
              Review the evidence, resolve the blocker, and leave the history
              intact.
            </span>
          </section>

          <section
            id="candidate-library"
            className="workspace-library"
            aria-labelledby="candidate-library-title"
          >
            <header className="workspace-library__header">
              <div>
                <p>Living pages</p>
                <h2 id="candidate-library-title">Candidates</h2>
              </div>
              <div className="workspace-tools">
                <label className="workspace-search">
                  <MagnifyingGlass aria-hidden="true" size={17} />
                  <span className="sr-only">Search candidates</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search name, role, or signal"
                  />
                </label>
                <div className="view-switch" aria-label="Candidate view">
                  <button
                    type="button"
                    data-active={view === "card"}
                    aria-pressed={view === "card"}
                    onClick={() => setView("card")}
                  >
                    <CardsThree aria-hidden="true" size={16} />
                    Cards
                  </button>
                  <button
                    type="button"
                    data-active={view === "list"}
                    aria-pressed={view === "list"}
                    onClick={() => setView("list")}
                  >
                    <ListBullets aria-hidden="true" size={16} />
                    List
                  </button>
                </div>
              </div>
            </header>

            <div className="workspace-library__body">
              <div
                className="workspace-candidates"
                data-view={view}
                aria-live="polite"
              >
                {visibleCandidates.length > 0 ? (
                  visibleCandidates.map((candidate) => (
                    <CandidateCollectionItem
                      candidate={candidate}
                      key={candidate.id}
                      selected={candidate.id === selectedCandidate.id}
                      view={view}
                      onSelect={() => {
                        setSelectedId(candidate.id);
                        setExpandedSourceId(candidate.timeline[0]?.id ?? null);
                      }}
                    />
                  ))
                ) : (
                  <div className="workspace-empty">
                    <MagnifyingGlass aria-hidden="true" size={24} />
                    <h3>No candidate matches this search.</h3>
                    <p>Try a name, role, company, or current signal.</p>
                  </div>
                )}
              </div>

              <aside
                className="candidate-page"
                aria-label={`${selectedCandidate.name} candidate page`}
              >
                <header className="candidate-page__identity">
                  <span className="candidate-avatar candidate-avatar--large">
                    {selectedCandidate.initials}
                  </span>
                  <div>
                    <p>Candidate page</p>
                    <h2>{selectedCandidate.name}</h2>
                    <span>
                      {selectedCandidate.role}, {selectedCandidate.company}
                    </span>
                  </div>
                </header>

                <section className="candidate-page__decision">
                  <div>
                    <span>{selectedCandidate.verdict}</span>
                    <small>{selectedCandidate.nextDue}</small>
                  </div>
                  <h3>{selectedCandidate.nextAction}</h3>
                  <p>{selectedCandidate.currentSignal}</p>
                  <Link href="/demo">Review proposed action</Link>
                </section>

                <section className="candidate-page__facts">
                  <header>
                    <h3>Current facts</h3>
                    <span>{selectedCandidate.facts.length} source-linked</span>
                  </header>
                  {selectedCandidate.facts.map((fact) => (
                    <div key={fact.label}>
                      <span>{fact.label}</span>
                      <strong>{fact.value}</strong>
                      <small data-state={fact.provenance}>
                        {fact.provenance}
                      </small>
                    </div>
                  ))}
                </section>

                <section className="candidate-page__timeline">
                  <header>
                    <h3>History</h3>
                    <ClockCounterClockwise
                      aria-hidden="true"
                      size={17}
                    />
                  </header>
                  {selectedCandidate.timeline.map((event) => {
                    const expanded = expandedSourceId === event.id;
                    return (
                      <article key={event.id}>
                        <div>
                          <span>{event.state}</span>
                          <small>{event.time}</small>
                        </div>
                        <h4>{event.title}</h4>
                        <p>{event.actor}</p>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          onClick={() =>
                            setExpandedSourceId(expanded ? null : event.id)
                          }
                        >
                          {expanded ? "Hide source" : "View source"}
                        </button>
                        {expanded && <blockquote>{event.source}</blockquote>}
                      </article>
                    );
                  })}
                </section>
              </aside>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
