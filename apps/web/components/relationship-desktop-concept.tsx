"use client";

import {
  AddressBook,
  ArrowCounterClockwise,
  ArrowRight,
  Briefcase,
  CalendarBlank,
  CaretRight,
  Check,
  CheckCircle,
  Clock,
  Command,
  MagnifyingGlass,
  Microphone,
  NotePencil,
  Plus,
  Quotes,
  ShieldCheck,
  UsersThree,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";

import { BrandMark } from "./brand-mark";
import { ThemeToggle } from "./theme-toggle";
import styles from "./relationship-desktop-concept.module.css";

type Surface = "today" | "people" | "searches";
type ReviewDecision = "dismissed" | "kept" | "proposed";

type Person = {
  action: string;
  avatar?: string;
  commitment: string;
  commitmentDue: string;
  company: string;
  context: string;
  dependency: string;
  due: string;
  evidence: string;
  id: string;
  initials: string;
  name: string;
  nextValue: string;
  owner: string;
  previousValue: string;
  provenance: string;
  protectedOutcome: string;
  recency: string;
  role: string;
  state: "changed" | "identity" | "quiet" | "review" | "waiting";
  waitingOn: string;
};

type Search = {
  action: string;
  client: string;
  commitment: string;
  commitmentDue: string;
  evidence: string;
  headline: string;
  id: string;
  name: string;
  note: string;
  participants: Array<{
    initials: string;
    name: string;
    position: string;
    role: string;
    state: string;
  }>;
  protectedOutcome: string;
  sourceA: string;
  sourceB: string;
};

const PEOPLE: Person[] = [
  {
    action: "Ask the client one exact remote-policy question.",
    avatar: "/concepts/relationships/avatars/leila.webp",
    commitment: "Return with the client answer",
    commitmentDue: "Due Friday",
    company: "Independent",
    context: "Chief Product Officer search",
    dependency: "One client answer is holding her decision.",
    due: "Today",
    evidence: "I can make a final decision Friday. Remote from Singapore is the part I still need to understand.",
    id: "leila",
    initials: "LH",
    name: "Leila Hartmann",
    nextValue: "Full-time relocation remains unresolved",
    owner: "You",
    previousValue: "Remote policy assumed flexible",
    provenance: "WhatsApp screenshot / Thu 22:18 / recruiter reviewed",
    protectedOutcome: "Protect Leila's decision window",
    recency: "2h",
    role: "VP Product",
    state: "changed",
    waitingOn: "Waiting on confirmed policy",
  },
  {
    action: "Ask Nia which travel cadence is current.",
    avatar: "/concepts/relationships/avatars/nia.webp",
    commitment: "Clarify the travel contradiction",
    commitmentDue: "Due today",
    company: "Portfolio relationship",
    context: "Board director search",
    dependency: "Two sources disagree on travel limits.",
    due: "Within 5 hours",
    evidence: "Monthly travel is workable, but I would not want a weekly international cadence.",
    id: "nia",
    initials: "NW",
    name: "Nia Williams",
    nextValue: "Monthly possible, weekly international travel declined",
    owner: "You",
    previousValue: "Quarterly travel only",
    provenance: "Call note / Fri 08:40 / conflicts with Jul 19 email",
    protectedOutcome: "Protect Nia from a repeated question",
    recency: "5h",
    role: "Independent board director",
    state: "review",
    waitingOn: "Waiting on one current answer",
  },
  {
    action: "Confirm one timezone before scheduling.",
    avatar: "/concepts/relationships/avatars/maya.webp",
    commitment: "Return with a confirmed timezone",
    commitmentDue: "Due tomorrow",
    company: "Northlight Capital",
    context: "Fractional CFO search",
    dependency: "The founder meeting is ready to schedule.",
    due: "Tomorrow",
    evidence: "I can meet the founder next Tuesday if we settle the timezone.",
    id: "maya",
    initials: "MO",
    name: "Maya Ortiz",
    nextValue: "Tuesday offered, timezone unresolved",
    owner: "Founder",
    previousValue: "Meeting not scheduled",
    provenance: "Recruiter note / Thu 17:20 / draft context",
    protectedOutcome: "Protect Maya from a failed calendar handoff",
    recency: "1d",
    role: "Operating Partner",
    state: "waiting",
    waitingOn: "Waiting on timezone confirmation",
  },
  {
    action: "Wait for the board response.",
    avatar: "/concepts/relationships/avatars/amir.webp",
    commitment: "Wait for the board response",
    commitmentDue: "No reminder due",
    company: "Rubicon Health",
    context: "CTO succession",
    dependency: "No decision-relevant change. No action suggested.",
    due: "No due date",
    evidence: "Let's hold here until the board has aligned on the mandate.",
    id: "amir",
    initials: "AO",
    name: "Amir Okafor",
    nextValue: "No action until the board responds",
    owner: "Board",
    previousValue: "Follow-up considered",
    provenance: "Email / Sun 14:05 / recruiter reviewed",
    protectedOutcome: "Protect Amir from premature follow-up",
    recency: "4d",
    role: "VP Engineering",
    state: "quiet",
    waitingOn: "Quiet until the mandate changes",
  },
  {
    action: "Resolve identity before attaching this source.",
    commitment: "Leave the source unresolved",
    commitmentDue: "No due date",
    company: "Independent",
    context: "Leadership network",
    dependency: "Identity evidence is not sufficient.",
    due: "No due date",
    evidence: "The card contains a name and title, but no current verified contact clue.",
    id: "zhang",
    initials: "伟",
    name: "张伟 / Wei Zhang-Sørensen",
    nextValue: "Unresolved identity review",
    owner: "You",
    previousValue: "Possible match only",
    provenance: "Imported contact card / July 24 / unresolved identity",
    protectedOutcome: "Protect the wrong person from attachment",
    recency: "2w",
    role: "Chief People Officer",
    state: "identity",
    waitingOn: "Waiting on identity evidence",
  },
];

const SEARCHES: Search[] = [
  {
    action: "Confirm Meridian Labs' acceptable location policy.",
    client: "Meridian Labs",
    commitment: "Return with the client answer",
    commitmentDue: "Due Friday",
    evidence: "The role brief says hybrid. The latest client call does not confirm whether Singapore-based remote work is acceptable.",
    headline: "One missing answer currently determines the pace.",
    id: "cpo",
    name: "Chief Product Officer",
    note: "Remote policy needs one current owner before Leila's Friday decision.",
    participants: [
      {
        initials: "LH",
        name: "Leila Hartmann",
        position: "Decision Friday; remote policy unresolved",
        role: "Candidate",
        state: "Current dependency",
      },
      {
        initials: "AO",
        name: "Ana Oliveira",
        position: "Owns the acceptable-location answer",
        role: "Chief executive",
        state: "Answer needed",
      },
      {
        initials: "JL",
        name: "Jordan Lee",
        position: "Prepared to carry the exact question",
        role: "Lead partner",
        state: "Recruiter owned",
      },
    ],
    protectedOutcome: "Protect Leila's decision window",
    sourceA: "Role brief / July 22",
    sourceB: "Client call / August 6",
  },
  {
    action: "Resolve Northlight's current travel cadence.",
    client: "Northlight Capital",
    commitment: "Resolve the travel contradiction",
    commitmentDue: "Due before the board brief",
    evidence: "The July email says quarterly travel. Nia's latest call says monthly travel is workable, but weekly international travel is not.",
    headline: "Travel evidence needs one human resolution.",
    id: "board",
    name: "Board director",
    note: "Nia's current travel limit conflicts with an earlier email.",
    participants: [
      {
        initials: "NW",
        name: "Nia Williams",
        position: "Monthly travel possible, weekly cadence declined",
        role: "Candidate",
        state: "Needs review",
      },
      {
        initials: "PR",
        name: "Priya Raman",
        position: "Owns the board meeting sequence",
        role: "Board chair",
        state: "Waiting",
      },
    ],
    protectedOutcome: "Keep Nia out of an avoidable repeat question",
    sourceA: "Candidate email / July 19",
    sourceB: "Call note / August 7",
  },
  {
    action: "Confirm one timezone before the Apex founder meeting.",
    client: "Apex Systems",
    commitment: "Return with one confirmed timezone",
    commitmentDue: "Due before scheduling",
    evidence: "The candidate offered next Tuesday. Neither the calendar note nor the recruiter note records a timezone.",
    headline: "The next conversation is ready once timing is confirmed.",
    id: "staff-pm",
    name: "Staff Product Manager",
    note: "Maya offered Tuesday. The source does not specify a timezone.",
    participants: [
      {
        initials: "MO",
        name: "Maya Ortiz",
        position: "Tuesday offered; timezone unresolved",
        role: "Candidate",
        state: "Waiting",
      },
    ],
    protectedOutcome: "Protect Maya from a failed calendar handoff",
    sourceA: "Candidate message / August 6",
    sourceB: "Recruiter note / August 7",
  },
];

const STATE_LABELS: Record<Person["state"], string> = {
  changed: "Changed",
  identity: "Identity review",
  quiet: "No action",
  review: "Needs review",
  waiting: "Waiting",
};

function Avatar({ person, size = "medium" }: { person: Person; size?: "large" | "medium" | "small" }) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.avatar} ${styles[`avatar${size[0].toUpperCase()}${size.slice(1)}`]}`}
    >
      {person.avatar ? (
        <Image
          alt=""
          fill
          sizes={size === "large" ? "76px" : size === "small" ? "36px" : "48px"}
          src={person.avatar}
        />
      ) : (
        person.initials
      )}
    </span>
  );
}

function DeskNavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={styles.railButton}
      data-active={active}
      onClick={onClick}
      type="button"
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}

export function RelationshipDesktopConcept() {
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const [evidenceReturnFocusTarget, setEvidenceReturnFocusTarget] = useState<HTMLElement | null>(null);
  const [evidenceSession, setEvidenceSession] = useState(0);
  const [surface, setSurface] = useState<Surface>("today");
  const [selectedPersonId, setSelectedPersonId] = useState("leila");
  const [selectedSearchId, setSelectedSearchId] = useState("cpo");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<ReviewDecision>("proposed");
  const [proposedValue, setProposedValue] = useState(PEOPLE[0].nextValue);
  const [actionStaged, setActionStaged] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [commandText, setCommandText] = useState("");
  const [commandReceipt, setCommandReceipt] = useState("");

  const selectedPerson =
    PEOPLE.find((person) => person.id === selectedPersonId) ?? PEOPLE[0];
  const selectedSearch =
    SEARCHES.find((search) => search.id === selectedSearchId) ?? SEARCHES[0];
  const filteredPeople = useMemo(() => {
    const query = peopleQuery.trim().toLocaleLowerCase();
    if (!query) return PEOPLE;
    return PEOPLE.filter((person) =>
      [person.name, person.role, person.company, person.context]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [peopleQuery]);

  function chooseSurface(nextSurface: Surface) {
    setSurface(nextSurface);
    setEvidenceOpen(false);
    setCommandReceipt("");
    if (nextSurface === "searches") {
      const matchingSearchId =
        selectedPersonId === "nia"
          ? "board"
          : selectedPersonId === "maya"
            ? "staff-pm"
            : "cpo";
      setSelectedSearchId(matchingSearchId);
      const matchingPersonId =
        matchingSearchId === "board" ? "nia" : matchingSearchId === "staff-pm" ? "maya" : "leila";
      const matchingPerson = PEOPLE.find((person) => person.id === matchingPersonId) ?? PEOPLE[0];
      setSelectedPersonId(matchingPerson.id);
      setProposedValue(matchingPerson.nextValue);
      setReviewDecision("proposed");
      setActionStaged(false);
    }
  }

  function choosePerson(personId: string, nextSurface: Surface = "today") {
    const nextPerson = PEOPLE.find((person) => person.id === personId) ?? PEOPLE[0];
    setSelectedPersonId(personId);
    setProposedValue(nextPerson.nextValue);
    setSurface(nextSurface);
    setEvidenceOpen(false);
    setReviewDecision("proposed");
    setActionStaged(false);
    setCommandReceipt("");
  }

  function openEvidence() {
    setEvidenceReturnFocusTarget(
      document.activeElement instanceof HTMLElement ? document.activeElement : null,
    );
    setEvidenceSession((current) => current + 1);
    setEvidenceOpen(true);
    setCommandReceipt("");
  }

  function chooseSearch(searchId: string) {
    const matchingPersonId =
      searchId === "board" ? "nia" : searchId === "staff-pm" ? "maya" : "leila";
    setSelectedSearchId(searchId);
    setSelectedPersonId(matchingPersonId);
    const matchingPerson = PEOPLE.find((person) => person.id === matchingPersonId) ?? PEOPLE[0];
    setProposedValue(matchingPerson.nextValue);
    setReviewDecision("proposed");
    setActionStaged(false);
    setEvidenceOpen(false);
    setCommandReceipt("");
  }

  function decideEvidence(decision: Exclude<ReviewDecision, "proposed">) {
    setReviewDecision(decision);
    setActionStaged(false);
    setEvidenceOpen(false);
    setCommandReceipt(
      decision === "kept"
        ? "The unresolved state remains proposed from evidence. No action was approved."
        : "The proposal and its dependent action were retracted. Source evidence remains available.",
    );
  }

  function stageAction() {
    setActionStaged(true);
    setCommandReceipt(
      "The exact question is staged for a separate human decision. Nothing was sent or scheduled.",
    );
  }

  function reviseEvidence(nextValue: string) {
    setProposedValue(nextValue);
    setReviewDecision("kept");
    setActionStaged(false);
    setEvidenceOpen(false);
    setCommandReceipt(
      "The proposed relationship state was revised and kept for review. No action was approved.",
    );
  }

  function submitCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const objective = commandText.trim().toLocaleLowerCase();
    if (!objective) return;

    if (objective.includes("nia")) {
      choosePerson("nia");
      setCommandReceipt("Opened Nia's current relationship. No state changed.");
    } else if (objective.includes("search")) {
      chooseSurface("searches");
      setCommandReceipt("Opened Searches. No relationship state changed.");
    } else {
      setCommandReceipt(
        "A source-linked brief would be compiled here. This concept stores no prompt and grants no action authority.",
      );
    }
    setCommandText("");
  }

  return (
    <div className={styles.frame} ref={setPortalContainer}>
      <aside className={styles.iconRail}>
        <div className={styles.mark}>
          <BrandMark compact />
        </div>
        <nav aria-label="Relationship desk">
          <DeskNavButton
            active={surface === "today"}
            icon={<CalendarBlank aria-hidden="true" size={21} weight="duotone" />}
            label="Today"
            onClick={() => chooseSurface("today")}
          />
          <DeskNavButton
            active={surface === "people"}
            icon={<UsersThree aria-hidden="true" size={21} weight="duotone" />}
            label="People"
            onClick={() => chooseSurface("people")}
          />
          <DeskNavButton
            active={surface === "searches"}
            icon={<Briefcase aria-hidden="true" size={21} weight="duotone" />}
            label="Searches"
            onClick={() => chooseSurface("searches")}
          />
        </nav>
        <div className={styles.railUtilities}>
          <button
            aria-label="Capture a relationship moment"
            onClick={() =>
              setCommandReceipt(
                "Capture would open a device-owned source review. This concept requests no screen or message access.",
              )
            }
            title="Capture a relationship moment"
            type="button"
          >
            <Plus aria-hidden="true" size={21} />
          </button>
          <ThemeToggle />
        </div>
      </aside>

      <aside className={styles.contextRail}>
        <div className={styles.contextHeader}>
          <span className={styles.productName}>Talent Signal</span>
          <strong>{surface === "today" ? "Today" : surface === "people" ? "People" : "Searches"}</strong>
        </div>

        <nav aria-label="Primary workspace views" className={styles.contextNav}>
          <button data-active={surface === "today"} onClick={() => chooseSurface("today")} type="button">
            <CalendarBlank aria-hidden="true" size={17} />
            Today
            <span>3</span>
          </button>
          <button data-active={surface === "people"} onClick={() => chooseSurface("people")} type="button">
            <AddressBook aria-hidden="true" size={17} />
            People
          </button>
          <button data-active={surface === "searches"} onClick={() => chooseSurface("searches")} type="button">
            <Briefcase aria-hidden="true" size={17} />
            Searches
          </button>
        </nav>

        <section className={styles.recent} aria-labelledby="recent-title">
          <div className={styles.sectionLabel} id="recent-title">
            {surface === "searches" ? "Active searches" : "Recent relationships"}
          </div>
          {surface === "searches"
            ? SEARCHES.map((search) => (
                <button
                  data-active={selectedSearchId === search.id}
                  key={search.id}
                  onClick={() => chooseSearch(search.id)}
                  type="button"
                >
                  <span>
                    <strong>{search.client}</strong>
                    <small>{search.name}</small>
                  </span>
                  <CaretRight aria-hidden="true" size={14} />
                </button>
              ))
            : PEOPLE.slice(0, 4).map((person) => (
                <button
                  data-active={selectedPerson.id === person.id}
                  key={person.id}
                  onClick={() => choosePerson(person.id)}
                  type="button"
                >
                  <span>
                    <strong>{person.context.replace("Chief Product Officer", "CPO")}</strong>
                    <small>{person.name}</small>
                  </span>
                  <CaretRight aria-hidden="true" size={14} />
                </button>
              ))}
        </section>

        <div className={styles.privacyNote}>
          <ShieldCheck aria-hidden="true" size={16} weight="duotone" />
          <span>
            <strong>Synthetic product view</strong>
            No candidate data is stored.
          </span>
        </div>
      </aside>

      <main className={styles.main} id="relationship-desk-main">
        {surface === "today" ? (
          <TodaySurface
            actionStaged={actionStaged}
            onOpenEvidence={openEvidence}
            onSelectPerson={(personId) => choosePerson(personId)}
            person={selectedPerson}
            proposedValue={proposedValue}
            reviewDecision={reviewDecision}
          />
        ) : null}
        {surface === "people" ? (
          <PeopleSurface
            filteredPeople={filteredPeople}
            onOpenEvidence={openEvidence}
            onQueryChange={setPeopleQuery}
            onSelectPerson={(personId) => choosePerson(personId, "people")}
            person={selectedPerson}
            proposedValue={proposedValue}
            query={peopleQuery}
            reviewDecision={reviewDecision}
          />
        ) : null}
        {surface === "searches" ? (
          <SearchesSurface
            onSelectSearch={chooseSearch}
            search={selectedSearch}
            selectedSearchId={selectedSearchId}
          />
        ) : null}

        <form className={styles.composer} onSubmit={submitCommand}>
          <Command aria-hidden="true" size={18} />
          <label>
            <span className="sr-only">Find, ask, or remember</span>
            <input
              onChange={(event) => setCommandText(event.target.value)}
              placeholder="Find, ask, or remember..."
              value={commandText}
            />
          </label>
          <button aria-label="Submit relationship question" disabled={!commandText.trim()} type="submit">
            <ArrowRight aria-hidden="true" size={17} />
          </button>
          <button
            aria-label="Start voice capture"
            className={styles.voiceButton}
            onClick={() =>
              setCommandReceipt(
                "Voice capture would require explicit microphone permission. No recording started in this concept.",
              )
            }
            type="button"
          >
            <Microphone aria-hidden="true" size={18} weight="duotone" />
          </button>
        </form>

        {commandReceipt ? (
          <div className={styles.commandReceipt} role="status">
            <CheckCircle aria-hidden="true" size={16} weight="fill" />
            {commandReceipt}
          </div>
        ) : null}
      </main>

      <ConsequenceRail
        actionStaged={actionStaged}
        onOpenEvidence={openEvidence}
        onReset={() => {
          setProposedValue(selectedPerson.nextValue);
          setReviewDecision("proposed");
          setActionStaged(false);
          setCommandReceipt("The synthetic review state was reset.");
        }}
        onStageAction={stageAction}
        person={selectedPerson}
        reviewDecision={reviewDecision}
        search={selectedSearch}
        surface={surface}
      />

      <DialogPrimitive.Root onOpenChange={setEvidenceOpen} open={evidenceOpen}>
        <EvidenceDrawer
          container={portalContainer}
          key={evidenceSession}
          onDecision={decideEvidence}
          onRevision={reviseEvidence}
          person={selectedPerson}
          proposedValue={proposedValue}
          returnFocusTarget={evidenceReturnFocusTarget}
          reviewDecision={reviewDecision}
        />
      </DialogPrimitive.Root>
    </div>
  );
}

function TodaySurface({
  actionStaged,
  onOpenEvidence,
  onSelectPerson,
  person,
  proposedValue,
  reviewDecision,
}: {
  actionStaged: boolean;
  onOpenEvidence: () => void;
  onSelectPerson: (personId: string) => void;
  person: Person;
  proposedValue: string;
  reviewDecision: ReviewDecision;
}) {
  const quiet = person.state === "quiet";
  const retracted = reviewDecision === "dismissed";
  return (
    <div className={styles.surface} data-surface="today">
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.dateLabel}>Friday, August 7</span>
          <h3>Today</h3>
          <p>Three relationships have a supported reason to look now.</p>
        </div>
        <span className={styles.reviewWindow}>
          <Clock aria-hidden="true" size={15} />
          12 minute review window
        </span>
      </header>

      <section className={styles.focusBrief} aria-labelledby="today-focus-title">
        <div className={styles.focusCopy}>
          <span className={styles.sectionLabel}>
            {quiet ? "Quiet on purpose" : `${person.due} / ${person.context}`}
          </span>
          <h4 id="today-focus-title">
            {retracted ? "This change no longer deserves action." : person.dependency}
          </h4>
          <p>
            {quiet
              ? "The relationship is waiting on the board. Another reminder would add pressure without reducing uncertainty."
              : retracted
                ? "The proposal was dismissed. Its dependent action has been removed while the exact source remains reviewable."
                : `${proposedValue}. The current relationship page remains unchanged until review.`}
          </p>
          <button onClick={onOpenEvidence} type="button">
            {retracted ? "Inspect dismissed evidence" : "Review the relationship"}
            <ArrowRight aria-hidden="true" size={17} />
          </button>
        </div>

        <div className={styles.causalSeam} data-state={reviewDecision}>
          <span className={styles.sectionLabel}>Exact evidence</span>
          <blockquote>“{person.evidence}”</blockquote>
          <dl>
            <div>
              <dt>Owner</dt>
              <dd>{person.owner}</dd>
            </div>
            <div>
              <dt>Due</dt>
              <dd>{person.due}</dd>
            </div>
          </dl>
          {actionStaged ? (
            <span className={styles.inlineReceipt}>
              <CheckCircle aria-hidden="true" size={14} weight="fill" />
              Draft staged only
            </span>
          ) : null}
        </div>
      </section>

      <section className={styles.motionQueue} aria-labelledby="motion-title">
        <div className={styles.sectionLabel} id="motion-title">Also in motion</div>
        {PEOPLE.filter((item) => item.id !== person.id && item.state !== "quiet").slice(0, 2).map((item) => (
          <button key={item.id} onClick={() => onSelectPerson(item.id)} type="button">
            <Avatar person={item} size="small" />
            <span>
              <strong>{item.name}</strong>
              <small>{item.dependency}</small>
            </span>
            <em data-state={item.state}>{STATE_LABELS[item.state]}</em>
            <span className={styles.recency}>{item.recency}</span>
          </button>
        ))}
      </section>
    </div>
  );
}

function PeopleSurface({
  filteredPeople,
  onOpenEvidence,
  onQueryChange,
  onSelectPerson,
  person,
  proposedValue,
  query,
  reviewDecision,
}: {
  filteredPeople: Person[];
  onOpenEvidence: () => void;
  onQueryChange: (query: string) => void;
  onSelectPerson: (personId: string) => void;
  person: Person;
  proposedValue: string;
  query: string;
  reviewDecision: ReviewDecision;
}) {
  return (
    <div className={styles.surface} data-surface="people">
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.dateLabel}>Relationship library</span>
          <h3>People</h3>
          <p>One identity, with every relationship context kept distinct.</p>
        </div>
        <label className={styles.peopleSearch}>
          <MagnifyingGlass aria-hidden="true" size={17} />
          <span className="sr-only">Find a person or relationship</span>
          <input
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Find a person or relationship"
            value={query}
          />
        </label>
      </header>

      <div className={styles.peopleGrid}>
        <section className={styles.peopleList} aria-label="People in the synthetic relationship library">
          {filteredPeople.length > 0 ? (
            filteredPeople.map((item) => (
              <button
                aria-current={item.id === person.id ? "page" : undefined}
                data-active={item.id === person.id}
                key={item.id}
                onClick={() => onSelectPerson(item.id)}
                type="button"
              >
                <Avatar person={item} />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.role} / {item.context}</small>
                  <em>{item.dependency}</em>
                </span>
                <span className={styles.personState}>{STATE_LABELS[item.state]}</span>
              </button>
            ))
          ) : (
            <div className={styles.emptyState}>
              <MagnifyingGlass aria-hidden="true" size={22} />
              <strong>No supported relationship found.</strong>
              <p>Try a name, role, company, or assignment.</p>
            </div>
          )}
        </section>

        <article className={styles.livingPage}>
          <header>
            <Avatar person={person} size="large" />
            <div>
              <span className={styles.sectionLabel}>Living relationship page</span>
              <h4 data-long={person.name.length > 22}>{person.name}</h4>
              <p>{person.role} at {person.company}</p>
            </div>
          </header>
          <section>
            <span className={styles.sectionLabel}>Current dependency</span>
            <h5>{person.dependency}</h5>
            <p>{proposedValue}.</p>
          </section>
          <dl>
            <div>
              <dt>Relationship</dt>
              <dd>{person.context}</dd>
            </div>
            <div>
              <dt>Evidence state</dt>
              <dd>{reviewDecision === "dismissed" ? "Dismissed, source retained" : "Proposed, source attached"}</dd>
            </div>
          </dl>
          <button onClick={onOpenEvidence} type="button">
            <Quotes aria-hidden="true" size={16} />
            Open exact evidence
          </button>
        </article>
      </div>
    </div>
  );
}

function SearchesSurface({
  onSelectSearch,
  search,
  selectedSearchId,
}: {
  onSelectSearch: (searchId: string) => void;
  search: Search;
  selectedSearchId: string;
}) {
  return (
    <div className={styles.surface} data-surface="searches">
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.dateLabel}>Assignment room</span>
          <h3>{search.client}</h3>
          <p>{search.name}. Decision review August 14.</p>
        </div>
        <div className={styles.searchTabs} role="tablist" aria-label="Synthetic searches">
          {SEARCHES.map((item) => (
            <button
              aria-selected={selectedSearchId === item.id}
              key={item.id}
              onClick={() => onSelectSearch(item.id)}
              role="tab"
              type="button"
            >
              {item.client}
            </button>
          ))}
        </div>
      </header>

      <section className={styles.searchNarrative}>
        <h4>{search.headline}</h4>
        <p>{search.note}</p>
      </section>

      <section className={styles.participantSection} aria-labelledby="participants-title">
        <div className={styles.sectionLabel} id="participants-title">People shaping the next decision</div>
        <div className={styles.participantList}>
          {search.participants.map((participant) => (
            <article key={participant.name}>
              <span aria-hidden="true">{participant.initials}</span>
              <div>
                <strong>{participant.name}</strong>
                <small>{participant.role}</small>
              </div>
              <p>{participant.position}</p>
              <em>{participant.state}</em>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.disagreement}>
        <WarningCircle aria-hidden="true" size={19} weight="duotone" />
        <div>
          <span className={styles.sectionLabel}>Evidence to resolve</span>
          <p>{search.evidence}</p>
          <small>{search.sourceA} <span /> {search.sourceB}</small>
        </div>
      </section>
    </div>
  );
}

function ConsequenceRail({
  actionStaged,
  onOpenEvidence,
  onReset,
  onStageAction,
  person,
  reviewDecision,
  search,
  surface,
}: {
  actionStaged: boolean;
  onOpenEvidence: () => void;
  onReset: () => void;
  onStageAction: () => void;
  person: Person;
  reviewDecision: ReviewDecision;
  search: Search;
  surface: Surface;
}) {
  const quiet = person.state === "quiet";
  const identityBlocked = person.state === "identity";
  const noAction = quiet || identityBlocked;
  const dismissed = reviewDecision === "dismissed";
  const action = surface === "searches"
    ? search.action
    : person.action;

  return (
    <aside className={styles.consequenceRail} aria-label="Current consequence and next move">
      <div>
        <span className={styles.sectionLabel}>
          {noAction || dismissed ? "No action supported" : "Smallest supported step"}
        </span>
        <h3>
          {dismissed
            ? "The dependent action was retracted."
            : identityBlocked
              ? "Resolve identity before attaching this source."
              : quiet
              ? "Wait for new decision-relevant evidence."
              : action}
        </h3>
        <p>
          {dismissed
            ? "The source remains inspectable, but it no longer supports a relationship-state proposal."
            : identityBlocked
              ? "No person is preselected. Save this as unresolved when the current evidence cannot support a match."
              : quiet
              ? "Quiet is an intentional outcome. No reminder is created."
              : "This is a draft on the selected relationship. Nothing is sent or scheduled."}
        </p>
      </div>

      <dl className={styles.actionMeta}>
        <div>
          <dt>Owner</dt>
          <dd>{surface === "searches" ? "You" : person.owner}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>{surface === "searches" ? "Before Friday" : person.due}</dd>
        </div>
        <div>
          <dt>Completion</dt>
          <dd>{noAction || dismissed ? "New evidence arrives" : "Explicit answer recorded"}</dd>
        </div>
      </dl>

      <div className={styles.actionControls}>
        <button className={styles.secondaryButton} onClick={onOpenEvidence} type="button">
          <Quotes aria-hidden="true" size={16} />
          Review evidence
        </button>
        {!noAction && !dismissed ? (
          <button
            className={styles.primaryButton}
            disabled={reviewDecision !== "kept" || actionStaged}
            onClick={onStageAction}
            type="button"
          >
            {actionStaged ? (
              <Check aria-hidden="true" size={17} />
            ) : (
              <NotePencil aria-hidden="true" size={17} />
            )}
            {actionStaged ? "Question staged" : "Stage exact question"}
          </button>
        ) : null}
        {reviewDecision !== "proposed" || actionStaged ? (
          <button className={styles.textButton} onClick={onReset} type="button">
            <ArrowCounterClockwise aria-hidden="true" size={15} />
            Reset synthetic review
          </button>
        ) : null}
      </div>

      <section className={styles.promiseSection}>
        <span className={styles.sectionLabel}>Commitments</span>
        <div>
          <CheckCircle aria-hidden="true" size={17} />
          <p>
            <strong>{surface === "searches" ? search.commitment : person.commitment}</strong>
            <small>{surface === "searches" ? search.commitmentDue : person.commitmentDue}</small>
          </p>
        </div>
        <div data-muted="true">
          <Clock aria-hidden="true" size={17} />
          <p>
            <strong>{surface === "searches" ? search.protectedOutcome : person.protectedOutcome}</strong>
            <small>{surface === "searches" ? "Waiting on one confirmed dependency" : person.waitingOn}</small>
          </p>
        </div>
      </section>

      <div className={styles.authorityNote}>
        <ShieldCheck aria-hidden="true" size={17} weight="duotone" />
        <p>
          <strong>Draft authority only</strong>
          Fact review and action approval remain separate decisions.
        </p>
      </div>
    </aside>
  );
}

function EvidenceDrawer({
  container,
  onDecision,
  onRevision,
  person,
  proposedValue,
  returnFocusTarget,
  reviewDecision,
}: {
  container: HTMLDivElement | null;
  onDecision: (decision: Exclude<ReviewDecision, "proposed">) => void;
  onRevision: (nextValue: string) => void;
  person: Person;
  proposedValue: string;
  returnFocusTarget: HTMLElement | null;
  reviewDecision: ReviewDecision;
}) {
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(proposedValue);

  return (
    <DialogPrimitive.Portal container={container}>
      <DialogPrimitive.Overlay className={styles.drawerBackdrop} />
      <DialogPrimitive.Content
        aria-describedby="desktop-evidence-boundary"
        className={styles.evidenceDrawer}
        id="desktop-evidence-review"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusTarget?.focus();
        }}
      >
        <header>
          <div>
            <span className={styles.sectionLabel}>Evidence before interpretation</span>
            <DialogPrimitive.Title asChild>
              <h3>Review one proposed change.</h3>
            </DialogPrimitive.Title>
          </div>
          <DialogPrimitive.Close asChild>
            <button aria-label={`Close evidence review for ${person.name}`} type="button">
              <X aria-hidden="true" size={19} />
            </button>
          </DialogPrimitive.Close>
        </header>

        <section className={styles.drawerIdentity}>
          <Avatar person={person} />
          <div>
            <strong>{person.name}</strong>
            <span>{person.context}</span>
          </div>
        </section>

        <section className={styles.drawerEvidence}>
          <span className={styles.sectionLabel}>Observed source</span>
          <Quotes aria-hidden="true" size={21} weight="duotone" />
          <blockquote>“{person.evidence}”</blockquote>
          <p>{person.provenance}</p>
        </section>

        <section className={styles.stateDiff}>
          <span className={styles.sectionLabel}>Proposed relationship state</span>
          <dl>
            <div>
              <dt>Before</dt>
              <dd>{person.previousValue}</dd>
            </div>
            <ArrowRight aria-hidden="true" size={18} />
            <div>
              <dt>Proposed</dt>
              <dd>
                {editing ? (
                  <label className={styles.revisionControl}>
                    <span>Revised wording</span>
                    <textarea
                      autoFocus
                      onChange={(event) => setDraftValue(event.target.value)}
                      rows={3}
                      value={draftValue}
                    />
                  </label>
                ) : (
                  proposedValue
                )}
              </dd>
              <button
                className={styles.revisionButton}
                onClick={() => {
                  if (editing) setDraftValue(proposedValue);
                  setEditing((current) => !current);
                }}
                type="button"
              >
                <NotePencil aria-hidden="true" size={14} />
                {editing ? "Cancel revision" : "Revise wording"}
              </button>
            </div>
          </dl>
        </section>

        <div className={styles.drawerBoundary}>
          <ShieldCheck aria-hidden="true" size={18} weight="duotone" />
          <DialogPrimitive.Description asChild>
            <p id="desktop-evidence-boundary">
              Keeping this proposal does not approve the next action. Dismissing it retracts the dependent draft.
            </p>
          </DialogPrimitive.Description>
        </div>

        <footer>
          <button className={styles.secondaryButton} onClick={() => onDecision("dismissed")} type="button">
            <X aria-hidden="true" size={16} />
            Dismiss proposal
          </button>
          <button
            className={styles.primaryButton}
            disabled={editing && !draftValue.trim()}
            onClick={() => editing ? onRevision(draftValue.trim()) : onDecision("kept")}
            type="button"
          >
            <Check aria-hidden="true" size={17} />
            {editing
              ? "Save revision"
              : reviewDecision === "kept"
                ? "Keep unresolved"
                : "Keep as unresolved"}
          </button>
        </footer>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
