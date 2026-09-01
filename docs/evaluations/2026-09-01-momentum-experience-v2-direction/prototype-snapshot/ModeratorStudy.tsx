import { useEffect, useMemo, useState } from "react";
import {
  CheckCircledIcon,
  ChevronRightIcon,
  ClockIcon,
  DownloadIcon,
  EyeClosedIcon,
  FileTextIcon,
  LockClosedIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import "./moderator-study.css";

type StudyStep =
  | "setup"
  | "lead"
  | "lead-response"
  | "authority-one"
  | "authority-two"
  | "authority-response"
  | "review"
  | "saved";

type StudyDraft = {
  participantId: string;
  recruiterProfile: string;
  firstUse: boolean;
  device: string;
  leadWho: string;
  leadChange: string;
  leadWhy: string;
  leadNext: string;
  leadDestination: string;
  factActionChanges: string;
  factActionWrite: string;
};

type StudyRecord = StudyDraft & {
  screenOrder: "fact-first" | "approval-first";
};

const participantIds = Array.from({ length: 10 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`);

const csvHeaders = [
  "participant_id",
  "recruiter_profile",
  "first_use",
  "device",
  "screen_order",
  "lead_who_verbatim",
  "lead_change_verbatim",
  "lead_why_verbatim",
  "lead_next_verbatim",
  "lead_destination_verbatim",
  "five_second_pass",
  "fact_action_verbatim",
  "fact_action_pass",
  "scorer_1",
  "scorer_2",
  "adjudication",
  "notes",
];

const emptyDraft = (participantId = "P01"): StudyDraft => ({
  participantId,
  recruiterProfile: "",
  firstUse: false,
  device: "Facilitator screen",
  leadWho: "",
  leadChange: "",
  leadWhy: "",
  leadNext: "",
  leadDestination: "",
  factActionChanges: "",
  factActionWrite: "",
});

const orderFor = (participantId: string): StudyRecord["screenOrder"] => {
  const number = Number.parseInt(participantId.slice(1), 10);
  return number % 2 === 0 ? "approval-first" : "fact-first";
};

const csvCell = (value: string | boolean) => `"${String(value).replaceAll('"', '""')}"`;

export function ModeratorStudyRunner() {
  const [step, setStep] = useState<StudyStep>("setup");
  const [draft, setDraft] = useState<StudyDraft>(() => emptyDraft());
  const [records, setRecords] = useState<StudyRecord[]>([]);
  const [remaining, setRemaining] = useState(5);
  const [runKey, setRunKey] = useState(0);

  const screenOrder = orderFor(draft.participantId);
  const authorityScreens = useMemo(
    () => screenOrder === "fact-first"
      ? [
          { label: "Fact confirmation", src: "/qa/states/fact.png" },
          { label: "Exact-effect approval", src: "/qa/states/approval.png" },
        ]
      : [
          { label: "Exact-effect approval", src: "/qa/states/approval.png" },
          { label: "Fact confirmation", src: "/qa/states/fact.png" },
        ],
    [screenOrder],
  );

  useEffect(() => {
    if (step !== "lead") return;
    const deadline = Date.now() + 5_000;
    setRemaining(5);
    const interval = window.setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1_000)));
    }, 100);
    const timeout = window.setTimeout(() => setStep("lead-response"), 5_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [step, runKey]);

  useEffect(() => {
    document.querySelector<HTMLElement>(".study-runner")?.scrollTo({ top: 0, behavior: "auto" });
  }, [step]);

  const update = <Key extends keyof StudyDraft>(key: Key, value: StudyDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const setupReady = draft.firstUse && draft.recruiterProfile.trim() !== "" && draft.device.trim() !== "";
  const leadReady = [draft.leadWho, draft.leadChange, draft.leadWhy, draft.leadNext, draft.leadDestination]
    .every((value) => value.trim() !== "");
  const authorityReady = draft.factActionChanges.trim() !== "" && draft.factActionWrite.trim() !== "";

  const startLead = () => {
    setRunKey((value) => value + 1);
    setStep("lead");
  };

  const saveRecord = () => {
    const record: StudyRecord = { ...draft, screenOrder };
    setRecords((current) => [...current.filter((item) => item.participantId !== record.participantId), record]);
    setStep("saved");
  };

  const startNext = () => {
    const completed = new Set(records.map((record) => record.participantId).concat(draft.participantId));
    const nextId = participantIds.find((id) => !completed.has(id)) ?? "P01";
    setDraft(emptyDraft(nextId));
    setStep("setup");
  };

  const exportCsv = () => {
    const recordMap = new Map(records.map((record) => [record.participantId, record]));
    if (step === "saved") recordMap.set(draft.participantId, { ...draft, screenOrder });
    const rows = participantIds.map((participantId) => {
      const record = recordMap.get(participantId);
      const factAction = record
        ? `Changes after each button: ${record.factActionChanges} | Does confirming the fact create or send anything?: ${record.factActionWrite}`
        : "";
      return [
        participantId,
        record?.recruiterProfile ?? "",
        record?.firstUse ?? "",
        record?.device ?? "",
        record?.screenOrder ?? orderFor(participantId),
        record?.leadWho ?? "",
        record?.leadChange ?? "",
        record?.leadWhy ?? "",
        record?.leadNext ?? "",
        record?.leadDestination ?? "",
        "",
        factAction,
        "",
        "",
        "",
        "",
        "",
      ].map(csvCell).join(",");
    });
    const csv = `${csvHeaders.map(csvCell).join(",")}\n${rows.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mx01-human-responses-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  return (
    <div className="study-runner">
      <header className="study-topbar">
        <div className="study-brand">
          <img src="/assets/today-signal-orb.png" alt="" />
          <div><strong>MX‑01 comprehension study</strong><span>Moderator mode · synthetic fixtures only</span></div>
        </div>
        <div className="study-progress" aria-label={`${records.length} of 10 participant responses saved`}>
          <span>{records.length}/10 saved</span>
          <button type="button" onClick={exportCsv} disabled={records.length === 0 && step !== "saved"}>
            <DownloadIcon aria-hidden="true" /> Export raw CSV
          </button>
        </div>
      </header>

      <main className="study-main">
        <aside className="study-rail" aria-label="Study protocol">
          <p className="study-kicker">Frozen protocol</p>
          <h1>Observe first. Score later.</h1>
          <ol>
            <StudyRailStep active={step === "setup" || step === "lead" || step === "lead-response"} complete={step !== "setup" && step !== "lead" && step !== "lead-response"} label="Five-second lead" />
            <StudyRailStep active={step === "authority-one" || step === "authority-two" || step === "authority-response"} complete={step === "review" || step === "saved"} label="Fact vs action" />
            <StudyRailStep active={step === "review" || step === "saved"} complete={step === "saved"} label="Freeze verbatim" />
          </ol>
          <div className="study-boundary"><LockClosedIcon aria-hidden="true" /><p>No candidate data, automatic scoring, local storage, model judging, or external write.</p></div>
        </aside>

        <section className="study-workspace" aria-live="polite">
          {step === "setup" ? (
            <StudyPanel eyebrow="Participant setup" title="Start with an unbriefed first-use participant." description="Record role context only. Do not explain Decision Lens, the causal seam, or the intended answer.">
              <div className="study-form two-columns">
                <label>Participant ID<select value={draft.participantId} onChange={(event) => update("participantId", event.target.value)}>{participantIds.map((id) => <option key={id} value={id} disabled={records.some((record) => record.participantId === id)}>{id}</option>)}</select></label>
                <label>Assigned order<input value={screenOrder} readOnly /></label>
                <label>Recruiter profile<input value={draft.recruiterProfile} onChange={(event) => update("recruiterProfile", event.target.value)} placeholder="Independent recruiter · 8 years" /></label>
                <label>Device<input value={draft.device} onChange={(event) => update("device", event.target.value)} /></label>
              </div>
              <label className="study-check"><input type="checkbox" checked={draft.firstUse} onChange={(event) => update("firstUse", event.target.checked)} /><span>This participant has not seen the directions or design rationale.</span></label>
              <button className="study-primary" type="button" disabled={!setupReady} onClick={startLead}><ClockIcon aria-hidden="true" /> Start exact five-second exposure</button>
            </StudyPanel>
          ) : null}

          {step === "lead" ? (
            <StudyPanel eyebrow={`Test A · ${draft.participantId}`} title="Lead state is visible now." description="Do not prompt or explain. The screen hides automatically after five seconds.">
              <div className="study-timer" aria-label={`${remaining} seconds remaining`}><span style={{ width: `${remaining * 20}%` }} /></div>
              <Stimulus src="/qa/states/today.png" alt="Frozen Today lead state" />
            </StudyPanel>
          ) : null}

          {step === "lead-response" ? (
            <StudyPanel eyebrow={`Test A · ${draft.participantId}`} title="The lead state is hidden." description="Ask each question without hints and record the participant’s words verbatim.">
              <div className="study-hidden"><EyeClosedIcon aria-hidden="true" /><span>Stimulus hidden after five seconds</span></div>
              <div className="study-form">
                <StudyTextarea label="Who is this about?" value={draft.leadWho} onChange={(value) => update("leadWho", value)} />
                <StudyTextarea label="What changed or remains unresolved?" value={draft.leadChange} onChange={(value) => update("leadChange", value)} />
                <StudyTextarea label="Why does it matter now?" value={draft.leadWhy} onChange={(value) => update("leadWhy", value)} />
                <StudyTextarea label="What should the recruiter do next?" value={draft.leadNext} onChange={(value) => update("leadNext", value)} />
                <StudyTextarea label="Where would you tap to continue?" value={draft.leadDestination} onChange={(value) => update("leadDestination", value)} />
              </div>
              <button className="study-primary" type="button" disabled={!leadReady} onClick={() => setStep("authority-one")}>Show first authority screen <ChevronRightIcon aria-hidden="true" /></button>
            </StudyPanel>
          ) : null}

          {step === "authority-one" || step === "authority-two" ? (
            <StudyPanel eyebrow={`Test B · ${screenOrder}`} title={authorityScreens[step === "authority-one" ? 0 : 1].label} description={step === "authority-one" ? "Let the participant inspect this screen, then continue in the assigned order." : "Let the participant inspect this second screen before asking the authority questions."}>
              <Stimulus src={authorityScreens[step === "authority-one" ? 0 : 1].src} alt={authorityScreens[step === "authority-one" ? 0 : 1].label} />
              <button className="study-primary" type="button" onClick={() => setStep(step === "authority-one" ? "authority-two" : "authority-response")}>
                {step === "authority-one" ? "Show next screen" : "Hide screens and record answers"}<ChevronRightIcon aria-hidden="true" />
              </button>
            </StudyPanel>
          ) : null}

          {step === "authority-response" ? (
            <StudyPanel eyebrow={`Test B · ${draft.participantId}`} title="Both authority screens are hidden." description="Record the answer verbatim. Do not explain the difference until the response is frozen.">
              <div className="study-hidden"><EyeClosedIcon aria-hidden="true" /><span>Fact and action screens hidden</span></div>
              <div className="study-form">
                <StudyTextarea label="What changes after the primary button on each screen?" value={draft.factActionChanges} onChange={(value) => update("factActionChanges", value)} />
                <StudyTextarea label="Does confirming the fact create or send anything?" value={draft.factActionWrite} onChange={(value) => update("factActionWrite", value)} />
              </div>
              <button className="study-primary" type="button" disabled={!authorityReady} onClick={() => setStep("review")}><FileTextIcon aria-hidden="true" /> Review frozen response</button>
            </StudyPanel>
          ) : null}

          {step === "review" ? (
            <StudyPanel eyebrow={`Review · ${draft.participantId}`} title="Freeze the participant’s response before scoring." description="This runner deliberately leaves both pass fields and both scorer fields blank in the export.">
              <div className="study-review">
                <ReviewRow label="Who" value={draft.leadWho} />
                <ReviewRow label="Change" value={draft.leadChange} />
                <ReviewRow label="Why now" value={draft.leadWhy} />
                <ReviewRow label="Next" value={draft.leadNext} />
                <ReviewRow label="Destination" value={draft.leadDestination} />
                <ReviewRow label="Fact vs action" value={`${draft.factActionChanges} ${draft.factActionWrite}`} />
              </div>
              <button className="study-primary" type="button" onClick={saveRecord}><CheckCircledIcon aria-hidden="true" /> Save raw participant response</button>
            </StudyPanel>
          ) : null}

          {step === "saved" ? (
            <StudyPanel eyebrow={`Saved · ${draft.participantId}`} title="The verbatim response is held in this browser session." description="Export after each participant. Refreshing the page intentionally clears the in-memory responses.">
              <div className="study-saved"><CheckCircledIcon aria-hidden="true" /><strong>{records.length} of 10 responses saved</strong><span>No comprehension result has been scored or claimed.</span></div>
              <div className="study-saved-actions">
                <button className="study-primary" type="button" onClick={exportCsv}><DownloadIcon aria-hidden="true" /> Export raw CSV</button>
                {records.length < 10 ? <button className="study-secondary" type="button" onClick={startNext}><ReloadIcon aria-hidden="true" /> Start next participant</button> : null}
              </div>
            </StudyPanel>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function StudyPanel({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <div className="study-panel"><p className="study-kicker">{eyebrow}</p><h2>{title}</h2><p className="study-description">{description}</p>{children}</div>;
}

function StudyRailStep({ active, complete, label }: { active: boolean; complete: boolean; label: string }) {
  return <li className={active ? "active" : complete ? "complete" : ""}><span>{complete ? <CheckCircledIcon aria-hidden="true" /> : null}</span><strong>{label}</strong></li>;
}

function Stimulus({ src, alt }: { src: string; alt: string }) {
  return <div className="study-stimulus"><img src={src} alt={alt} /></div>;
}

function StudyTextarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label>{label}<textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Record verbatim response…" /></label>;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
