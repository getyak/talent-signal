import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ActivityLogIcon,
  ArrowLeftIcon,
  CalendarIcon,
  CheckCircledIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleBackslashIcon,
  ClockIcon,
  CrossCircledIcon,
  DotsHorizontalIcon,
  FileIcon,
  FileTextIcon,
  HomeIcon,
  IdCardIcon,
  ImageIcon,
  Link2Icon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  PaperPlaneIcon,
  Pencil1Icon,
  PersonIcon,
  PlusIcon,
  QuestionMarkCircledIcon,
  ReaderIcon,
  ReloadIcon,
  SpeakerLoudIcon,
  UpdateIcon,
} from "@radix-ui/react-icons";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BottomSheet, KeyboardTextarea, MobileScroll, useKeyboard } from "./mobile";

const ModeratorStudyRunner = lazy(async () => {
  const module = await import("./ModeratorStudy");
  return { default: module.ModeratorStudyRunner };
});

const StudyEvidenceWorkbench = lazy(async () => {
  const module = await import("./StudyEvidenceWorkbench");
  return { default: module.StudyEvidenceWorkbench };
});

type ViewName = "today" | "session" | "new-session" | "person" | "pursuit";
type SessionMode = "review" | "ambiguous" | "insufficient" | "no-action";
type ReviewStage =
  | "fact"
  | "approval"
  | "executing"
  | "unknown"
  | "failed"
  | "reconciled"
  | "verified";
type AttachmentKind = "text" | "image" | "file" | "voice";

type Continuation = {
  name: string;
  role: string;
  dependency: string;
  meta: string;
  kind?: "ambiguous" | "insufficient" | "no-action";
};

const continuations: Continuation[] = [
  { name: "Maya Patel", role: "VP Engineering · Atlas", dependency: "Client interview feedback is overdue", meta: "Owned by you · due today" },
  { name: "Renée O'Connor", role: "CFO · Northstar", dependency: "Compensation range needs clarification", meta: "Evidence from call · 2h ago" },
  { name: "王小明-Christopher Ng", role: "Head of Data · Meridian", dependency: "Identity clue has two temporal owners", meta: "Review before attaching source", kind: "ambiguous" },
  { name: "Sam Rivera", role: "Product Director · Atlas", dependency: "Availability mention lacks a calendar date", meta: "Not enough evidence", kind: "insufficient" },
  { name: "Elena Rossi", role: "Chief of Staff · Aurora", dependency: "Reply window closes Friday", meta: "Owned by client · due Sep 4" },
  { name: "Noah Williams", role: "Design Lead · Quill", dependency: "Portfolio review remains with the client", meta: "Last evidence yesterday" },
  { name: "Priya Shah", role: "COO · Northstar", dependency: "Reference consent needs confirmation", meta: "Owned by you · due tomorrow" },
  { name: "Daniel Kim", role: "Staff Engineer · Meridian", dependency: "No current dependency", meta: "Intentional no action", kind: "no-action" },
  { name: "Louise Martin", role: "People Partner · Aurora", dependency: "Search brief changed after client review", meta: "Read 1 source update" },
  { name: "Ibrahim Haddad", role: "GM · Quill", dependency: "Interview format remains unconfirmed", meta: "Owned by client · due Sep 3" },
];

const stageFromQuery = (value: string | null): ReviewStage => {
  if (value === "approval" || value === "executing" || value === "unknown" || value === "failed" || value === "reconciled" || value === "verified") return value;
  return "fact";
};

const viewFromQuery = (value: string | null): ViewName => {
  if (value === "today" || value === "new-session" || value === "person" || value === "pursuit") return value;
  return "session";
};

const modeFromQuery = (value: string | null): SessionMode => {
  if (value === "ambiguous" || value === "insufficient" || value === "no-action") return value;
  return "review";
};

export default function Prototype() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [view, setView] = useState<ViewName>(() => viewFromQuery(params.get("view")));
  const [mode, setMode] = useState<SessionMode>(() => modeFromQuery(params.get("mode")));
  const [stage, setStage] = useState<ReviewStage>(() => stageFromQuery(params.get("stage")));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(true);
  const [composerText, setComposerText] = useState("");
  const [attachment, setAttachment] = useState<AttachmentKind>("text");
  const [identitySelection, setIdentitySelection] = useState<"current" | "historical" | null>(null);
  const [objectReturnView, setObjectReturnView] = useState<"today" | "session">("session");
  const [reducedMotionOverride] = useState(params.get("motion") === "reduced");
  const holdExecuting = params.get("hold") === "1";
  const systemReducedMotion = useReducedMotion();
  const reduceMotion = reducedMotionOverride || systemReducedMotion;
  const keyboard = useKeyboard();

  const theme = params.get("theme") === "dark" ? "dark" : "light";
  const textScale = params.get("text") === "ax5" ? "ax5" : "default";
  const longName = params.get("name") === "long" || textScale === "ax5";
  const displayName = longName ? "Alex 陈·Chen-Watanabe" : "Alex Chen";

  useEffect(() => {
    if (stage !== "executing" || holdExecuting) return;
    const timeout = window.setTimeout(() => setStage("unknown"), reduceMotion ? 0 : 900);
    return () => window.clearTimeout(timeout);
  }, [stage, reduceMotion, holdExecuting]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".app-screen")?.scrollTo({ top: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view, mode, stage]);

  if (params.get("study") === "moderator") {
    return createPortal(
      <Suspense fallback={<div className="study-loading" role="status">Preparing the synthetic study…</div>}>
        <ModeratorStudyRunner />
      </Suspense>,
      document.body,
    );
  }

  if (params.get("study") === "score" || params.get("study") === "adjudicate") {
    return createPortal(
      <Suspense fallback={<div className="study-loading" role="status">Preparing the evidence workbench…</div>}>
        <StudyEvidenceWorkbench mode={params.get("study") === "score" ? "score" : "adjudicate"} />
      </Suspense>,
      document.body,
    );
  }

  const openSession = (nextMode: SessionMode = "review") => {
    keyboard.hide();
    setMode(nextMode);
    setStage("fact");
    setView("session");
  };

  const openView = (next: ViewName) => {
    keyboard.hide();
    setView(next);
  };

  const sendIntent = () => {
    keyboard.hide();
    setMode(attachment === "image" ? "ambiguous" : "review");
    setStage("fact");
    setView("session");
  };

  const showBottomNavigation = view !== "today" && (view !== "session" || mode !== "review" || stage === "verified");

  return (
    <div className="prototype-shell" data-theme={theme} data-text-scale={textScale} data-reduced-motion={reduceMotion ? "true" : "false"}>
      <MobileScroll key={`${view}-${mode}-${stage}`} className="app-screen" aria-label="Talent Signal mobile prototype">
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={`${view}-${mode}`}
            className={`screen-content view-${view}`}
            data-testid={`view-${view}`}
            initial={reduceMotion ? false : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, x: -10 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
          >
            {view === "today" ? (
              <TodayView
                onOpenSession={openSession}
                onOpenPerson={() => { setObjectReturnView("today"); openView("person"); }}
                onOpenPursuit={() => { setObjectReturnView("today"); openView("pursuit"); }}
              />
            ) : view === "new-session" ? (
              <NewSessionView value={composerText} onChange={setComposerText} attachment={attachment} onAttachment={setAttachment} onSend={sendIntent} onBack={() => openView("today")} />
            ) : view === "person" ? (
              <PersonView onBack={() => openView(objectReturnView)} onPursuit={() => openView("pursuit")} />
            ) : view === "pursuit" ? (
              <PursuitView onBack={() => openView(objectReturnView)} onSession={() => openSession("review")} />
            ) : (
              <SessionView
                displayName={displayName}
                mode={mode}
                stage={stage}
                briefOpen={briefOpen}
                identitySelection={identitySelection}
                onBack={() => openView("today")}
                onPerson={() => { setObjectReturnView("session"); openView("person"); }}
                onPursuit={() => { setObjectReturnView("session"); openView("pursuit"); }}
                onBriefToggle={() => setBriefOpen((value) => !value)}
                onIdentitySelection={setIdentitySelection}
                onSaveIdentityReview={() => openSession("insufficient")}
                onHistory={() => setHistoryOpen(true)}
                onStage={setStage}
              />
            )}
          </motion.main>
        </AnimatePresence>
      </MobileScroll>
      {view === "session" && mode === "review" && stage === "fact" ? <FactDecisionTray onStage={setStage} /> : null}
      {view === "session" && mode === "review" && stage === "approval" ? <EffectApprovalTray onStage={setStage} /> : null}
      {view === "today" ? <TodayComposer onNew={() => openView("new-session")} /> : null}
      {showBottomNavigation ? <BottomNavigation view={view} onView={openView} onNew={() => openView("new-session")} /> : null}
      <BottomSheet open={historyOpen} onOpenChange={setHistoryOpen} title="Relationship history" description="Human decisions and observed outcomes for this Pursuit." snap={0.62}>
        <HistoryTimeline />
      </BottomSheet>
    </div>
  );
}

function BrandHeader({ back, eyebrow }: { back?: () => void; eyebrow?: string }) {
  return (
    <header className="brand-header">
      {back ? (
        <button className="icon-button" type="button" onClick={back} aria-label="Back"><ArrowLeftIcon /></button>
      ) : (
        <img className="brand-mark" src="/assets/talent-signal-mark.png" alt="Talent Signal" draggable={false} />
      )}
      {eyebrow ? <span className="header-eyebrow">{eyebrow}</span> : null}
      <button className="icon-button header-more" type="button" aria-label="More options"><DotsHorizontalIcon /></button>
    </header>
  );
}

function SessionBrandHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="session-brand-header">
      <button className="session-brand-back" type="button" onClick={onBack} aria-label="Back to Today">
        <img className="brand-mark" src="/assets/talent-signal-mark.png" alt="" draggable={false} />
      </button>
    </header>
  );
}

function TodayView({
  onOpenSession, onOpenPerson, onOpenPursuit,
}: {
  onOpenSession: (mode?: SessionMode) => void; onOpenPerson: () => void; onOpenPursuit: () => void;
}) {
  return (
    <div className="today-page">
      <nav className="today-navigation" aria-label="Relationship workspace">
        <button className="today-menu" type="button" aria-label="Open Talent Signal menu">
          <span><img src="/assets/today-signal-orb.png" alt="" draggable={false} /></span>
        </button>
        <div className="today-tabs">
          <button className="active" type="button" aria-current="page">Today</button>
          <button type="button" onClick={() => onOpenSession("review")}>Sessions</button>
          <button type="button" onClick={onOpenPerson}>People</button>
        </div>
      </nav>

      <header className="today-heading">
        <p>Tuesday, September 1</p>
        <h1 id="today-title">Today</h1>
        <span>11 to consider</span>
      </header>

      <section className="today-attention" aria-labelledby="attention-title">
        <h2 id="attention-title">People needing attention</h2>
        <article className="today-focus-card">
          <div className="today-focus-eyebrow"><span>Decision due · needs review</span><time dateTime="2026-09-02">Wed, Sep 2</time></div>
          <h3>Alex Chen</h3>
          <p className="today-focus-role">Aurora · Staff Product Designer</p>
          <p className="today-focus-summary">Remote policy is still unresolved before Alex’s decision.</p>
          <dl className="today-focus-context">
            <div><dt>Target outcome</dt><dd>Appoint Aurora’s Staff Product Designer</dd></div>
            <div><dt>Target date</dt><dd>Sep 18, 2026</dd></div>
          </dl>
          <p className="today-focus-evidence"><Link2Icon aria-hidden="true" /> WhatsApp · Today 10:42</p>
          <button className="today-primary-action" type="button" onClick={() => onOpenSession("review")}>
            <span>Review one supported fact</span><ChevronRightIcon aria-hidden="true" />
          </button>
          <button className="today-secondary-action" type="button" onClick={onOpenPursuit}>Open Pursuit</button>
        </article>
      </section>

      <section className="continuations" aria-labelledby="continuations-title">
        <div className="section-heading-row"><h2 id="continuations-title">Next</h2><span>10</span></div>
        <div className="continuation-list">
          {continuations.map((item) => (
            <button className="continuation-row" type="button" key={item.name} onClick={() => onOpenSession(item.kind ?? "review")}>
              <span className="continuation-main">
                <strong>{item.name}</strong><span>{item.role}</span><span className="continuation-dependency">{item.dependency}</span>
              </span>
              <span className="continuation-state"><small>{item.meta}</small><ChevronRightIcon aria-hidden="true" /></span>
            </button>
          ))}
        </div>
      </section>
      <p className="no-action-count">3 Pursuits have no current action.</p>
    </div>
  );
}

function TodayComposer({ onNew }: { onNew: () => void }) {
  return (
    <button className="today-composer" type="button" onClick={onNew} aria-label="Ask anything or start a new Session">
      <span className="today-composer-mark"><img src="/assets/today-signal-orb.png" alt="" draggable={false} /></span>
      <span>Ask anything</span>
      <SpeakerLoudIcon aria-hidden="true" />
    </button>
  );
}

function SessionView({
  displayName, mode, stage, briefOpen, identitySelection, onBack, onPerson, onPursuit, onBriefToggle, onIdentitySelection, onSaveIdentityReview, onHistory, onStage,
}: {
  displayName: string; mode: SessionMode; stage: ReviewStage; briefOpen: boolean; identitySelection: "current" | "historical" | null;
  onBack: () => void; onPerson: () => void; onPursuit: () => void; onBriefToggle: () => void;
  onIdentitySelection: (value: "current" | "historical" | null) => void; onSaveIdentityReview: () => void; onHistory: () => void; onStage: (stage: ReviewStage) => void;
}) {
  return (
    <div className={`session-page mode-${mode} stage-${stage}`}>
      <SessionBrandHeader onBack={onBack} />
      <section className="identity-block" aria-labelledby="session-person">
        <button type="button" className="identity-link" onClick={onPerson}><h1 id="session-person">{displayName}</h1><ChevronRightIcon aria-hidden="true" /></button>
        <button type="button" className="pursuit-link" onClick={onPursuit}>Aurora · Staff Product Designer</button>
      </section>
      {mode === "review" ? (
        <ReviewSession stage={stage} briefOpen={briefOpen} onBriefToggle={onBriefToggle} onHistory={onHistory} onStage={onStage} />
      ) : mode === "ambiguous" ? (
        <AmbiguousIdentity selection={identitySelection} onSelection={onIdentitySelection} onSaveReview={onSaveIdentityReview} />
      ) : mode === "insufficient" ? <InsufficientEvidence onHistory={onHistory} /> : <NoAction onHistory={onHistory} />}
    </div>
  );
}

function ReviewSession({ stage, briefOpen, onBriefToggle, onHistory, onStage }: { stage: ReviewStage; briefOpen: boolean; onBriefToggle: () => void; onHistory: () => void; onStage: (stage: ReviewStage) => void }) {
  return (
    <>
      <section className="dependency-block" aria-labelledby="dependency-title">
        <div className="dependency-row"><PersonIcon aria-hidden="true" /><p>Needs your review</p></div>
        <div className="dependency-row consequence"><CalendarIcon aria-hidden="true" /><p>Decision due <strong>Wed, Sep 2</strong></p></div>
        <div className="dependency-divider" />
        <div className="dependency-row dependency-expandable"><Link2Icon aria-hidden="true" /><p id="dependency-title">Remote policy is still unresolved</p><ChevronDownIcon className="dependency-chevron" aria-hidden="true" /></div>
      </section>
      <section className="source-block" aria-labelledby="source-heading">
        <div className="source-heading-row">
          <p className="source-meta" id="source-heading">SOURCE · WhatsApp · Today 10:42</p>
          <button type="button" className="source-open-icon" aria-label="Open exact source"><ChevronRightIcon aria-hidden="true" /></button>
        </div>
        <blockquote>“I need to decide by Wednesday. Remote matters a lot.”</blockquote>
      </section>
      <div className="causal-seam" aria-hidden="true"><span /></div>
      <section className="brief-block" aria-labelledby="brief-heading">
        <button type="button" className="brief-toggle" onClick={onBriefToggle} aria-expanded={briefOpen}>
          <span><span className="brief-label" id="brief-heading">BRIEF</span><small>· Session + Aurora</small></span>
          <ChevronDownIcon aria-hidden="true" />
        </button>
        {briefOpen ? <p>Confirm the deadline before planning any follow-up.</p> : null}
      </section>
      {stage === "verified" ? <VerifiedReceipt onHistory={onHistory} /> : <ReviewProgress stage={stage} onStage={onStage} />}
    </>
  );
}

function FactDecisionTray({ onStage }: { onStage: (stage: ReviewStage) => void }) {
  return (
    <section className="decision-tray" aria-labelledby="fact-decision-title" data-testid="fact-decision-tray">
      <div className="tray-handle" aria-hidden="true" /><p className="kicker">FACT 1 OF 1</p>
      <div className="fact-title-row"><FileTextIcon aria-hidden="true" /><h2 id="fact-decision-title">Decision deadline</h2></div>
      <div className="state-diff" aria-label="Decision deadline changes from unknown to Wednesday September 2">
        <span className="old-value"><QuestionMarkCircledIcon aria-hidden="true" /> Unknown</span><span aria-hidden="true">→</span><strong><CalendarIcon aria-hidden="true" /> Wed, Sep 2</strong>
      </div>
      <div className="decision-actions">
        <button className="primary-button" type="button" onClick={() => onStage("approval")}><CheckCircledIcon aria-hidden="true" />Confirm fact</button>
        <button className="secondary-button" type="button"><Pencil1Icon aria-hidden="true" />Edit</button>
        <button className="secondary-button" type="button" onClick={() => onStage("failed")}><CircleBackslashIcon aria-hidden="true" />Not supported</button>
      </div>
      <button className="locked-next" type="button" disabled><PaperPlaneIcon aria-hidden="true" />Next: review exact effect<LockClosedIcon aria-hidden="true" /></button>
    </section>
  );
}

function EffectApprovalTray({ onStage }: { onStage: (stage: ReviewStage) => void }) {
  return (
    <section className="decision-tray effect-tray" aria-labelledby="effect-title" data-testid="effect-approval-tray">
      <div className="tray-handle" aria-hidden="true" /><p className="kicker">SEPARATE ACTION DECISION</p><h2 id="effect-title">Create one local reminder</h2>
      <dl className="effect-details">
        <div><dt>Target</dt><dd>Talent Signal · Aurora Pursuit</dd></div>
        <div><dt>When</dt><dd>Today at 15:00</dd></div>
        <div><dt>Exact effect</dt><dd>Create a recruiter-owned reminder. No message, meeting, contact, ATS, or CRM write.</dd></div>
      </dl>
      <button className="primary-button" type="button" onClick={() => onStage("executing")}><CheckCircledIcon aria-hidden="true" />Approve exact effect</button>
      <button className="text-button" type="button" onClick={() => onStage("fact")}>Back to fact</button>
    </section>
  );
}

function ReviewProgress({ stage, onStage }: { stage: ReviewStage; onStage: (stage: ReviewStage) => void }) {
  if (stage === "fact" || stage === "approval") return <div className="decision-spacer" aria-hidden="true" />;
  const states = {
    executing: { icon: <UpdateIcon />, label: "EXECUTING", title: "Creating the approved reminder…", copy: "The original operation ID is reserved. A retry cannot create another reminder." },
    unknown: { icon: <QuestionMarkCircledIcon />, label: "OUTCOME UNKNOWN", title: "The request may have reached the device.", copy: "Do not retry yet. Read back the exact operation before deciding what happened." },
    failed: { icon: <CrossCircledIcon />, label: "NOT APPLIED", title: "The reminder could not be created.", copy: "The confirmed fact remains. The separate action proposal is preserved and nothing external changed." },
    reconciled: { icon: <ReloadIcon />, label: "RECONCILED", title: "One matching reminder was found.", copy: "Exact-ID readback matches the approved operation. Record the observed result to close the action." },
  };
  const current = states[stage as keyof typeof states];
  return (
    <section className={`result-state result-${stage}`} aria-live="polite" data-testid={`result-${stage}`}>
      <div className="result-icon" aria-hidden="true">{current.icon}</div><p className="kicker">{current.label}</p><h2>{current.title}</h2><p>{current.copy}</p>
      {stage === "unknown" ? (
        <div className="result-actions"><button className="primary-button" type="button" onClick={() => onStage("reconciled")}><ReloadIcon aria-hidden="true" />Reconcile result</button><button className="text-button" type="button" onClick={() => onStage("failed")}>Show failed readback</button></div>
      ) : stage === "failed" ? (
        <button className="secondary-button" type="button" onClick={() => onStage("approval")}>Review preserved proposal</button>
      ) : stage === "reconciled" ? (
        <button className="primary-button" type="button" onClick={() => onStage("verified")}><CheckIcon aria-hidden="true" />Record verified outcome</button>
      ) : null}
    </section>
  );
}

function VerifiedReceipt({ onHistory }: { onHistory: () => void }) {
  return (
    <section className="receipt" aria-labelledby="receipt-title" data-testid="verified-receipt">
      <div className="receipt-status"><CheckCircledIcon aria-hidden="true" /><span>VERIFIED</span></div>
      <h2 id="receipt-title">Reminder created and read back.</h2>
      <p>This Receipt belongs to the same Session. It records the local effect without claiming a message was sent.</p>
      <dl><div><dt>Observed</dt><dd>Today · 15:00 reminder</dd></div><div><dt>Owner</dt><dd>You</dd></div><div><dt>Operation</dt><dd>TS-RM-2048 · revision 1</dd></div></dl>
      <button className="secondary-button" type="button" onClick={onHistory}><ActivityLogIcon aria-hidden="true" />Open history</button>
    </section>
  );
}

function AmbiguousIdentity({ selection, onSelection, onSaveReview }: { selection: "current" | "historical" | null; onSelection: (value: "current" | "historical" | null) => void; onSaveReview: () => void }) {
  return (
    <section className="identity-review" aria-labelledby="identity-review-title">
      <div className="state-heading"><IdCardIcon aria-hidden="true" /><div><p className="kicker">IDENTITY NEEDS REVIEW</p><h2 id="identity-review-title">This phone clue has two temporal owners.</h2></div></div>
      <p>No person is selected. Compare the source-linked periods before attaching this evidence.</p>
      <div className="comparison-list" role="radiogroup" aria-label="Possible identity owners">
        <button type="button" role="radio" aria-checked={selection === "current"} className={`comparison-option ${selection === "current" ? "selected" : ""}`} onClick={() => onSelection(selection === "current" ? null : "current")}>
          <span className="comparison-status">CURRENT CLUE</span><strong>Alex 陈·Chen-Watanabe</strong><span>Aurora · supported Aug 28–present</span><small>Source: recruiter-confirmed contact card</small>
        </button>
        <button type="button" role="radio" aria-checked={selection === "historical"} className={`comparison-option ${selection === "historical" ? "selected" : ""}`} onClick={() => onSelection(selection === "historical" ? null : "historical")}>
          <span className="comparison-status">HISTORICAL CLUE</span><strong>Alex Chen</strong><span>Quill · expired Jun 30</span><small>Relationship attachment stays disabled</small>
        </button>
      </div>
      <button className="primary-button" type="button" disabled={!selection || selection === "historical"}>Attach source to current relationship</button>
      <button className="secondary-button" type="button" onClick={onSaveReview}>Save for identity review</button>
      <button className="locked-next" type="button" disabled><LockClosedIcon aria-hidden="true" />Create new person unavailable during conflict</button>
    </section>
  );
}

function InsufficientEvidence({ onHistory }: { onHistory: () => void }) {
  return (
    <section className="restrained-state" aria-labelledby="insufficient-title">
      <div className="state-symbol" aria-hidden="true"><QuestionMarkCircledIcon /></div><p className="kicker">NOT ENOUGH EVIDENCE</p><h2 id="insufficient-title">“Next week” has no calendar date or timezone.</h2>
      <p>The source remains in this Session, but no current fact or reminder was proposed.</p>
      <div className="source-snippet"><span>SOURCE · WhatsApp · Today 11:18</span><blockquote>“I should be free next week.”</blockquote></div>
      <button className="secondary-button" type="button">Ask one clarifying question</button><button className="text-button" type="button" onClick={onHistory}>Save without action</button>
    </section>
  );
}

function NoAction({ onHistory }: { onHistory: () => void }) {
  return (
    <section className="restrained-state no-action-state" aria-labelledby="no-action-title">
      <div className="state-symbol verified" aria-hidden="true"><CheckIcon /></div><p className="kicker">NO ACTION</p><h2 id="no-action-title">Nothing needs to be created right now.</h2>
      <p>The reply resolved the open question. Revisit only if the candidate's decision date changes.</p>
      <div className="no-action-condition"><ClockIcon aria-hidden="true" /><span>Revisit condition: new evidence changes the Sep 2 deadline.</span></div>
      <button className="secondary-button" type="button" onClick={onHistory}><ActivityLogIcon aria-hidden="true" />View history</button>
    </section>
  );
}

function NewSessionView({ value, onChange, attachment, onAttachment, onSend, onBack }: { value: string; onChange: (value: string) => void; attachment: AttachmentKind; onAttachment: (value: AttachmentKind) => void; onSend: () => void; onBack: () => void }) {
  const labels = { text: "Text intent", image: "One image · processed for this Session", file: "One file · review before use", voice: "Voice capture · stops on interruption" };
  const attachmentIcon = attachment === "image" ? <ImageIcon /> : attachment === "file" ? <FileIcon /> : attachment === "voice" ? <SpeakerLoudIcon /> : <ReaderIcon />;
  return (
    <div className="new-session-page">
      <BrandHeader back={onBack} eyebrow="NEW SESSION" />
      <section className="new-session-intro"><p className="kicker">ONE RELATIONSHIP CONTEXT</p><h1>What should we understand or prepare?</h1><p>Start with intent. Evidence and every consequential decision stay reviewable afterward.</p></section>
      <div className="intent-types" role="group" aria-label="Session input type">
        <IntentButton active={attachment === "text"} label="Text" icon={<ReaderIcon />} onClick={() => onAttachment("text")} />
        <IntentButton active={attachment === "image"} label="Image" icon={<ImageIcon />} onClick={() => onAttachment("image")} />
        <IntentButton active={attachment === "file"} label="File" icon={<FileIcon />} onClick={() => onAttachment("file")} />
        <IntentButton active={attachment === "voice"} label="Voice" icon={<SpeakerLoudIcon />} onClick={() => onAttachment("voice")} />
      </div>
      <div className="attachment-readback" aria-live="polite"><span aria-hidden="true">{attachmentIcon}</span><span>{labels[attachment]}</span></div>
      <label className="composer-field"><span>Intent</span><KeyboardTextarea value={value} onChange={(event) => onChange(event.currentTarget.value)} placeholder="For example: what changed, and is one follow-up needed?" rows={5} /></label>
      <p className="privacy-note"><LockClosedIcon aria-hidden="true" />Raw source stays purpose-bound to this Session. Sending does not approve a write.</p>
      <button className="primary-button" type="button" onClick={onSend} disabled={attachment === "text" && value.trim().length === 0}><PaperPlaneIcon aria-hidden="true" />Send to this Session</button>
    </div>
  );
}

function IntentButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: ReactNode; onClick: () => void }) {
  return <button type="button" className={`intent-button ${active ? "active" : ""}`} aria-pressed={active} onClick={onClick}><span aria-hidden="true">{icon}</span>{label}</button>;
}

function PersonView({ onBack, onPursuit }: { onBack: () => void; onPursuit: () => void }) {
  return <div className="object-page"><BrandHeader back={onBack} eyebrow="PERSON" /><section className="object-heading"><p className="kicker">CURRENT RELATIONSHIP</p><h1>Alex 陈·Chen-Watanabe</h1><button type="button" onClick={onPursuit}>Aurora · Staff Product Designer</button></section><ObjectSequence /></div>;
}

function PursuitView({ onBack, onSession }: { onBack: () => void; onSession: () => void }) {
  return <div className="object-page"><BrandHeader back={onBack} eyebrow="PURSUIT" /><section className="object-heading"><p className="kicker">TARGET OUTCOME</p><h1>Appoint Aurora's Staff Product Designer</h1><p>Target date · Sep 18, 2026</p></section><ObjectSequence /><button className="secondary-button" type="button" onClick={onSession}><ReaderIcon aria-hidden="true" />Return to Session</button></div>;
}

function ObjectSequence() {
  return <div className="object-sequence"><section><span>CHANGE / DEPENDENCY</span><h2>Decision due Sep 2; remote policy unresolved.</h2></section><section><span>EVIDENCE</span><p>WhatsApp · Today 10:42 · exact fragment available</p></section><section><span>NEXT MOVE</span><p>Review one local reminder effect after confirming the deadline.</p></section><section><span>HISTORY</span><p>One source · one pending fact · no external write</p></section></div>;
}

function BottomNavigation({ view, onView, onNew }: { view: ViewName; onView: (view: ViewName) => void; onNew: () => void }) {
  return (
    <nav className="bottom-navigation" aria-label="Primary">
      <button type="button" className={view === "today" ? "active" : ""} onClick={() => onView("today")}><HomeIcon aria-hidden="true" /><span>Today</span></button>
      <button type="button" className={view === "session" ? "active" : ""} onClick={() => onView("session")}><ReaderIcon aria-hidden="true" /><span>Sessions</span></button>
      <button type="button" className="new-session-button" onClick={onNew} aria-label="New Session"><PlusIcon aria-hidden="true" /></button>
      <button type="button" className={view === "person" ? "active" : ""} onClick={() => onView("person")}><PersonIcon aria-hidden="true" /><span>People</span></button>
      <button type="button"><MagnifyingGlassIcon aria-hidden="true" /><span>Find</span></button>
    </nav>
  );
}

function HistoryTimeline() {
  return (
    <ol className="history-timeline">
      <li><span className="history-icon verified"><CheckCircledIcon aria-hidden="true" /></span><div><strong>Reminder verified</strong><span>Today 10:48 · operation TS-RM-2048</span></div></li>
      <li><span className="history-icon"><PersonIcon aria-hidden="true" /></span><div><strong>Exact effect approved by recruiter</strong><span>Today 10:46 · local reminder only</span></div></li>
      <li><span className="history-icon"><FileTextIcon aria-hidden="true" /></span><div><strong>Decision deadline confirmed</strong><span>Today 10:45 · Unknown → Sep 2</span></div></li>
      <li><span className="history-icon"><Link2Icon aria-hidden="true" /></span><div><strong>WhatsApp evidence attached</strong><span>Today 10:42 · exact fragment retained</span></div></li>
    </ol>
  );
}
