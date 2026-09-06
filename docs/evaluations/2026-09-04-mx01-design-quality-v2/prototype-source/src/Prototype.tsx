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
import { AnimatePresence, motion } from "motion/react";
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
  | "rejected"
  | "approval"
  | "executing"
  | "unknown"
  | "failed"
  | "verified";
type AttachmentKind = "text" | "image" | "file" | "voice";

type SessionContext = {
  name: string;
  role: string;
  dependency: string;
  meta: string;
};

type FactRevision = {
  value: string;
  basis: "source_excerpt" | "recruiter_correction";
  revision: number;
  confirmedBy: "Recruiter";
};

type EffectPayload = {
  destination: string;
  title: string;
  note: string;
  when: string;
  fingerprint: string;
};

type Continuation = SessionContext & {
  kind?: "ambiguous" | "insufficient" | "no-action";
};

const leadContext: SessionContext = {
  name: "Alex Chen",
  role: "Aurora · Staff Product Designer",
  dependency: "Remote policy is still unresolved before Alex's decision",
  meta: "Decision due Wed, Sep 2, 2026",
};

const sourceFactValue = "Wed, Sep 2, 2026";

const initialFactRevision: FactRevision = {
  value: sourceFactValue,
  basis: "source_excerpt",
  revision: 1,
  confirmedBy: "Recruiter",
};

function buildEffectPayload(context: SessionContext, fact: FactRevision): EffectPayload {
  return {
    destination: "Apple Reminders · Recruiter Follow-up",
    title: `${context.name} · confirm remote policy before decision`,
    note: `${context.role}. Confirm the unresolved remote-policy dependency before the ${fact.value} decision.`,
    when: "Tue, Sep 1, 2026 · 3:00 PM · Asia/Shanghai (UTC+08:00)",
    fingerprint: `TS-RM-2048 · fact r${fact.revision}`,
  };
}

const continuations: Continuation[] = [
  { name: "Maya Patel", role: "VP Engineering · Atlas", dependency: "Client interview feedback is overdue", meta: "Owned by you · due Sep 1, 2026", kind: "insufficient" },
  { name: "Renée O'Connor", role: "CFO · Northstar", dependency: "Compensation range needs clarification", meta: "Call evidence · Sep 1, 08:20", kind: "insufficient" },
  { name: "Alex 陈·Chen-Watanabe", role: "Staff Product Designer · Aurora / Quill", dependency: "Identity clue has two temporal owners", meta: "Review before attaching source", kind: "ambiguous" },
  { name: "Sam Rivera", role: "Product Director · Atlas", dependency: "Availability mention lacks a calendar date", meta: "Not enough evidence", kind: "insufficient" },
  { name: "Elena Rossi", role: "Chief of Staff · Aurora", dependency: "Reply window closes Friday", meta: "Owned by client · due Sep 4, 2026", kind: "insufficient" },
  { name: "Noah Williams", role: "Design Lead · Quill", dependency: "Portfolio review remains with the client", meta: "Last evidence Aug 31, 2026", kind: "no-action" },
  { name: "Priya Shah", role: "COO · Northstar", dependency: "Reference consent needs confirmation", meta: "Owned by you · due Sep 2, 2026", kind: "insufficient" },
  { name: "Daniel Kim", role: "Staff Engineer · Meridian", dependency: "No current dependency", meta: "Intentional no action", kind: "no-action" },
  { name: "Louise Martin", role: "People Partner · Aurora", dependency: "No recruiter-owned move after the brief change", meta: "Intentional no action · Sep 1", kind: "no-action" },
  { name: "Ibrahim Haddad", role: "GM · Quill", dependency: "Interview format remains unconfirmed", meta: "Owned by client · due Sep 3, 2026", kind: "insufficient" },
];

const stageFromQuery = (value: string | null): ReviewStage => {
  if (value === "rejected" || value === "approval" || value === "executing" || value === "unknown" || value === "failed" || value === "verified") return value;
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

function useResolvedReducedMotion(forceReduced: boolean) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener?.("change", handleChange);
    return () => mediaQuery.removeEventListener?.("change", handleChange);
  }, []);

  return forceReduced || prefersReducedMotion;
}

export default function Prototype() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [view, setView] = useState<ViewName>(() => viewFromQuery(params.get("view")));
  const [mode, setMode] = useState<SessionMode>(() => modeFromQuery(params.get("mode")));
  const initialStage = stageFromQuery(params.get("stage"));
  const [stage, setStage] = useState<ReviewStage>(initialStage);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [attachment, setAttachment] = useState<AttachmentKind>("text");
  const [identitySelection, setIdentitySelection] = useState<"current" | "historical" | null>(null);
  const [activeContext, setActiveContext] = useState<SessionContext>(leadContext);
  const [factEditorOpen, setFactEditorOpen] = useState(false);
  const [factValue, setFactValue] = useState(sourceFactValue);
  const [confirmedFact, setConfirmedFact] = useState<FactRevision | null>(() => initialStage === "fact" || initialStage === "rejected" ? null : initialFactRevision);
  const [objectReturnView, setObjectReturnView] = useState<"today" | "session">("session");
  const [reducedMotionOverride] = useState(params.get("motion") === "reduced");
  const holdExecuting = params.get("hold") === "1";
  const reduceMotion = useResolvedReducedMotion(reducedMotionOverride);
  const keyboard = useKeyboard();

  const theme = params.get("theme") === "dark" ? "dark" : "light";
  const textScale = params.get("text") === "ax5" ? "ax5" : "default";
  const longName = params.get("name") === "long" || textScale === "ax5";
  const displayName = longName ? "Alex 陈·Chen-Watanabe" : "Alex Chen";

  const resetViewport = () => {
    document
      .querySelectorAll<HTMLElement>('[data-testid="mobile-scroll"], [data-testid="device-screen"]')
      .forEach((element) => element.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  };

  const settleViewport = () => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }

    resetViewport();
    window.setTimeout(resetViewport, reduceMotion ? 0 : 160);
    window.setTimeout(resetViewport, reduceMotion ? 0 : 420);
  };

  useEffect(() => {
    if (stage !== "executing" || holdExecuting) return;
    const timeout = window.setTimeout(() => setStage("unknown"), reduceMotion ? 0 : 900);
    return () => window.clearTimeout(timeout);
  }, [stage, reduceMotion, holdExecuting]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      settleViewport();
    });
    const settle = window.setTimeout(settleViewport, reduceMotion ? 0 : 220);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [view, mode, stage, reduceMotion]);

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

  const openSession = (nextMode: SessionMode = "review", context: SessionContext = leadContext) => {
    keyboard.hide();
    setActiveContext(context);
    setMode(nextMode);
    setStage("fact");
    setIdentitySelection(null);
    setFactEditorOpen(false);
    setFactValue(sourceFactValue);
    setConfirmedFact(null);
    setView("session");
    settleViewport();
  };

  const openView = (next: ViewName) => {
    keyboard.hide();
    setView(next);
    settleViewport();
  };

  const sendIntent = () => {
    keyboard.hide();
    setMode(attachment === "image" && /identity|same name|who is/i.test(composerText) ? "ambiguous" : "review");
    setActiveContext(leadContext);
    setStage("fact");
    setIdentitySelection(null);
    setFactValue(sourceFactValue);
    setConfirmedFact(null);
    setView("session");
    settleViewport();
  };

  const showBottomNavigation =
    view === "person" ||
    view === "pursuit";

  const confirmFact = (value: string) => {
    const normalizedValue = value.trim();
    if (!normalizedValue) return;
    keyboard.hide();
    setConfirmedFact({
      value: normalizedValue,
      basis: normalizedValue === sourceFactValue ? "source_excerpt" : "recruiter_correction",
      revision: (confirmedFact?.revision ?? 0) + 1,
      confirmedBy: "Recruiter",
    });
    setStage("approval");
  };

  const effectiveFact = confirmedFact ?? initialFactRevision;
  const effectPayload = buildEffectPayload(activeContext, effectiveFact);
  const reconcileApprovedEffect = () => {
    const observedEffect = params.get("readback") === "mismatch"
      ? { ...effectPayload, when: "No matching reminder found" }
      : { ...effectPayload };
    const exactMatch = (Object.keys(effectPayload) as Array<keyof EffectPayload>)
      .every((key) => observedEffect[key] === effectPayload[key]);
    setStage(exactMatch ? "verified" : "failed");
  };
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
                onOpenPerson={() => { setActiveContext(leadContext); setObjectReturnView("today"); openView("person"); }}
              />
            ) : view === "new-session" ? (
              <NewSessionView value={composerText} onChange={setComposerText} attachment={attachment} onAttachment={setAttachment} onSend={sendIntent} onBack={() => openView("today")} />
            ) : view === "person" ? (
              <PersonView context={activeContext} onBack={() => openView(objectReturnView)} onPursuit={() => openView("pursuit")} />
            ) : view === "pursuit" ? (
              <PursuitView context={activeContext} onBack={() => openView(objectReturnView)} onSession={() => openSession("review", activeContext)} />
            ) : (
              <SessionView
                displayName={activeContext.name === leadContext.name ? displayName : activeContext.name}
                pursuitLabel={activeContext.role}
                context={activeContext}
                mode={mode}
                stage={stage}
                fact={effectiveFact}
                factValue={factValue}
                factEditorOpen={factEditorOpen}
                effect={effectPayload}
                identitySelection={identitySelection}
                onBack={() => openView("today")}
                onPerson={() => { setObjectReturnView("session"); openView("person"); }}
                onPursuit={() => { setObjectReturnView("session"); openView("pursuit"); }}
                onFactValue={setFactValue}
                onFactEditorOpen={setFactEditorOpen}
                onConfirmFact={confirmFact}
                onReconcileEffect={reconcileApprovedEffect}
                onIdentitySelection={setIdentitySelection}
                onHistory={() => setHistoryOpen(true)}
                onStage={setStage}
              />
            )}
          </motion.main>
        </AnimatePresence>
      </MobileScroll>
      {view === "today" ? <TodayComposer onNew={() => openView("new-session")} /> : null}
      {showBottomNavigation ? <BottomNavigation view={view} onView={openView} onNew={() => openView("new-session")} /> : null}
      <BottomSheet open={historyOpen} onOpenChange={setHistoryOpen} title="Relationship history" description="Human decisions and observed outcomes for this Pursuit." snap={0.62}>
        <HistoryTimeline context={activeContext} mode={mode} stage={stage} fact={confirmedFact} effect={effectPayload} />
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
    </header>
  );
}

function SessionBrandHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="session-brand-header">
      <button className="session-brand-back" type="button" onClick={onBack} aria-label="Back to Today">
        <ArrowLeftIcon aria-hidden="true" />
      </button>
    </header>
  );
}

function TodayView({
  onOpenSession, onOpenPerson,
}: {
  onOpenSession: (mode?: SessionMode, context?: SessionContext) => void; onOpenPerson: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <div className="today-page">
      <nav className="today-navigation" aria-label="Relationship workspace">
        <span className="today-menu" aria-hidden="true">
          <span><img src="/assets/today-signal-orb.png" alt="" draggable={false} /></span>
        </span>
        <div className="today-tabs">
          <button className="active" type="button" aria-current="page">Today</button>
          <button type="button" onClick={() => onOpenSession("review")}>Sessions</button>
          <button type="button" onClick={onOpenPerson}>People</button>
        </div>
      </nav>

      <header className="today-heading">
        <p>Tuesday, September 1, 2026</p>
        <h1 id="today-title">Today</h1>
      </header>

      <section className="today-attention" aria-labelledby="attention-title">
        <h2 id="attention-title">One decision now</h2>
        <article className="today-focus-card">
          <div className="today-focus-eyebrow"><span>Needs review</span><time dateTime="2026-09-02">Due Wed, Sep 2</time></div>
          <h3>Alex Chen</h3>
          <p className="today-focus-role">Aurora · Staff Product Designer</p>
          <p className="today-focus-summary">Alex needs to decide Wed, Sep 2. Remote policy is still unresolved.</p>
          <blockquote className="today-focus-quote">“I need to decide by Wednesday. Remote matters a lot.”</blockquote>
          <p className="today-focus-evidence"><Link2Icon aria-hidden="true" /> WhatsApp · Sep 1 · 10:42</p>
          <button className="today-primary-action" type="button" onClick={() => onOpenSession("review")}>
            <span>Review the deadline</span><ChevronRightIcon aria-hidden="true" />
          </button>
        </article>
      </section>

      <section className="continuations" aria-labelledby="continuations-title">
        <button className="continuations-toggle" type="button" onClick={() => setMoreOpen((value) => !value)} aria-expanded={moreOpen} aria-controls="more-today-items">
          <span><strong id="continuations-title">More today</strong><small>10 items · 3 intentionally quiet</small></span>
          <ChevronDownIcon aria-hidden="true" />
        </button>
        {moreOpen ? (
          <div className="continuation-list" id="more-today-items">
            {continuations.map((item) => (
              <button className="continuation-row" type="button" key={`${item.name}-${item.role}`} onClick={() => onOpenSession(item.kind ?? "insufficient", item)}>
                <span className="continuation-main">
                  <strong>{item.name}</strong><span>{item.role}</span><span className="continuation-dependency">{item.dependency}</span>
                </span>
                <span className="continuation-state"><small>{item.meta}</small><ChevronRightIcon aria-hidden="true" /></span>
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function TodayComposer({ onNew }: { onNew: () => void }) {
  return (
    <div className="today-composer-dock">
      <button className="today-composer" type="button" onClick={onNew} aria-label="Ask anything or start a new Session">
        <span className="today-composer-mark"><img src="/assets/today-signal-orb.png" alt="" draggable={false} /></span>
        <span>Ask anything</span>
        <SpeakerLoudIcon aria-hidden="true" />
      </button>
    </div>
  );
}

function SessionView({
  displayName, pursuitLabel, context, mode, stage, fact, factValue, factEditorOpen, effect, identitySelection, onBack, onPerson, onPursuit, onFactValue, onFactEditorOpen, onConfirmFact, onReconcileEffect, onIdentitySelection, onHistory, onStage,
}: {
  displayName: string; pursuitLabel: string; context: SessionContext; mode: SessionMode; stage: ReviewStage; fact: FactRevision; factValue: string; factEditorOpen: boolean; effect: EffectPayload; identitySelection: "current" | "historical" | null;
  onBack: () => void; onPerson: () => void; onPursuit: () => void; onFactValue: (value: string) => void; onFactEditorOpen: (open: boolean) => void; onConfirmFact: (value: string) => void; onReconcileEffect: () => void;
  onIdentitySelection: (value: "current" | "historical" | null) => void; onHistory: () => void; onStage: (stage: ReviewStage) => void;
}) {
  return (
    <div className={`session-page mode-${mode} stage-${stage}`}>
      <SessionBrandHeader onBack={onBack} />
      {mode === "ambiguous" ? (
        <section className="identity-block identity-unbound" aria-labelledby="session-person">
          <p className="kicker">UNBOUND SOURCE</p>
          <h1 id="session-person">No person selected</h1>
          <p>No Pursuit is selected until you confirm the source owner.</p>
        </section>
      ) : (
        <section className="identity-block" aria-labelledby="session-person">
          <button type="button" className="identity-link" onClick={onPerson}><h1 id="session-person">{displayName}</h1><ChevronRightIcon aria-hidden="true" /></button>
          <button type="button" className="pursuit-link" onClick={onPursuit}>{pursuitLabel}</button>
        </section>
      )}
      {mode === "review" ? (
        <ReviewSession stage={stage} fact={fact} factValue={factValue} factEditorOpen={factEditorOpen} effect={effect} onFactValue={onFactValue} onFactEditorOpen={onFactEditorOpen} onConfirmFact={onConfirmFact} onReconcileEffect={onReconcileEffect} onDone={onBack} onHistory={onHistory} onStage={onStage} />
      ) : mode === "ambiguous" ? (
        <AmbiguousIdentity selection={identitySelection} onSelection={onIdentitySelection} />
      ) : mode === "insufficient" ? <InsufficientEvidence context={context} onHistory={onHistory} /> : <NoAction context={context} onHistory={onHistory} />}
    </div>
  );
}

function ReviewSession({ stage, fact, factValue, factEditorOpen, effect, onFactValue, onFactEditorOpen, onConfirmFact, onReconcileEffect, onDone, onHistory, onStage }: { stage: ReviewStage; fact: FactRevision; factValue: string; factEditorOpen: boolean; effect: EffectPayload; onFactValue: (value: string) => void; onFactEditorOpen: (open: boolean) => void; onConfirmFact: (value: string) => void; onReconcileEffect: () => void; onDone: () => void; onHistory: () => void; onStage: (stage: ReviewStage) => void }) {
  if (stage === "fact") {
    return (
      <section className="focused-review" aria-labelledby="fact-decision-title" data-testid="fact-decision">
        <header className="decision-intro">
          <p className="kicker">REVIEW FACT · 1 OF 1</p>
          <h2 id="fact-decision-title">When does Alex need to decide?</h2>
          <p>Confirm only what the message supports. Nothing is created yet.</p>
        </header>
        <section className="source-block source-block-primary" aria-labelledby="source-heading">
          <span className="source-meta" id="source-heading">WHATSAPP · SEP 1, 2026 · 10:42 · CANDIDATE</span>
          <blockquote>“I need to decide by Wednesday. Remote matters a lot.”</blockquote>
          <small>Captured Tue, Sep 1, 2026 at 10:42 · Asia/Shanghai</small>
        </section>
        <div className="causal-seam" aria-hidden="true"><span /></div>
        <section className="inline-decision" aria-label="Proposed fact change">
          <p className="kicker">PROPOSED CHANGE</p>
          <div className="state-diff" aria-label="Decision deadline changes from unknown to Wednesday September 2">
            <span className="old-value">Unknown</span><span aria-hidden="true">→</span><strong><CalendarIcon aria-hidden="true" /> {factValue}</strong>
          </div>
          <p className="date-derivation">“Wednesday” resolves to Sep 2 from the captured date and timezone.</p>
          <p className="decision-note">Remote policy stays unresolved. This step confirms the deadline only.</p>
          {factEditorOpen ? (
            <label className="composer-field">
              <span>Correct the date</span>
              <textarea value={factValue} onChange={(event) => onFactValue(event.currentTarget.value)} aria-describedby="fact-edit-note" rows={2} />
              <small id="fact-edit-note">Your correction is saved separately from the quoted source.</small>
            </label>
          ) : null}
          <div className="decision-actions">
            <button className="primary-button" type="button" disabled={factValue.trim().length === 0} onClick={() => onConfirmFact(factValue)}><CheckCircledIcon aria-hidden="true" />Confirm deadline</button>
            <div className="decision-secondary-row">
              <button className="secondary-button" type="button" onClick={() => onFactEditorOpen(!factEditorOpen)}><Pencil1Icon aria-hidden="true" />{factEditorOpen ? "Close edit" : "Edit"}</button>
              <button className="secondary-button" type="button" onClick={() => onStage("rejected")}><CircleBackslashIcon aria-hidden="true" />Not supported</button>
            </div>
          </div>
        </section>
      </section>
    );
  }

  if (stage === "approval") {
    return <EffectApproval fact={fact} effect={effect} onStage={onStage} />;
  }

  return (
    <>
      <div className="confirmed-fact-bar"><CheckCircledIcon aria-hidden="true" /><span>Deadline confirmed</span><strong>{fact.value}</strong></div>
      {stage === "executing" || stage === "unknown" || stage === "failed" ? (
        <section className="approved-effect-context" aria-label="Approved reminder under verification">
          <span>APPROVED REMINDER</span>
          <strong>{effect.title}</strong>
          <small>{effect.when} · {effect.destination}</small>
          <p>{effect.note}</p>
        </section>
      ) : null}
      {stage === "verified" ? <VerifiedReceipt fact={fact} effect={effect} onDone={onDone} onHistory={onHistory} /> : <ReviewProgress stage={stage} onReconcile={onReconcileEffect} onStage={onStage} onOpenSource={() => onStage("fact")} />}
    </>
  );
}

function EffectApproval({ fact, effect, onStage }: { fact: FactRevision; effect: EffectPayload; onStage: (stage: ReviewStage) => void }) {
  return (
    <section className="effect-approval" aria-labelledby="effect-title" data-testid="effect-approval">
      <header className="decision-intro">
        <p className="kicker">NEXT · SEPARATE DECISION</p>
        <h2 id="effect-title">Create this reminder?</h2>
        <p>The deadline is confirmed. Now review the one local effect.</p>
      </header>
      <div className="reminder-preview">
        <div className="reminder-time"><ClockIcon aria-hidden="true" /><div><span>Tue, Sep 1, 2026</span><strong>3:00 PM · Asia/Shanghai</strong></div></div>
        <h3>{effect.title}</h3>
        <p>{effect.destination}</p>
        <div className="reminder-note"><span>Note</span><p>{effect.note}</p></div>
      </div>
      <p className="effect-scope"><CheckIcon aria-hidden="true" />Creates one local reminder only. It sends no message and changes no contact, meeting, ATS, or CRM record.</p>
      <details className="effect-disclosure">
        <summary>View exact details</summary>
        <dl className="effect-details">
          <div><dt>Destination</dt><dd>{effect.destination}</dd></div>
          <div><dt>Title</dt><dd>{effect.title}</dd></div>
          <div><dt>Note</dt><dd>{effect.note}</dd></div>
          <div><dt>When</dt><dd>{effect.when}</dd></div>
          <div><dt>Operation</dt><dd>{effect.fingerprint} · fact r{fact.revision}</dd></div>
        </dl>
      </details>
      <button className="primary-button" type="button" onClick={() => onStage("executing")}><CheckCircledIcon aria-hidden="true" />Create reminder</button>
      <button className="text-button" type="button" onClick={() => onStage("fact")}>Back to deadline</button>
    </section>
  );
}

function ReviewProgress({ stage, onReconcile, onStage, onOpenSource }: { stage: ReviewStage; onReconcile: () => void; onStage: (stage: ReviewStage) => void; onOpenSource: () => void }) {
  if (stage === "fact" || stage === "approval") return <div className="decision-spacer" aria-hidden="true" />;
  const states = {
    rejected: { icon: <CircleBackslashIcon />, label: "NOT SUPPORTED", title: "The source does not support that fact.", copy: "Nothing changed in current state, and no action review was opened.", note: "Source kept visible for another pass" },
    executing: { icon: <UpdateIcon />, label: "EXECUTING", title: "Creating the approved reminder…", copy: "The original operation ID is reserved. A retry cannot create another reminder.", note: "Reserved operation · TS-RM-2048" },
    unknown: { icon: <QuestionMarkCircledIcon />, label: "OUTCOME UNKNOWN", title: "The request may have reached the device.", copy: "Do not retry yet. Read back the exact operation before deciding what happened.", note: "Hold the draft until exact-ID readback answers" },
    failed: { icon: <CrossCircledIcon />, label: "NOT APPLIED", title: "The reminder could not be created.", copy: "The confirmed fact remains. The separate action proposal is preserved and nothing external changed.", note: "Fact preserved · reminder not created" },
  };
  const current = states[stage as keyof typeof states];
  return (
    <section className={`result-state result-${stage}`} aria-live="polite" data-testid={`result-${stage}`}>
      <div className="result-icon" aria-hidden="true">{current.icon}</div><p className="kicker">{current.label}</p><h2>{current.title}</h2><p>{current.copy}</p>
      <div className="state-note">{current.note}</div>
      {stage === "unknown" ? (
        <div className="result-actions"><button className="primary-button" type="button" onClick={onReconcile}><ReloadIcon aria-hidden="true" />Check Apple Reminders</button><button className="text-button" type="button" onClick={() => onStage("failed")}>Show failed readback</button></div>
      ) : stage === "rejected" ? (
        <div className="result-actions"><button className="secondary-button" type="button" onClick={onOpenSource}><Link2Icon aria-hidden="true" />Review exact source</button><button className="text-button" type="button" onClick={() => onStage("fact")}>Return to fact decision</button></div>
      ) : stage === "failed" ? (
        <button className="secondary-button" type="button" onClick={() => onStage("approval")}>Review preserved proposal</button>
      ) : null}
    </section>
  );
}

function VerifiedReceipt({ fact, effect, onDone, onHistory }: { fact: FactRevision; effect: EffectPayload; onDone: () => void; onHistory: () => void }) {
  return (
    <section className="receipt" aria-labelledby="receipt-title" data-testid="verified-receipt">
      <div className="receipt-status"><CheckCircledIcon aria-hidden="true" /><span>VERIFIED</span></div>
      <h2 id="receipt-title">Reminder created.</h2>
      <div className="receipt-summary">
        <span>{effect.when}</span>
        <strong>{effect.title}</strong>
        <small>{effect.destination}</small>
        <p>{effect.note}</p>
      </div>
      <p>Exact device readback matched the approved reminder. You’ll be reminded before Alex’s decision window; no message was sent and no candidate record changed.</p>
      <details className="receipt-disclosure">
        <summary>View receipt details</summary>
        <dl>
          <div><dt>Destination</dt><dd>{effect.destination}</dd></div>
          <div><dt>Title</dt><dd>{effect.title}</dd></div>
          <div><dt>Note</dt><dd>{effect.note}</dd></div>
          <div><dt>Observed</dt><dd>{effect.when}</dd></div>
          <div><dt>Fact</dt><dd>{fact.value} · r{fact.revision} · {fact.confirmedBy}</dd></div>
          <div><dt>Operation</dt><dd>{effect.fingerprint} · exact payload match</dd></div>
        </dl>
      </details>
      <button className="primary-button" type="button" onClick={onDone}><CheckIcon aria-hidden="true" />Done</button>
      <button className="text-button" type="button" onClick={onHistory}><ActivityLogIcon aria-hidden="true" />Open history</button>
    </section>
  );
}

function AmbiguousIdentity({ selection, onSelection }: { selection: "current" | "historical" | null; onSelection: (value: "current" | "historical" | null) => void }) {
  const [result, setResult] = useState<"none" | "linked" | "saved">("none");
  const choose = (value: "current" | "historical" | null) => {
    setResult("none");
    onSelection(value);
  };
  const clearResult = () => {
    if (result === "linked") onSelection(null);
    setResult("none");
  };
  return (
    <section className="identity-review" aria-labelledby="identity-review-title">
      <div className="state-heading"><IdCardIcon aria-hidden="true" /><div><p className="kicker">IDENTITY NEEDS REVIEW</p><h2 id="identity-review-title">This phone clue has two temporal owners.</h2></div></div>
      <p>No person is selected. Compare the source-linked periods before attaching this evidence.</p>
      <div className="source-snippet identity-source">
        <span>UNBOUND SOURCE · WHATSAPP · SEP 1, 2026 · 11:26 · ASIA/SHANGHAI</span>
        <blockquote>“This is Alex — same number, now with Aurora.”</blockquote>
        <small>Identity clue: synthetic number ending ··42 · raw source remains Session-scoped</small>
      </div>
      <div className="comparison-list" role="radiogroup" aria-label="Possible identity owners">
        <label className={`comparison-option ${selection === "current" ? "selected" : ""}`}>
          <input className="sr-only" type="radio" name="identity-owner" value="current" checked={selection === "current"} onChange={() => choose("current")} />
          <span className="comparison-status">CURRENT CLUE</span><strong>Alex 陈·Chen-Watanabe</strong><span>Aurora · supported Aug 28–present</span><small>Source: recruiter-confirmed contact card</small>
        </label>
        <label className={`comparison-option ${selection === "historical" ? "selected" : ""}`}>
          <input className="sr-only" type="radio" name="identity-owner" value="historical" checked={selection === "historical"} onChange={() => choose("historical")} />
          <span className="comparison-status">HISTORICAL CLUE</span><strong>Alex Chen</strong><span>Quill · expired Jun 30</span><small>Relationship attachment stays disabled</small>
        </label>
      </div>
      {result !== "none" ? (
        <div className={`identity-result result-${result}`} role="status">
          <CheckCircledIcon aria-hidden="true" />
          <div><strong>{result === "linked" ? "Source linked to the current relationship." : "Saved for identity review."}</strong><span>{result === "linked" ? "The historical clue remains visible and the link can be undone." : "No person or evidence link was changed."}</span></div>
          <button type="button" onClick={clearResult}>{result === "linked" ? "Undo" : "Return"}</button>
        </div>
      ) : null}
      <button className="primary-button" type="button" disabled={!selection || selection === "historical"} onClick={() => setResult("linked")}>Confirm current owner + attach source</button>
      <button className="secondary-button" type="button" onClick={() => setResult("saved")}>Save for identity review</button>
      <button className="locked-next" type="button" disabled><LockClosedIcon aria-hidden="true" />Create new person unavailable during conflict</button>
    </section>
  );
}

function InsufficientEvidence({ context, onHistory }: { context: SessionContext; onHistory: () => void }) {
  const [draftOpen, setDraftOpen] = useState(false);
  const isAvailabilityCase = context.name === "Sam Rivera";
  const draft = isAvailabilityCase
    ? "When you say next week, which date and timezone work for you?"
    : `What changed for ${context.name}, who owns the next step, and when is it due?`;
  return (
    <section className="restrained-state" aria-labelledby="insufficient-title">
      <div className="state-symbol" aria-hidden="true"><QuestionMarkCircledIcon /></div><p className="kicker">NOT ENOUGH EVIDENCE</p><h2 id="insufficient-title">{isAvailabilityCase ? "“Next week” has no calendar date or timezone." : "No message-level evidence supports a new state change."}</h2>
      <p>{context.dependency}. {context.meta}. No current fact or reminder was proposed.</p>
      {isAvailabilityCase ? <div className="source-snippet"><span>SOURCE · WhatsApp · Sep 1, 2026 · 11:18 · Asia/Shanghai</span><blockquote>“I should be free next week.”</blockquote></div> : <div className="source-snippet"><span>WORKSPACE CONTEXT · NOT CANDIDATE EVIDENCE</span><p>{context.dependency}</p></div>}
      <div className="state-note">Clarify the missing evidence before any reminder can exist.</div>
      {draftOpen ? <div className="clarifying-draft" role="status"><span>DRAFT · NOT SENT</span><p>{draft}</p><small>Review and send from your messaging app only if you choose.</small></div> : null}
      <button className="secondary-button" type="button" aria-expanded={draftOpen} onClick={() => setDraftOpen((value) => !value)}>{draftOpen ? "Hide clarifying draft" : "Prepare one clarifying question"}</button><button className="text-button" type="button" onClick={onHistory}>Save without action</button>
    </section>
  );
}

function NoAction({ context, onHistory }: { context: SessionContext; onHistory: () => void }) {
  return (
    <section className="restrained-state no-action-state" aria-labelledby="no-action-title">
      <div className="state-symbol verified" aria-hidden="true"><CheckIcon /></div><p className="kicker">NO ACTION</p><h2 id="no-action-title">Nothing recruiter-owned needs to be created right now.</h2>
      <p>{context.dependency}. {context.meta}.</p>
      <div className="no-action-condition"><ClockIcon aria-hidden="true" /><span>Revisit condition: new evidence changes the current owner or dependency.</span></div>
      <div className="state-note">This Session stays quiet until a real change reopens the decision.</div>
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

function PersonView({ context, onBack, onPursuit }: { context: SessionContext; onBack: () => void; onPursuit: () => void }) {
  return <div className="object-page"><BrandHeader back={onBack} eyebrow="PERSON" /><section className="object-heading"><p className="kicker">CURRENT RELATIONSHIP</p><h1>{context.name}</h1><button type="button" onClick={onPursuit}>{context.role}</button></section><ObjectSequence context={context} /></div>;
}

function PursuitView({ context, onBack, onSession }: { context: SessionContext; onBack: () => void; onSession: () => void }) {
  return <div className="object-page"><BrandHeader back={onBack} eyebrow="PURSUIT" /><section className="object-heading"><p className="kicker">RELATIONSHIP OUTCOME</p><h1>{context.role}</h1><p>{context.name} · current governed context</p></section><ObjectSequence context={context} /><button className="secondary-button" type="button" onClick={onSession}><ReaderIcon aria-hidden="true" />Return to Session</button></div>;
}

function ObjectSequence({ context }: { context: SessionContext }) {
  return <div className="object-sequence"><section><span>CHANGE / DEPENDENCY</span><h2>{context.dependency}</h2></section><section><span>CONTEXT DATE</span><p>{context.meta}</p></section><section><span>NEXT MOVE</span><p>Return to the same Session before confirming any fact or effect.</p></section><section><span>HISTORY</span><p>Current context preserved · no unreviewed external write</p></section></div>;
}

function BottomNavigation({ view, onView, onNew }: { view: ViewName; onView: (view: ViewName) => void; onNew: () => void }) {
  return (
    <nav className="bottom-navigation" aria-label="Primary">
      <button type="button" className={view === "today" ? "active" : ""} onClick={() => onView("today")}><HomeIcon aria-hidden="true" /><span>Today</span></button>
      <button type="button" className={view === "session" ? "active" : ""} onClick={() => onView("session")}><ReaderIcon aria-hidden="true" /><span>Sessions</span></button>
      <button type="button" className="new-session-button" onClick={onNew} aria-label="New Session"><PlusIcon aria-hidden="true" /></button>
      <button type="button" className={view === "person" ? "active" : ""} onClick={() => onView("person")}><PersonIcon aria-hidden="true" /><span>People</span></button>
      <button type="button" disabled aria-label="Find unavailable in this prototype"><MagnifyingGlassIcon aria-hidden="true" /><span>Find</span></button>
    </nav>
  );
}

function HistoryTimeline({ context, mode, stage, fact, effect }: { context: SessionContext; mode: SessionMode; stage: ReviewStage; fact: FactRevision | null; effect: EffectPayload }) {
  if (mode !== "review") {
    return (
      <ol className="history-timeline">
        <li><span className="history-icon"><PersonIcon aria-hidden="true" /></span><div><strong>{context.name} · {context.role}</strong><span>Current Session context</span></div></li>
        <li><span className="history-icon"><ReaderIcon aria-hidden="true" /></span><div><strong>{mode === "no-action" ? "No action recorded" : mode === "ambiguous" ? "Identity review remains unresolved" : "Evidence remains insufficient"}</strong><span>No fact or external effect was created</span></div></li>
      </ol>
    );
  }
  return (
    <ol className="history-timeline">
      {stage === "verified" ? <li><span className="history-icon verified"><CheckCircledIcon aria-hidden="true" /></span><div><strong>Reminder verified</strong><span>{effect.fingerprint} · exact payload match</span></div></li> : null}
      {stage !== "fact" && stage !== "rejected" ? <li><span className="history-icon"><PersonIcon aria-hidden="true" /></span><div><strong>Exact effect reviewed by recruiter</strong><span>{effect.title}</span></div></li> : null}
      {fact ? <li><span className="history-icon"><FileTextIcon aria-hidden="true" /></span><div><strong>Decision deadline confirmed</strong><span>Unknown → {fact.value} · r{fact.revision} · {fact.basis === "source_excerpt" ? "source-backed" : "recruiter correction"}</span></div></li> : null}
      <li><span className="history-icon"><Link2Icon aria-hidden="true" /></span><div><strong>WhatsApp evidence attached</strong><span>Sep 1, 2026 · 10:42 · Asia/Shanghai · exact fragment retained</span></div></li>
    </ol>
  );
}
