"use client";

import {
  ArrowLeft,
  ArrowRight,
  BatteryMedium,
  BookOpen,
  Briefcase,
  CaretDown,
  CaretRight,
  Check,
  Copy,
  Compass,
  DotsThree,
  Export,
  Gear,
  Lifebuoy,
  ListDashes,
  MagnifyingGlass,
  Megaphone,
  Microphone,
  NotePencil,
  PencilSimple,
  Plus,
  Question,
  Quotes,
  ShareNetwork,
  ShieldCheck,
  Star,
  UsersThree,
  WifiHigh,
  X,
} from "@phosphor-icons/react";
import Image from "next/image";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./relationship-mobile-concept.module.css";

type Direction = "archive" | "concierge";
type MaterialDirection = "museum" | "pebbles";
type CollectionView = "now" | "all" | "quiet";
type AgentMode = "home" | "find" | "answer" | "remember";
type ArchivePage = "today" | "people" | "library";
type ReviewKind = "change" | "resume";

type Person = {
  id: string;
  name: string;
  role: string;
  company: string;
  relationship: string;
  dependency: string;
  recency: string;
  state: "changed" | "waiting" | "review" | "quiet" | "identity";
  avatar?: string;
  initials: string;
};

type DetailContent = {
  conditionHeading: string;
  conditionBody: string;
  changeTitle: string;
  quote: string;
  provenance: string;
  before: string;
  now: string;
  nextStep: string;
};

const people: Person[] = [
  {
    id: "leila",
    name: "Leila Hartmann",
    role: "VP Product",
    company: "Meridian Labs",
    relationship: "Chief Product Officer search",
    dependency: "Remote policy waits on the client.",
    recency: "2h",
    state: "changed",
    avatar: "/concepts/relationships/avatars/leila.webp",
    initials: "LH",
  },
  {
    id: "nia",
    name: "Nia Williams",
    role: "Independent board director",
    company: "Portfolio relationship",
    relationship: "Board chair mapping",
    dependency: "Two sources disagree on travel limits.",
    recency: "5h",
    state: "review",
    avatar: "/concepts/relationships/avatars/nia.webp",
    initials: "NW",
  },
  {
    id: "maya",
    name: "Maya Ortiz",
    role: "Operating Partner",
    company: "Northlight Capital",
    relationship: "Fractional CFO search",
    dependency: "Founder meeting is ready to schedule.",
    recency: "1d",
    state: "waiting",
    avatar: "/concepts/relationships/avatars/maya.webp",
    initials: "MO",
  },
  {
    id: "amir",
    name: "Amir Okafor",
    role: "VP Engineering",
    company: "Rubicon Health",
    relationship: "CTO succession",
    dependency: "Stay quiet until the board responds.",
    recency: "4d",
    state: "quiet",
    avatar: "/concepts/relationships/avatars/amir.webp",
    initials: "AO",
  },
  {
    id: "zhang",
    name: "张伟 / Wei Zhang-Sørensen",
    role: "Chief People Officer",
    company: "Independent",
    relationship: "Leadership network",
    dependency: "Identity evidence is not sufficient.",
    recency: "2w",
    state: "identity",
    initials: "伟",
  },
];

const collectionLabels: Record<CollectionView, string> = {
  now: "Now",
  all: "All",
  quiet: "Quiet",
};

const stateLabels: Record<Person["state"], string> = {
  changed: "Changed",
  waiting: "Waiting",
  review: "Needs review",
  quiet: "No action",
  identity: "Identity review",
};

const detailContent: Record<Person["id"], DetailContent> = {
  leila: {
    conditionHeading: "The client controls one answer.",
    conditionBody:
      "Confirm whether remote work from Singapore is supported before Leila's Friday decision.",
    changeTitle: "Decision window",
    quote: "I could do Singapore, but not full-time relocation.",
    provenance: "WhatsApp screenshot / Thu 22:18 / Recruiter reviewed",
    before: "Remote policy assumed flexible",
    now: "Full-time relocation unresolved",
    nextStep: "Ask the client one exact question.",
  },
  nia: {
    conditionHeading: "Travel limits need one human review.",
    conditionBody:
      "Two reviewed sources describe different travel limits. Neither should silently replace the other.",
    changeTitle: "Travel availability",
    quote:
      "Monthly travel is workable, but I would not want a weekly international cadence.",
    provenance: "Call note / Aug 7, 08:40 / Conflicts with earlier email",
    before: "Quarterly travel",
    now: "Source conflict",
    nextStep: "Ask Nia which cadence is current.",
  },
  maya: {
    conditionHeading: "The founder owns the calendar step.",
    conditionBody:
      "Maya has offered a meeting window. The timezone remains the one missing detail.",
    changeTitle: "Founder availability",
    quote: "I can meet the founder next Tuesday if we settle the timezone.",
    provenance: "Recruiter note / Aug 6, 17:20 / Draft context",
    before: "Meeting not scheduled",
    now: "Tuesday offered",
    nextStep: "Confirm one timezone before scheduling.",
  },
  amir: {
    conditionHeading: "No action until the board responds.",
    conditionBody:
      "The relationship is intentionally quiet. A reminder would add pressure without changing the dependency.",
    changeTitle: "Board dependency",
    quote: "Let's hold here until the board has aligned on the mandate.",
    provenance: "Email / Aug 3, 14:05 / Recruiter reviewed",
    before: "Follow-up considered",
    now: "No action",
    nextStep: "Wait for the board response.",
  },
  zhang: {
    conditionHeading: "Identity must be resolved first.",
    conditionBody:
      "The imported clue is insufficient to attach this source to an existing relationship.",
    changeTitle: "Identity evidence",
    quote: "The card contains a name and title, but no current verified contact clue.",
    provenance: "Imported contact card / Jul 24 / Unresolved identity",
    before: "Possible match",
    now: "Review required",
    nextStep: "Resolve identity before sharing or attaching evidence.",
  },
};

function Avatar({
  person,
  size = "medium",
}: {
  person: Person;
  size?: "small" | "medium" | "large";
}) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.avatar} ${styles[`avatar${size[0].toUpperCase()}${size.slice(1)}`]}`}
    >
      {person.avatar ? (
        <Image
          alt=""
          fill
          sizes={size === "large" ? "76px" : size === "small" ? "38px" : "50px"}
          src={person.avatar}
        />
      ) : (
        <span>{person.initials}</span>
      )}
    </span>
  );
}

function StatusBar() {
  return (
    <div aria-hidden="true" className={styles.statusBar}>
      <span>9:41</span>
      <span className={styles.dynamicIsland} />
      <span className={styles.systemStatus}>
        <WifiHigh size={15} weight="bold" />
        <BatteryMedium size={20} weight="fill" />
      </span>
    </div>
  );
}

function MenuItem({
  autoFocus = false,
  detail,
  disabled = false,
  icon,
  label,
  onClick,
  trailing,
}: {
  autoFocus?: boolean;
  detail?: string;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  trailing?: ReactNode;
}) {
  return (
    <button
      autoFocus={autoFocus}
      className={styles.menuItem}
      disabled={disabled}
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      <span className={styles.menuItemIcon}>{icon}</span>
      <span className={styles.menuItemCopy}>
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {trailing ? <span className={styles.menuItemTrailing}>{trailing}</span> : null}
    </button>
  );
}

function BrandOrb({
  expanded,
  onClick,
}: {
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-expanded={expanded}
      aria-haspopup="menu"
      aria-label="Open Talent Signal menu"
      className={styles.brandOrb}
      onClick={onClick}
      type="button"
    >
      <span aria-hidden="true" className={styles.brandOrbMark}>
        <span />
        <span />
        <span />
      </span>
    </button>
  );
}

function BrandMenu({ onClose }: { onClose: () => void }) {
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const [receipt, setReceipt] = useState(
    "Workspace configuration stays separate from relationship evidence.",
  );

  useEffect(() => {
    firstItemRef.current?.focus();
  }, []);

  return (
    <>
      <button
        aria-label="Close Talent Signal menu"
        className={styles.menuScrim}
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <section
        aria-label="Talent Signal menu"
        className={`${styles.contextMenu} ${styles.brandMenu}`}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
          }
        }}
        role="menu"
      >
        <div className={styles.menuIdentity}>
          <span className={styles.menuIdentityMark}>
            <span />
            <span />
            <span />
          </span>
          <span>
            <strong>Talent Signal</strong>
            <small>Private relationship workspace</small>
          </span>
        </div>
        <div className={styles.menuGroup}>
          <button
            className={styles.menuItem}
            onClick={() =>
              setReceipt("Settings are account-scoped. No relationship state changed.")
            }
            ref={firstItemRef}
            role="menuitem"
            type="button"
          >
            <span className={styles.menuItemIcon}>
              <Gear size={18} />
            </span>
            <span className={styles.menuItemCopy}>
              <strong>Settings</strong>
              <small>Workspace, appearance, notifications</small>
            </span>
          </button>
          <MenuItem
            detail="Sources, retention, deletion"
            icon={<ShieldCheck size={18} />}
            label="Privacy and evidence"
            onClick={() =>
              setReceipt("Evidence controls open without exposing conversation content.")
            }
          />
        </div>
        <div className={styles.menuGroup}>
          <MenuItem
            detail="Guides and contact"
            icon={<Lifebuoy size={18} />}
            label="Support"
            onClick={() => setReceipt("Support opens outside the relationship record.")}
          />
          <MenuItem
            detail="Living Archive glass study"
            icon={<Megaphone size={18} />}
            label="What's new"
            onClick={() => setReceipt("Version notes are ready to review.")}
            trailing="0.3"
          />
        </div>
        <p aria-live="polite" className={styles.menuReceipt}>
          {receipt}
        </p>
      </section>
    </>
  );
}

function AgentRail({
  label = "Ask what deserves attention…",
  onOpen,
}: {
  label?: string;
  onOpen: () => void;
}) {
  return (
    <div className={styles.agentRail}>
      <button aria-label="Search relationships" onClick={onOpen} type="button">
        <MagnifyingGlass size={21} />
      </button>
      <button className={styles.agentRailPrompt} onClick={onOpen} type="button">
        <span>{label}</span>
        <small>Draft authority only</small>
      </button>
      <button aria-label="Capture a relationship moment" onClick={onOpen} type="button">
        <NotePencil size={21} />
      </button>
    </div>
  );
}

function ArchiveHeader({
  active,
  onChange,
}: {
  active: ArchivePage;
  onChange: (value: ArchivePage) => void;
}) {
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);

  return (
    <>
      <header className={styles.archiveHeader}>
        <BrandOrb
          expanded={brandMenuOpen}
          onClick={() => setBrandMenuOpen((value) => !value)}
        />
        <nav aria-label="Primary">
          <button
            aria-current={active === "today" ? "page" : undefined}
            className={active === "today" ? styles.headerNavActive : ""}
            onClick={() => onChange("today")}
            type="button"
          >
            Today
          </button>
          <button
            aria-current={active === "people" ? "page" : undefined}
            className={active === "people" ? styles.headerNavActive : ""}
            onClick={() => onChange("people")}
            type="button"
          >
            People
          </button>
          <button
            aria-current={active === "library" ? "page" : undefined}
            className={active === "library" ? styles.headerNavActive : ""}
            onClick={() => onChange("library")}
            type="button"
          >
            Library
          </button>
        </nav>
        <span aria-hidden="true" className={styles.headerBalance} />
      </header>
      {brandMenuOpen ? (
        <BrandMenu onClose={() => setBrandMenuOpen(false)} />
      ) : null}
    </>
  );
}

function PersonRow({
  person,
  onSelect,
}: {
  person: Person;
  onSelect: (person: Person) => void;
}) {
  return (
    <button
      className={styles.personRow}
      onClick={() => onSelect(person)}
      type="button"
    >
      <Avatar person={person} />
      <span className={styles.personRowBody}>
        <span className={styles.personRowOverline}>
          <span
            className={person.state === "changed" ? styles.changedMarker : ""}
          >
            {stateLabels[person.state]}
          </span>
          <span>{person.recency}</span>
        </span>
        <strong>{person.name}</strong>
        <span className={styles.personRole}>
          {person.role}
          <span aria-hidden="true"> / </span>
          {person.company}
        </span>
        <span className={styles.personDependency}>{person.dependency}</span>
      </span>
      <CaretRight aria-hidden="true" size={16} />
    </button>
  );
}

function PeopleArchive({
  onGuide,
  onLibrary,
  onSelect,
  onToday,
}: {
  onGuide: (mode?: AgentMode, person?: Person) => void;
  onLibrary: () => void;
  onSelect: (person: Person) => void;
  onToday: () => void;
}) {
  const [collection, setCollection] = useState<CollectionView>("now");

  const filtered = useMemo(() => {
    if (collection === "quiet") {
      return people.filter((person) => person.state === "quiet");
    }
    if (collection === "now") {
      return people.filter((person) =>
        ["changed", "review", "waiting"].includes(person.state),
      );
    }
    return people;
  }, [collection]);

  const counts: Record<CollectionView, number> = {
    now: 3,
    all: people.length,
    quiet: 1,
  };

  return (
    <div className={styles.phoneScreen}>
      <ArchiveHeader
        active="people"
        onChange={(value) => {
          if (value === "today") {
            onToday();
          } else if (value === "library") {
            onLibrary();
          }
        }}
      />

      <div className={styles.archiveMain}>
        <section className={styles.archiveIntro}>
          <span>Living relationship archive / 05</span>
          <h1>People</h1>
          <p>
            A person can hold many roles. The relationship keeps its own
            context.
          </p>
        </section>

        <button
          className={styles.assignmentLine}
          onClick={() => onGuide("find")}
          type="button"
        >
          <span>
            <Briefcase size={16} />
            Chief Product Officer search
          </span>
          <span>
            3 in motion
            <CaretDown size={13} weight="bold" />
          </span>
        </button>

        <nav aria-label="Collection view" className={styles.collectionNav}>
          {(Object.keys(collectionLabels) as CollectionView[]).map((item) => (
            <button
              aria-pressed={collection === item}
              className={collection === item ? styles.collectionActive : ""}
              key={item}
              onClick={() => setCollection(item)}
              type="button"
            >
              {collectionLabels[item]}
              <span>{counts[item]}</span>
            </button>
          ))}
        </nav>

        <section aria-label={`${collectionLabels[collection]} relationships`}>
          <div className={styles.collectionLabel}>
            <span>
              {collection === "now"
                ? "Reasons to look"
                : collection === "quiet"
                  ? "Held without pressure"
                  : "Relationship index"}
            </span>
            <span>Reviewed evidence only</span>
          </div>
          <div className={styles.peopleCollection}>
            {filtered.map((person) => (
              <PersonRow key={person.id} onSelect={onSelect} person={person} />
            ))}
          </div>
        </section>
      </div>

      <AgentRail onOpen={() => onGuide("home")} />
    </div>
  );
}

function TodayArchive({
  onGuide,
  onLibrary,
  onPeople,
  onResume,
  onReview,
}: {
  onGuide: (mode?: AgentMode, person?: Person) => void;
  onLibrary: () => void;
  onPeople: () => void;
  onResume: (person: Person) => void;
  onReview: (person: Person) => void;
}) {
  const leila = people[0];
  const nia = people[1];

  return (
    <div className={styles.phoneScreen}>
      <ArchiveHeader
        active="today"
        onChange={(value) => {
          if (value === "people") {
            onPeople();
          } else if (value === "library") {
            onLibrary();
          }
        }}
      />

      <div className={`${styles.archiveMain} ${styles.todayMain}`}>
        <section className={`${styles.archiveIntro} ${styles.todayIntro}`}>
          <span>Friday, August 7</span>
          <h1>Today</h1>
          <p>Two relationships deserve your judgment.</p>
        </section>

        <section className={styles.todayFocus} aria-labelledby="today-focus-title">
          <div>
            <span>Return to</span>
            <p className={styles.todayContext}>
              Leila Hartmann
              <span aria-hidden="true"> / </span>
              Chief Product Officer search
            </p>
            <h2 id="today-focus-title">
              One client answer is holding her decision.
            </h2>
            <p>
              Remote work from Singapore remains unresolved.
            </p>
            <small>Changed after Thursday&apos;s conversation.</small>
          </div>
          <button onClick={() => onReview(leila)} type="button">
            Review change
            <ArrowRight size={16} />
          </button>
        </section>

        <section className={styles.todaySecondary} aria-labelledby="today-next-title">
          <h2 id="today-next-title">Continue</h2>
          <button
            className={styles.todayResumeRow}
            onClick={() => onResume(nia)}
            type="button"
          >
            <Avatar person={nia} size="small" />
            <span>
              <strong>Nia Williams</strong>
              <small>Board search</small>
              <em>Needs review / 5h</em>
            </span>
            <CaretRight aria-hidden="true" size={17} />
          </button>
          <button
            className={styles.todayResumeRow}
            onClick={() => onGuide("remember")}
            type="button"
          >
            <span aria-hidden="true" className={styles.libraryGlyph}>
              AL
            </span>
            <span>
              <strong>Atlas Labs</strong>
              <small>Client brief</small>
              <em>Answer due Friday</em>
            </span>
            <CaretRight aria-hidden="true" size={17} />
          </button>
        </section>

        <section className={styles.quietNote}>
          <Check size={17} weight="bold" />
          <p>14 relationships need no action.</p>
        </section>
      </div>

      <AgentRail
        label="Ask what deserves attention…"
        onOpen={() => onGuide("answer", leila)}
      />
    </div>
  );
}

function LibraryArchive({
  onGuide,
  onPeople,
  onSelect,
  onToday,
}: {
  onGuide: (mode?: AgentMode, person?: Person) => void;
  onPeople: () => void;
  onSelect: (person: Person) => void;
  onToday: () => void;
}) {
  return (
    <div className={styles.phoneScreen}>
      <ArchiveHeader
        active="library"
        onChange={(value) => {
          if (value === "today") {
            onToday();
          } else if (value === "people") {
            onPeople();
          }
        }}
      />

      <div className={`${styles.archiveMain} ${styles.libraryMain}`}>
        <section className={styles.archiveIntro}>
          <span>Reviewed context</span>
          <h1>Library</h1>
          <p>Assignment rooms, source evidence, and briefs you can trust.</p>
        </section>

        <section aria-labelledby="library-rooms">
          <div className={styles.collectionLabel}>
            <span id="library-rooms">Assignment rooms</span>
            <span>02</span>
          </div>
          <button
            className={styles.libraryRow}
            onClick={() => onSelect(people[0])}
            type="button"
          >
            <span className={styles.libraryIcon}>
              <Briefcase size={18} />
            </span>
            <span>
              <strong>Chief Product Officer search</strong>
              <small>3 relationships / 1 decision waiting</small>
            </span>
            <CaretRight size={16} />
          </button>
          <button
            className={styles.libraryRow}
            onClick={() => onSelect(people[1])}
            type="button"
          >
            <span className={styles.libraryIcon}>
              <BookOpen size={18} />
            </span>
            <span>
              <strong>Board chair mapping</strong>
              <small>Evidence review 2 of 3 preserved</small>
            </span>
            <CaretRight size={16} />
          </button>
        </section>

        <section className={styles.libraryEvidence} aria-labelledby="library-evidence">
          <div className={styles.collectionLabel}>
            <span id="library-evidence">Recent evidence</span>
            <span>Reviewed</span>
          </div>
          <button
            className={styles.libraryQuote}
            onClick={() => onSelect(people[0])}
            type="button"
          >
            <Quotes size={18} weight="fill" />
            <span>
              <strong>&ldquo;I could do Singapore...&rdquo;</strong>
              <small>Leila / WhatsApp screenshot / Thu 22:18</small>
            </span>
            <CaretRight size={16} />
          </button>
        </section>
      </div>

      <AgentRail label="Find a source or relationship…" onOpen={() => onGuide("find")} />
    </div>
  );
}

function ChangeReview({
  kind,
  onBack,
  onOpenPerson,
  person,
}: {
  kind: ReviewKind;
  onBack: () => void;
  onOpenPerson: (person: Person) => void;
  person: Person;
}) {
  const [phase, setPhase] = useState<"resume" | "evidence">(
    kind === "resume" ? "resume" : "evidence",
  );
  const [decision, setDecision] = useState<"confirmed" | "unresolved" | null>(
    null,
  );
  const detail = detailContent[person.id];
  const isLeila = person.id === "leila";

  return (
    <div className={styles.phoneScreen}>
      <header className={styles.reviewNav}>
        <button aria-label="Back to Today" onClick={onBack} type="button">
          <ArrowLeft size={20} />
        </button>
        <span>{phase === "resume" ? "Resume review" : "Review change"}</span>
        <button
          aria-label={`Open ${person.name} relationship`}
          onClick={() => onOpenPerson(person)}
          type="button"
        >
          <Avatar person={person} size="small" />
        </button>
      </header>

      <div className={styles.reviewMain}>
        {phase === "resume" ? (
          <section className={styles.resumeSheet} aria-labelledby="resume-title">
            <span>Resume with context</span>
            <h1 id="resume-title">You stopped while reviewing {person.name.split(" ")[0]}.</h1>
            <p>Your edits are saved. No message was sent.</p>
            <div className={styles.resumeProgress}>
              <span className={styles.libraryIcon}>
                <NotePencil size={18} />
              </span>
              <span>
                <strong>{person.relationship}</strong>
                <small>Evidence 2 of 3</small>
              </span>
            </div>
            <button onClick={() => setPhase("evidence")} type="button">
              Continue review
              <ArrowRight size={17} />
            </button>
            <div className={styles.resumeQuiet}>
              <Check size={17} />
              <span>Quiet now / 14 need no action</span>
            </div>
          </section>
        ) : (
          <section className={styles.evidenceDecision} aria-labelledby="proposal-title">
            <span>Why this is here</span>
            <div className={styles.reviewQuote}>
              <Quotes aria-hidden="true" size={19} weight="fill" />
              <blockquote>&ldquo;{detail.quote}&rdquo;</blockquote>
              <small>
                {person.name.split(" ")[0]} / {detail.provenance}
              </small>
            </div>

            <span aria-hidden="true" className={styles.causalSeam}>
              <i />
            </span>

            <div className={styles.proposalBlock}>
              <span>Proposed change</span>
              <h1 id="proposal-title">
                {isLeila
                  ? "Remote work remains unresolved for this search."
                  : "Travel cadence remains unresolved for this search."}
              </h1>
              <p>
                This changes relationship state only. It does not send a message
                or write to an external system.
              </p>
              <div className={styles.reviewActions}>
                <button
                  aria-pressed={decision === "unresolved"}
                  onClick={() => setDecision("unresolved")}
                  type="button"
                >
                  Keep unresolved
                </button>
                <button
                  aria-pressed={decision === "confirmed"}
                  onClick={() => setDecision("confirmed")}
                  type="button"
                >
                  Confirm change
                </button>
              </div>
            </div>

            {decision ? (
              <div aria-live="polite" className={styles.reviewReceipt}>
                <Check size={18} weight="bold" />
                <div>
                  <strong>
                    {decision === "confirmed"
                      ? "Relationship state confirmed."
                      : "The question remains unresolved."}
                  </strong>
                  <p>No message was sent. You can undo this review.</p>
                  <button onClick={() => setDecision(null)} type="button">
                    Undo
                  </button>
                </div>
              </div>
            ) : null}

            <dl className={styles.reviewDiff}>
              <div>
                <dt>Before</dt>
                <dd>{detail.before}</dd>
              </div>
              <div>
                <dt>Proposed</dt>
                <dd>{detail.now}</dd>
              </div>
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}

function PersonShareMenu({
  onClose,
  person,
}: {
  onClose: () => void;
  person: Person;
}) {
  const [receipt, setReceipt] = useState(
    person.state === "identity"
      ? "Sharing is unavailable until identity evidence is resolved."
      : "Nothing is shared until access and included evidence are reviewed.",
  );

  return (
    <>
      <button
        aria-label="Close share menu"
        className={styles.menuScrim}
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <section
        aria-label={`Share ${person.name}`}
        className={`${styles.contextMenu} ${styles.personMenu}`}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
          }
        }}
        role="menu"
      >
        <div className={styles.personMenuHeading}>
          <span>Private by default</span>
          <h2>Share relationship</h2>
          <p>Only recruiter-reviewed context can enter a shared view.</p>
        </div>
        <div className={styles.menuGroup}>
          <MenuItem
            autoFocus
            detail="Stage access and evidence first"
            disabled={person.state === "identity"}
            icon={<Copy size={18} />}
            label="Create private link"
            onClick={() =>
              setReceipt("Private link draft ready. No access has changed.")
            }
          />
          <MenuItem
            detail="Reviewed facts with source notes"
            disabled={person.state === "identity"}
            icon={<Export size={18} />}
            label="Export a brief"
            onClick={() =>
              setReceipt("Export preview staged. No file has been created.")
            }
          />
          <MenuItem
            detail="People, expiry, and revocation"
            disabled={person.state === "identity"}
            icon={<ShieldCheck size={18} />}
            label="Manage access"
            onClick={() =>
              setReceipt("Access review opened. Existing access is unchanged.")
            }
          />
        </div>
        <p aria-live="polite" className={styles.menuReceipt}>
          {receipt}
        </p>
      </section>
    </>
  );
}

function PersonActionMenu({
  favorite,
  onClose,
  onFavoriteChange,
  person,
}: {
  favorite: boolean;
  onClose: () => void;
  onFavoriteChange: (value: boolean) => void;
  person: Person;
}) {
  const [receipt, setReceipt] = useState(
    "Actions apply to this relationship context, not the person globally.",
  );

  return (
    <>
      <button
        aria-label="Close relationship actions"
        className={styles.menuScrim}
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <section
        aria-label={`Actions for ${person.name}`}
        className={`${styles.contextMenu} ${styles.personMenu}`}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
          }
        }}
        role="menu"
      >
        <div className={styles.personMenuHeading}>
          <span>{person.relationship}</span>
          <h2>Relationship actions</h2>
          <p>Edits remain staged until their evidence and effect are reviewed.</p>
        </div>
        <div className={styles.menuGroup}>
          <MenuItem
            autoFocus
            detail="Confirmed state and assignment context"
            icon={<PencilSimple size={18} />}
            label="Edit relationship"
            onClick={() =>
              setReceipt("Editor staged. No confirmed relationship state changed.")
            }
          />
          <MenuItem
            detail="Keep raw words before interpretation"
            icon={<Plus size={18} />}
            label="Add note or evidence"
            onClick={() =>
              setReceipt("A new source review is ready. Nothing is attached yet.")
            }
          />
          <MenuItem
            detail="Personal shortcut, never a person rank"
            icon={<Star size={18} weight={favorite ? "fill" : "regular"} />}
            label={favorite ? "Remove from favorites" : "Add to favorites"}
            onClick={() => {
              onFavoriteChange(!favorite);
              setReceipt(
                favorite
                  ? "Removed from personal shortcuts. Relationship state is unchanged."
                  : "Added to personal shortcuts. Relationship state is unchanged.",
              );
            }}
            trailing={favorite ? <Check size={16} weight="bold" /> : null}
          />
          <MenuItem
            detail="Sources, changes, and recovery"
            icon={<ShieldCheck size={18} />}
            label="View relationship history"
            onClick={() =>
              setReceipt("History opens as a read-only trust surface.")
            }
          />
        </div>
        <p aria-live="polite" className={styles.menuReceipt}>
          {receipt}
        </p>
      </section>
    </>
  );
}

function PersonDetail({
  onBack,
  onGuide,
  person,
}: {
  onBack: () => void;
  onGuide: (mode?: AgentMode, person?: Person) => void;
  person: Person;
}) {
  const [favorite, setFavorite] = useState(false);
  const [openMenu, setOpenMenu] = useState<"share" | "actions" | null>(null);
  const detail = detailContent[person.id];

  return (
    <div className={styles.phoneScreen}>
      <header className={styles.personNav}>
        <button aria-label="Back to people" onClick={onBack} type="button">
          <ArrowLeft size={20} />
        </button>
        <span>Relationship 01</span>
        <div className={styles.personNavActions}>
          <button
            aria-expanded={openMenu === "share"}
            aria-haspopup="menu"
            aria-label={`Share ${person.name}`}
            onClick={() =>
              setOpenMenu((value) => (value === "share" ? null : "share"))
            }
            type="button"
          >
            <ShareNetwork size={20} />
          </button>
          <button
            aria-expanded={openMenu === "actions"}
            aria-haspopup="menu"
            aria-label={`Actions for ${person.name}`}
            onClick={() =>
              setOpenMenu((value) => (value === "actions" ? null : "actions"))
            }
            type="button"
          >
            <DotsThree size={22} weight="bold" />
          </button>
        </div>
      </header>

      <div className={`${styles.archiveMain} ${styles.personMain}`}>
        <section className={styles.personIdentity}>
          <Avatar person={person} size="large" />
          <div>
            <span>{person.relationship}</span>
            <h1>{person.name}</h1>
            <p>
              {person.role} / {person.company}
              {favorite ? (
                <span className={styles.favoriteIndicator}>
                  <Star size={11} weight="fill" />
                  Personal shortcut
                </span>
              ) : null}
            </p>
          </div>
        </section>

        <section className={styles.conditionSection} aria-labelledby="condition-title">
          <div className={styles.sectionIndex}>
            <span>Current condition</span>
            <span>01</span>
          </div>
          <h2 id="condition-title">{detail.conditionHeading}</h2>
          <p>{detail.conditionBody}</p>
        </section>

        <section className={styles.changeSection} aria-labelledby="change-title">
          <div className={styles.sectionIndex}>
            <span>What changed</span>
            <span>Confirmed</span>
          </div>
          <h2 id="change-title">{detail.changeTitle}</h2>
          <div className={styles.evidenceQuote}>
            <Quotes size={19} weight="fill" />
            <blockquote>“{detail.quote}”</blockquote>
            <small>{detail.provenance}</small>
          </div>
          <dl className={styles.stateChange}>
            <div>
              <dt>Before</dt>
              <dd>{detail.before}</dd>
            </div>
            <ArrowRight aria-hidden="true" size={18} />
            <div>
              <dt>Now</dt>
              <dd>{detail.now}</dd>
            </div>
          </dl>
          <button className={styles.historyLink} type="button">
            View source and history
            <ArrowRight size={15} />
          </button>
        </section>

        <section className={styles.nextStepSection} aria-labelledby="next-step-title">
          <div className={styles.sectionIndex}>
            <span>Smallest safe next step</span>
            <span>Draft only</span>
          </div>
          <h2 id="next-step-title">{detail.nextStep}</h2>
          <button onClick={() => onGuide("answer", person)} type="button">
            Stage with the Guide
            <ArrowRight size={16} />
          </button>
          <p>No message is sent from this page.</p>
        </section>
      </div>

      <AgentRail
        label={`Ask about ${person.name.split(" ")[0]}…`}
        onOpen={() => onGuide("answer", person)}
      />
      {openMenu === "share" ? (
        <PersonShareMenu onClose={() => setOpenMenu(null)} person={person} />
      ) : null}
      {openMenu === "actions" ? (
        <PersonActionMenu
          favorite={favorite}
          onClose={() => setOpenMenu(null)}
          onFavoriteChange={setFavorite}
          person={person}
        />
      ) : null}
    </div>
  );
}

function GuideSheet({
  focusPerson,
  initialMode,
  onClose,
  onOpenPerson,
}: {
  focusPerson: Person | null;
  initialMode: AgentMode;
  onClose: () => void;
  onOpenPerson: (person: Person) => void;
}) {
  const answerPerson = focusPerson ?? people[0];
  const answerDetail = detailContent[answerPerson.id];
  const [mode, setMode] = useState<AgentMode>(initialMode);
  const [query, setQuery] = useState(
    initialMode === "answer" ? `What changed with ${answerPerson.name}?` : "",
  );
  const [noteReviewed, setNoteReviewed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const choose = (nextMode: AgentMode) => {
    setMode(nextMode);
    setNoteReviewed(false);
    if (nextMode === "find") {
      setQuery("Who has reviewed APAC product leadership evidence?");
    } else if (nextMode === "answer") {
      setQuery(`What changed with ${answerPerson.name}?`);
    } else if (nextMode === "remember") {
      setQuery("Maya can meet the founder next Tuesday.");
    }
  };

  const continueFromInput = () => {
    const normalized = query.toLowerCase();
    if (normalized.includes("maya") || normalized.includes("remember")) {
      setMode("remember");
      return;
    }
    if (normalized.includes("leila") || normalized.includes("changed")) {
      setMode("answer");
      return;
    }
    setMode("find");
  };

  return (
    <section
      aria-labelledby="guide-title"
      aria-modal="true"
      className={styles.guideSheet}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
      role="dialog"
    >
      <header>
        <div>
          <span>Contextual Agent / Draft authority only</span>
          <h2 id="guide-title">Guide</h2>
        </div>
        <button aria-label="Close Guide" onClick={onClose} ref={closeRef} type="button">
          <X size={20} />
        </button>
      </header>

      <div className={styles.guideBody}>
        <div className={styles.guidePrompt}>
          <Compass size={23} weight="duotone" />
          <textarea
            aria-label="Find, ask, or remember"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a relationship, ask what changed, or remember one moment."
            rows={3}
            value={query}
          />
          <button aria-label="Record instead" type="button">
            <Microphone size={19} />
          </button>
        </div>

        {mode === "home" ? (
          <>
            <p className={styles.guideLead}>
              One line is enough. The Guide can find, explain, or stage a note
              without asking you to classify it first.
            </p>
            <div className={styles.guideJobs}>
              <button onClick={() => choose("find")} type="button">
                <MagnifyingGlass size={19} />
                <span>
                  <strong>Find a relationship</strong>
                  <small>Match reviewed evidence, not a person score.</small>
                </span>
                <ArrowRight size={16} />
              </button>
              <button onClick={() => choose("answer")} type="button">
                <Question size={19} />
                <span>
                  <strong>Ask what changed</strong>
                  <small>Answer from one governed relationship.</small>
                </span>
                <ArrowRight size={16} />
              </button>
              <button onClick={() => choose("remember")} type="button">
                <NotePencil size={19} />
                <span>
                  <strong>Remember a moment</strong>
                  <small>Keep your words before interpretation.</small>
                </span>
                <ArrowRight size={16} />
              </button>
            </div>
            <button
              className={styles.guidePrimary}
              disabled={!query.trim()}
              onClick={continueFromInput}
              type="button"
            >
              Continue
              <ArrowRight size={17} />
            </button>
          </>
        ) : null}

        {mode === "find" ? (
          <section className={styles.guideResult} aria-labelledby="find-title">
            <span>Matches from confirmed evidence / 02</span>
            <h3 id="find-title">Relevant relationships, not ranked people.</h3>
            <button onClick={() => onOpenPerson(people[0])} type="button">
              <Avatar person={people[0]} size="small" />
              <span>
                <strong>Leila Hartmann</strong>
                <small>APAC scope confirmed in one reviewed source.</small>
              </span>
              <CaretRight size={16} />
            </button>
            <button type="button">
              <Avatar person={people[2]} size="small" />
              <span>
                <strong>Maya Ortiz</strong>
                <small>Regional operating experience, assignment context differs.</small>
              </span>
              <CaretRight size={16} />
            </button>
            <p>
              Results are grouped by supported evidence. The Guide does not
              predict quality or acceptance.
            </p>
          </section>
        ) : null}

        {mode === "answer" ? (
          <section className={styles.guideResult} aria-labelledby="answer-title">
            <span>
              Answer / {answerPerson.name} / {answerPerson.relationship}
            </span>
            <h3 id="answer-title">
              {answerDetail.changeTitle}: {answerDetail.now}.
            </h3>
            <p>{answerDetail.conditionBody}</p>
            <blockquote>“{answerDetail.quote}”</blockquote>
            <small>{answerDetail.provenance}</small>
            <button
              className={styles.resultAction}
              onClick={() => onOpenPerson(answerPerson)}
              type="button"
            >
              Open {answerPerson.name}&apos;s relationship
              <ArrowRight size={16} />
            </button>
          </section>
        ) : null}

        {mode === "remember" ? (
          <section className={styles.noteReview} aria-labelledby="remember-title">
            <span>User-authored moment</span>
            <h3 id="remember-title">Keep the raw words. Stage the structure.</h3>
            <blockquote>{query}</blockquote>
            {!noteReviewed ? (
              <>
                <dl>
                  <div>
                    <dt>Possible person</dt>
                    <dd>Maya Ortiz</dd>
                  </div>
                  <div>
                    <dt>Possible context</dt>
                    <dd>Fractional CFO search</dd>
                  </div>
                  <div>
                    <dt>One missing answer</dt>
                    <dd>Which timezone?</dd>
                  </div>
                </dl>
                <button
                  className={styles.guidePrimary}
                  onClick={() => setNoteReviewed(true)}
                  type="button"
                >
                  Review as a draft
                  <ArrowRight size={17} />
                </button>
              </>
            ) : (
              <div className={styles.draftReceipt}>
                <ShieldCheck size={21} weight="fill" />
                <div>
                  <strong>Draft preserved.</strong>
                  <p>
                    No relationship state changed. Add the timezone when you
                    know it, then review the evidence attachment.
                  </p>
                </div>
              </div>
            )}
          </section>
        ) : null}
      </div>

      <footer>
        <ShieldCheck size={16} weight="fill" />
        Reads the selected relationship. Every change remains reviewable.
      </footer>
    </section>
  );
}

function ConciergeScreen({
  onOpenGuide,
}: {
  onOpenGuide: (mode?: AgentMode) => void;
}) {
  return (
    <div className={`${styles.phoneScreen} ${styles.conciergeScreen}`}>
      <header className={styles.conciergeHeader}>
        <span>Talent Signal</span>
        <span>Quiet Concierge / 05 relationships</span>
      </header>

      <div className={styles.conciergeBody}>
        <section className={styles.conciergeIntro}>
          <Compass size={27} weight="duotone" />
          <span>Agent threshold</span>
          <h1>What are you trying to move?</h1>
          <p>
            Start with intent. The archive appears only when it helps answer
            the question.
          </p>
        </section>

        <button
          className={styles.conciergePrompt}
          onClick={() => onOpenGuide("home")}
          type="button"
        >
          <span>Ask, find, or remember in one line</span>
          <ArrowRight size={19} />
        </button>

        <section className={styles.conciergeJobs} aria-labelledby="concierge-jobs">
          <div className={styles.sectionIndex}>
            <span id="concierge-jobs">Three jobs</span>
            <span>No setup</span>
          </div>
          <button onClick={() => onOpenGuide("find")} type="button">
            <span>01</span>
            <strong>Find the relevant relationship.</strong>
            <ArrowRight size={16} />
          </button>
          <button onClick={() => onOpenGuide("answer")} type="button">
            <span>02</span>
            <strong>Understand what changed.</strong>
            <ArrowRight size={16} />
          </button>
          <button onClick={() => onOpenGuide("remember")} type="button">
            <span>03</span>
            <strong>Remember one moment.</strong>
            <ArrowRight size={16} />
          </button>
        </section>

        <section className={styles.openRooms} aria-labelledby="open-rooms-title">
          <div className={styles.sectionIndex}>
            <span id="open-rooms-title">Open rooms</span>
            <span>Browse without Agent</span>
          </div>
          <button type="button">
            <Briefcase size={17} />
            <span>
              <strong>Chief Product Officer search</strong>
              <small>3 relationships in motion</small>
            </span>
            <CaretRight size={16} />
          </button>
          <button type="button">
            <UsersThree size={17} />
            <span>
              <strong>Leadership network</strong>
              <small>Identity review waiting</small>
            </span>
            <CaretRight size={16} />
          </button>
        </section>
      </div>

      <div className={styles.conciergeBoundary}>
        <ShieldCheck size={17} weight="fill" />
        Human ownership stays visible at every change.
      </div>
    </div>
  );
}

export function RelationshipMobileConcept({
  presentation = "study",
}: {
  presentation?: "product" | "study";
}) {
  const isProduct = presentation === "product";
  const [direction, setDirection] = useState<Direction>("archive");
  const [material, setMaterial] = useState<MaterialDirection>("museum");
  const [previewDark, setPreviewDark] = useState(false);
  const [archivePage, setArchivePage] = useState<ArchivePage>("today");
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [review, setReview] = useState<{
    kind: ReviewKind;
    person: Person;
  } | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideMode, setGuideMode] = useState<AgentMode>("home");
  const [guidePerson, setGuidePerson] = useState<Person | null>(null);

  const openGuide = (mode: AgentMode = "home", person?: Person) => {
    setGuideMode(mode);
    setGuidePerson(person ?? null);
    setGuideOpen(true);
  };

  const showPerson = (person: Person) => {
    setDirection("archive");
    setSelectedPerson(person);
    setReview(null);
    setGuideOpen(false);
  };

  const openReview = (person: Person, kind: ReviewKind = "change") => {
    setDirection("archive");
    setSelectedPerson(null);
    setReview({ kind, person });
    setGuideOpen(false);
  };

  return (
    <section
      className={`${styles.studyPage} ${isProduct ? styles.productPage : ""}`}
    >
      {!isProduct ? (
        <section className={styles.studyHeader} aria-labelledby="study-title">
        <div>
          <span>Talent Signal mobile study / Iteration 04</span>
          <h1 id="study-title">Evidence, then judgment.</h1>
          <p>
            The app returns the recruiter to one exact relationship decision.
            People remain relationships, never inventory.
          </p>
        </div>
        <div aria-label="Design direction" className={styles.directionSwitch}>
          <button
            aria-pressed={direction === "archive"}
            className={direction === "archive" ? styles.directionActive : ""}
            onClick={() => {
              setDirection("archive");
              setSelectedPerson(null);
              setReview(null);
              setArchivePage("today");
            }}
            type="button"
          >
            <ListDashes size={18} />
            <span>
              Editorial Today
              <small>Selected</small>
            </span>
          </button>
          <button
            aria-pressed={direction === "concierge"}
            className={direction === "concierge" ? styles.directionActive : ""}
            onClick={() => {
              setDirection("concierge");
              setSelectedPerson(null);
              setReview(null);
            }}
            type="button"
          >
            <Compass size={18} />
            <span>
              Agent Threshold
              <small>Challenger</small>
            </span>
          </button>
        </div>
        </section>
      ) : null}

      <section className={styles.studyStage}>
        <div className={styles.deviceColumn}>
          <div
            className={`${styles.device} ${
              material === "pebbles" ? styles.devicePebbles : ""
            } ${previewDark ? styles.deviceDark : ""}`}
          >
            <StatusBar />
            {direction === "concierge" ? (
              <ConciergeScreen onOpenGuide={openGuide} />
            ) : review ? (
              <ChangeReview
                kind={review.kind}
                onBack={() => setReview(null)}
                onOpenPerson={showPerson}
                person={review.person}
              />
            ) : selectedPerson ? (
              <PersonDetail
                onBack={() => setSelectedPerson(null)}
                onGuide={openGuide}
                person={selectedPerson}
              />
            ) : archivePage === "today" ? (
              <TodayArchive
                onGuide={openGuide}
                onLibrary={() => setArchivePage("library")}
                onPeople={() => setArchivePage("people")}
                onResume={(person) => openReview(person, "resume")}
                onReview={(person) => openReview(person)}
              />
            ) : archivePage === "library" ? (
              <LibraryArchive
                onGuide={openGuide}
                onPeople={() => setArchivePage("people")}
                onSelect={setSelectedPerson}
                onToday={() => setArchivePage("today")}
              />
            ) : (
              <PeopleArchive
                onGuide={openGuide}
                onLibrary={() => setArchivePage("library")}
                onSelect={setSelectedPerson}
                onToday={() => setArchivePage("today")}
              />
            )}

            {guideOpen ? (
              <GuideSheet
                focusPerson={guidePerson}
                initialMode={guideMode}
                onClose={() => setGuideOpen(false)}
                onOpenPerson={showPerson}
              />
            ) : null}
          </div>
        </div>

        <aside
          className={styles.decisionPanel}
          aria-label={
            isProduct
              ? "How evidence becomes a reviewable relationship change"
              : "Design decision"
          }
        >
          {direction === "archive" ? (
            <>
              {isProduct ? (
                <>
                  <span>Evidence before interpretation</span>
                  <h2>One source. One proposed change. Your decision.</h2>
                  <p>
                    The interface returns you to the exact relationship that
                    changed, explains why it deserves attention, and keeps the
                    Agent outside the decision boundary.
                  </p>
                </>
              ) : (
                <>
                  <span>Selected theorem</span>
                  <h2>Editorial Redline</h2>
                  <p>
                    One exact source and one proposed relationship change share
                    a causal composition. The Agent stays at the threshold.
                  </p>
                  <div
                    aria-label="First viewport composition"
                    className={styles.materialSwitch}
                  >
                    <button
                      aria-pressed={material === "museum"}
                      onClick={() => setMaterial("museum")}
                      type="button"
                    >
                      <span>Open Page</span>
                      <small>Selected / hierarchy through space</small>
                    </button>
                    <button
                      aria-pressed={material === "pebbles"}
                      onClick={() => setMaterial("pebbles")}
                      type="button"
                    >
                      <span>Floating Briefs</span>
                      <small>Challenger / clearer grouping, more chrome</small>
                    </button>
                  </div>
                </>
              )}

              <section className={styles.desktopReviewCard}>
                <span>Why this is here</span>
                <div className={styles.desktopQuote}>
                  <Quotes size={22} weight="fill" />
                  <blockquote>
                    &ldquo;I could do Singapore,
                    <br />
                    but not full-time relocation.&rdquo;
                  </blockquote>
                  <small>Leila / Thu 22:18 / recruiter reviewed</small>
                </div>
                <span aria-hidden="true" className={styles.desktopCausalSeam}>
                  <i />
                </span>
                <div className={styles.desktopProposal}>
                  <span>Proposed change</span>
                  <h3>Remote work remains unresolved for this search.</h3>
                  <div>
                    <button onClick={() => openReview(people[0])} type="button">
                      Keep unresolved
                    </button>
                    <button onClick={() => openReview(people[0])} type="button">
                      Review change
                    </button>
                  </div>
                </div>
              </section>

              <section className={styles.desktopResumeCard}>
                <span>Resume with context</span>
                <h3>You stopped while reviewing Nia.</h3>
                <p>Your edits are saved. No message was sent.</p>
                <div>
                  <span className={styles.libraryIcon}>
                    <NotePencil size={18} />
                  </span>
                  <span>
                    <strong>Board search</strong>
                    <small>Evidence 2 of 3</small>
                  </span>
                </div>
                <button onClick={() => openReview(people[1], "resume")} type="button">
                  Continue review
                  <ArrowRight size={17} />
                </button>
              </section>

              {!isProduct ? (
                <div aria-label="Color preview" className={styles.colorModeSwitch}>
                  <span>Preview</span>
                  <button
                    aria-pressed={!previewDark}
                    onClick={() => setPreviewDark(false)}
                    type="button"
                  >
                    Light
                  </button>
                  <button
                    aria-pressed={previewDark}
                    onClick={() => setPreviewDark(true)}
                    type="button"
                  >
                    Dark
                  </button>
                </div>
              ) : (
                <p className={styles.productInstruction}>
                  Try Today, People, and Library in the phone. Open the bottom
                  Guide to find, explain, or stage a memory. Every result uses
                  synthetic evidence and every change remains reviewable.
                </p>
              )}
            </>
          ) : (
            <>
              <span>Surviving challenger</span>
              <h2>Agent Threshold</h2>
              <p>
                Intent comes first and the archive appears on demand. Elegant
                for focused work, but weaker when the recruiter wants to scan
                people without forming a question.
              </p>
              <dl>
                <div>
                  <dt>Strength</dt>
                  <dd>Lowest visible input and strongest Agent presence.</dd>
                </div>
                <div>
                  <dt>Cost</dt>
                  <dd>Browseability and stable spatial memory are reduced.</dd>
                </div>
                <div>
                  <dt>Decision</dt>
                  <dd>Use this composition as the expanded Guide state.</dd>
                </div>
              </dl>
              <p className={styles.tryNote}>
                Return to Editorial Today for the durable home.
              </p>
            </>
          )}
        </aside>
      </section>
    </section>
  );
}
