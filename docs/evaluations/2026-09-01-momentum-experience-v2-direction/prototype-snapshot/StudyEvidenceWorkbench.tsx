import { useMemo, useState } from "react";
import {
  CheckCircledIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileTextIcon,
  LockClosedIcon,
  ReaderIcon,
} from "@radix-ui/react-icons";
import {
  buildAdjudicationCsv,
  buildFinalResultsCsv,
  buildScorerCsv,
  buildStatusDraft,
  criteria,
  emptyCriterionDraft,
  finalizeStudy,
  findDisagreements,
  parseRawStudyCsv,
  parseScorerCsv,
  participantIds,
  responseForCriterion,
  validateScorerPair,
  type AdjudicationDecision,
  type CriterionDraft,
  type CriterionId,
  type FinalStudy,
  type ParticipantScore,
  type RawStudyRecord,
  type ScorerBundle,
  type ScorerPair,
  type ScorerRole,
} from "./studyEvidence";
import "./moderator-study.css";

type WorkbenchMode = "score" | "adjudicate";
type ImportedRaw = { text: string; sha256: string; records: RawStudyRecord[]; fileName: string };
type ScoreDraft = { decisions: CriterionDraft; notes: string };
type AdjudicationDraft = { finalValue: boolean | null; rationale: string };

const scoreDraftsFor = () => Object.fromEntries(
  participantIds.map((participantId) => [participantId, { decisions: emptyCriterionDraft(), notes: "" }]),
) as Record<string, ScoreDraft>;

export function StudyEvidenceWorkbench({ mode }: { mode: WorkbenchMode }) {
  return mode === "score" ? <ScoringWorkbench /> : <AdjudicationWorkbench />;
}

function ScoringWorkbench() {
  const initialRole = new URLSearchParams(window.location.search).get("role") === "scorer_2" ? "scorer_2" : "scorer_1";
  const [raw, setRaw] = useState<ImportedRaw | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [scorerRole, setScorerRole] = useState<ScorerRole>(initialRole);
  const [scorerId, setScorerId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, ScoreDraft>>(scoreDraftsFor);
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const [currentIndex, setCurrentIndex] = useState(0);

  const participantId = participantIds[currentIndex];
  const record = raw?.records.find((item) => item.participant_id === participantId) ?? null;
  const draft = drafts[participantId];
  const decisionValues = Object.values(draft.decisions);
  const currentComplete = decisionValues.every((value) => value !== null);
  const completedScores = useMemo(
    () => participantIds.flatMap((id) => saved.has(id) ? [toParticipantScore(id, drafts[id])] : []),
    [drafts, saved],
  );

  const importRaw = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const parsed = parseRawStudyCsv(text);
    if (!parsed.ok) {
      setRaw(null);
      setImportErrors(parsed.errors);
      return;
    }
    setRaw({ text, sha256: await sha256(text), records: parsed.value, fileName: file.name });
    setImportErrors([]);
    setDrafts(scoreDraftsFor());
    setSaved(new Set());
    setCurrentIndex(0);
  };

  const updateDecision = (criterionId: CriterionId, value: boolean) => {
    setDrafts((current) => ({
      ...current,
      [participantId]: {
        ...current[participantId],
        decisions: { ...current[participantId].decisions, [criterionId]: value },
      },
    }));
    setSaved((current) => withoutParticipant(current, participantId));
  };

  const saveCurrent = () => {
    if (!currentComplete) return;
    setSaved((current) => new Set(current).add(participantId));
    if (currentIndex < participantIds.length - 1) setCurrentIndex((index) => index + 1);
  };

  const exportScorerFile = () => {
    if (!raw || !scorerId.trim() || completedScores.length !== 10) return;
    downloadText(
      `mx01-${scorerRole}-${safeFilePart(scorerId)}.csv`,
      buildScorerCsv(raw.sha256, scorerRole, scorerId, completedScores),
      "text/csv;charset=utf-8",
    );
  };

  const updateNotes = (notes: string) => {
    setDrafts((current) => ({
      ...current,
      [participantId]: { ...current[participantId], notes },
    }));
    setSaved((current) => withoutParticipant(current, participantId));
  };

  return (
    <StudyShell
      modeLabel="Independent scorer mode"
      progress={`${saved.size}/10 scored`}
      headline="Judge the transcript. Never infer beyond it."
      steps={[
        { label: "Validate raw responses", active: !raw, complete: Boolean(raw) },
        { label: "Score atomic criteria", active: Boolean(raw) && saved.size < 10, complete: saved.size === 10 },
        { label: "Export blinded score", active: saved.size === 10, complete: false },
      ]}
      topAction={
        <button type="button" onClick={exportScorerFile} disabled={!raw || saved.size !== 10 || !scorerId.trim()}>
          <DownloadIcon aria-hidden="true" /> Export scorer CSV
        </button>
      }
      boundary="No automatic interpretation, no access to the other scorer, no local storage, and no official gate update."
    >
      {!raw ? (
        <StudyPanel
          eyebrow="Step 1 · source evidence"
          title="Import one complete ten-participant raw CSV."
          description="The workbench rejects partial rows, prefilled pass fields, wrong screen order, and missing verbatim evidence before a scorer can begin."
        >
          <FileDrop
            id="raw-score-file"
            label="Choose moderator raw CSV"
            detail="Expected: P01–P10, first-use confirmed, all seven verbatim answers frozen."
            accept=".csv,text/csv"
            onFile={importRaw}
          />
          <ErrorList errors={importErrors} />
        </StudyPanel>
      ) : (
        <StudyPanel
          eyebrow={`Step 2 · ${participantId} · ${currentIndex + 1} of 10`}
          title="Mark every criterion from the frozen words."
          description="Supported means the transcript itself contains the required understanding. An unchecked item cannot silently become a fail: choose Supported or Not supported for every row."
        >
          <div className="study-source-strip">
            <span><FileTextIcon aria-hidden="true" /> {raw.fileName}</span>
            <code>{raw.sha256.slice(0, 12)}…{raw.sha256.slice(-8)}</code>
          </div>

          <div className="study-form two-columns study-scorer-identity">
            <label>Scorer role
              <select value={scorerRole} onChange={(event) => setScorerRole(event.target.value as ScorerRole)} disabled={saved.size > 0}>
                <option value="scorer_1">Scorer 1</option>
                <option value="scorer_2">Scorer 2</option>
              </select>
            </label>
            <label>Scorer ID
              <input value={scorerId} onChange={(event) => setScorerId(event.target.value)} placeholder="Name or study ID" disabled={saved.size > 0} />
            </label>
          </div>

          <ParticipantNav currentIndex={currentIndex} saved={saved} onSelect={setCurrentIndex} />

          {record ? <ResponseEvidence record={record} /> : null}

          <CriterionGroup
            title="Test A · five-second lead"
            criterionIds={criteria.filter((criterion) => criterion.test === "five-second").map((criterion) => criterion.id)}
            participantId={participantId}
            decisions={draft.decisions}
            onDecision={updateDecision}
          />
          <CriterionGroup
            title="Test B · fact versus action"
            criterionIds={criteria.filter((criterion) => criterion.test === "fact-action").map((criterion) => criterion.id)}
            participantId={participantId}
            decisions={draft.decisions}
            onDecision={updateDecision}
          />

          <label className="study-notes">Scorer notes · optional
            <textarea rows={3} value={draft.notes} onChange={(event) => updateNotes(event.target.value)} placeholder="Only note transcript-grounded scoring context…" />
          </label>

          {currentComplete ? (
            <div className="study-deterministic-result" aria-live="polite">
              <span>Deterministic aggregation</span>
              <strong>Test A {testPassDraft(draft.decisions, "five-second") ? "pass" : "fail"} · Test B {testPassDraft(draft.decisions, "fact-action") ? "pass" : "fail"}</strong>
              <small>Computed only from your eight explicit choices.</small>
            </div>
          ) : null}

          <button className="study-primary" type="button" onClick={saveCurrent} disabled={!currentComplete || !scorerId.trim()}>
            <CheckCircledIcon aria-hidden="true" /> {saved.has(participantId) ? "Save updated score" : "Freeze this score"}
          </button>

          {saved.size === 10 ? (
            <div className="study-export-ready">
              <CheckCircledIcon aria-hidden="true" />
              <div><strong>All ten scores are frozen.</strong><span>Export this blinded file. Do not import or inspect the other scorer’s file.</span></div>
              <button className="study-secondary" type="button" onClick={exportScorerFile}><DownloadIcon aria-hidden="true" /> Export scorer CSV</button>
            </div>
          ) : null}
        </StudyPanel>
      )}
    </StudyShell>
  );
}

function AdjudicationWorkbench() {
  const [raw, setRaw] = useState<ImportedRaw | null>(null);
  const [scorerFiles, setScorerFiles] = useState<Array<{ fileName: string; bundle: ScorerBundle } | null>>([null, null]);
  const [errors, setErrors] = useState<string[]>([]);
  const [adjudicatorId, setAdjudicatorId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, AdjudicationDraft>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [finalStudy, setFinalStudy] = useState<FinalStudy | null>(null);

  const pairResult = useMemo<ReturnType<typeof validateScorerPair> | null>(() => {
    if (!raw || !scorerFiles[0] || !scorerFiles[1]) return null;
    return validateScorerPair(scorerFiles[0].bundle, scorerFiles[1].bundle, raw.sha256);
  }, [raw, scorerFiles]);
  const pair: ScorerPair | null = pairResult?.ok ? pairResult.value : null;
  const disagreements = useMemo(() => pair ? findDisagreements(pair) : [], [pair]);
  const current = disagreements[currentIndex] ?? null;
  const completedCount = disagreements.filter((item) => isAdjudicationComplete(drafts[disagreementKey(item.participantId, item.criterionId)])).length;
  const importsReady = Boolean(raw && pair);

  const importRaw = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const parsed = parseRawStudyCsv(text);
    if (!parsed.ok) {
      setRaw(null);
      setErrors(parsed.errors);
      return;
    }
    setRaw({ text, sha256: await sha256(text), records: parsed.value, fileName: file.name });
    setErrors([]);
    setFinalStudy(null);
  };

  const importScorer = async (slot: number, file: File | undefined) => {
    if (!file) return;
    const parsed = parseScorerCsv(await file.text());
    if (!parsed.ok) {
      setErrors(parsed.errors);
      setScorerFiles((currentFiles) => currentFiles.map((item, index) => index === slot ? null : item));
      return;
    }
    setScorerFiles((currentFiles) => currentFiles.map((item, index) => index === slot ? { fileName: file.name, bundle: parsed.value } : item));
    setErrors([]);
    setDrafts({});
    setCurrentIndex(0);
    setFinalStudy(null);
  };

  const updateCurrent = (patch: Partial<AdjudicationDraft>) => {
    if (!current) return;
    const key = disagreementKey(current.participantId, current.criterionId);
    setDrafts((values) => ({
      ...values,
      [key]: { ...(values[key] ?? { finalValue: null, rationale: "" }), ...patch },
    }));
  };

  const saveAndContinue = () => {
    if (!current || !isAdjudicationComplete(drafts[disagreementKey(current.participantId, current.criterionId)])) return;
    if (currentIndex < disagreements.length - 1) setCurrentIndex((index) => index + 1);
  };

  const finalize = () => {
    if (!raw || !pair) return;
    const adjudications = disagreements.flatMap((item) => {
      const draft = drafts[disagreementKey(item.participantId, item.criterionId)];
      return isAdjudicationComplete(draft) ? [{ ...item, finalValue: draft.finalValue, rationale: draft.rationale }] : [];
    }) as AdjudicationDecision[];
    const finalized = finalizeStudy(raw.sha256, pair, adjudicatorId, adjudications);
    if (!finalized.ok) {
      setErrors(finalized.errors);
      return;
    }
    setErrors([]);
    setFinalStudy(finalized.value);
  };

  const rawRecord = raw?.records.find((record) => record.participant_id === current?.participantId);
  const currentCriterion = criteria.find((criterion) => criterion.id === current?.criterionId);
  const currentDraft = current ? drafts[disagreementKey(current.participantId, current.criterionId)] : undefined;
  const allResolved = completedCount === disagreements.length;
  const summary = finalStudy ? buildStatusDraft(finalStudy) : null;

  return (
    <StudyShell
      modeLabel="Adjudication mode"
      progress={importsReady ? `${completedCount}/${disagreements.length} disagreements resolved` : "Evidence not joined"}
      headline="Join only after both judgments are frozen."
      steps={[
        { label: "Match three evidence files", active: !importsReady, complete: importsReady },
        { label: "Resolve disagreements", active: importsReady && !allResolved, complete: importsReady && allResolved },
        { label: "Review gate draft", active: Boolean(finalStudy), complete: false },
      ]}
      boundary="Files join by the raw SHA-256 fingerprint. Only atomic disagreements are adjudicated; the official repository status is never changed here."
    >
      {!importsReady ? (
        <StudyPanel
          eyebrow="Step 1 · provenance join"
          title="Import raw responses and two independent score files."
          description="The two scorer roles and IDs must differ, every file must contain P01–P10, and both score files must name the exact raw-response fingerprint."
        >
          <div className="study-import-grid">
            <FileDrop id="raw-adjudication-file" label="1 · Raw responses" detail={raw ? `${raw.fileName} · ${raw.sha256.slice(0, 12)}…` : "Moderator export with blank score fields"} accept=".csv,text/csv" onFile={importRaw} complete={Boolean(raw)} />
            <FileDrop id="scorer-a-file" label="2 · First scorer file" detail={scorerFiles[0] ? `${scorerFiles[0].bundle.scorerRole} · ${scorerFiles[0].bundle.scorerId}` : "Either scorer role; order does not matter"} accept=".csv,text/csv" onFile={(file) => importScorer(0, file)} complete={Boolean(scorerFiles[0])} />
            <FileDrop id="scorer-b-file" label="3 · Second scorer file" detail={scorerFiles[1] ? `${scorerFiles[1].bundle.scorerRole} · ${scorerFiles[1].bundle.scorerId}` : "Must be the other independent role"} accept=".csv,text/csv" onFile={(file) => importScorer(1, file)} complete={Boolean(scorerFiles[1])} />
          </div>
          <ErrorList errors={[...(pairResult && !pairResult.ok ? pairResult.errors : []), ...errors]} />
        </StudyPanel>
      ) : finalStudy && summary ? (
        <StudyPanel
          eyebrow="Step 3 · manual-review draft"
          title="The evidence chain is complete; the official gate is untouched."
          description="Download all three artifacts, inspect them together, and only then decide whether to replace the repository templates in a separate human-authorized step."
        >
          <div className="study-gate-grid">
            <GateCard label="Five-second lead" passes={summary.five_second_passes} gate={summary.five_second_gate} />
            <GateCard label="Fact versus action" passes={summary.fact_action_passes} gate={summary.fact_action_gate} />
          </div>
          <div className="study-draft-warning"><LockClosedIcon aria-hidden="true" /><div><strong>Draft only · manual review required</strong><span>No file in the Talent Signal repository has been written or replaced.</span></div></div>
          <div className="study-download-grid">
            <button className="study-primary" type="button" onClick={() => downloadText("mx01-human-results-draft.csv", buildFinalResultsCsv(raw!.records, finalStudy), "text/csv;charset=utf-8")}><DownloadIcon aria-hidden="true" /> Results draft</button>
            <button className="study-secondary" type="button" onClick={() => downloadText("mx01-adjudication-audit.csv", buildAdjudicationCsv(finalStudy), "text/csv;charset=utf-8")}><DownloadIcon aria-hidden="true" /> Adjudication audit</button>
            <button className="study-secondary" type="button" onClick={() => downloadText("mx01-status-draft.json", `${JSON.stringify(summary, null, 2)}\n`, "application/json;charset=utf-8")}><DownloadIcon aria-hidden="true" /> Status draft</button>
          </div>
        </StudyPanel>
      ) : (
        <StudyPanel
          eyebrow={`Step 2 · ${disagreements.length} atomic disagreement${disagreements.length === 1 ? "" : "s"}`}
          title={current ? `Resolve ${current.participantId} from the frozen response.` : "Both scorers agree on every atomic criterion."}
          description={current ? "Choose the final value from the words below and record why. Do not use memory, majority logic, or design intent." : "No criterion needs a tie-break. A named adjudicator must still freeze the joined result and export the audit artifacts."}
        >
          <div className="study-source-strip">
            <span><ReaderIcon aria-hidden="true" /> {pair!.scorer1.scorerId} + {pair!.scorer2.scorerId}</span>
            <code>{raw!.sha256.slice(0, 12)}…{raw!.sha256.slice(-8)}</code>
          </div>
          <label className="study-adjudicator-id">Adjudicator ID
            <input value={adjudicatorId} onChange={(event) => setAdjudicatorId(event.target.value)} placeholder="Name or study ID" />
          </label>

          {current && currentCriterion && rawRecord ? (
            <>
              <DisagreementNav disagreements={disagreements} drafts={drafts} currentIndex={currentIndex} onSelect={setCurrentIndex} />
              <div className="study-disagreement-header">
                <div><span>Atomic criterion</span><strong>{currentCriterion.shortLabel}</strong><small>{currentCriterion.description}</small></div>
                <div className="study-scorer-values">
                  <ScoreValue label={`Scorer 1 · ${pair!.scorer1.scorerId}`} value={current.scorer1Value} />
                  <ScoreValue label={`Scorer 2 · ${pair!.scorer2.scorerId}`} value={current.scorer2Value} />
                </div>
              </div>
              <blockquote className="study-verbatim-focus"><span>Frozen verbatim response</span>{responseForCriterion(rawRecord, current.criterionId)}</blockquote>
              <div className="study-final-choice" role="group" aria-label={`Final value for ${currentCriterion.shortLabel}`}>
                <button type="button" className={currentDraft?.finalValue === true ? "selected" : ""} onClick={() => updateCurrent({ finalValue: true })}>Supported</button>
                <button type="button" className={currentDraft?.finalValue === false ? "selected" : ""} onClick={() => updateCurrent({ finalValue: false })}>Not supported</button>
              </div>
              <label className="study-notes">Adjudication rationale · required
                <textarea rows={3} value={currentDraft?.rationale ?? ""} onChange={(event) => updateCurrent({ rationale: event.target.value })} placeholder="Point to the exact words that resolve this criterion…" />
              </label>
              <button className="study-primary" type="button" onClick={saveAndContinue} disabled={!isAdjudicationComplete(currentDraft)}><CheckCircledIcon aria-hidden="true" /> Freeze resolution</button>
            </>
          ) : (
            <div className="study-all-agree"><CheckCircledIcon aria-hidden="true" /><strong>80 of 80 atomic judgments agree.</strong><span>No rationale is invented when no disagreement exists.</span></div>
          )}

          <button className="study-primary" type="button" onClick={finalize} disabled={!adjudicatorId.trim() || !allResolved}>
            <LockClosedIcon aria-hidden="true" /> Freeze joined result and compute draft
          </button>
          <ErrorList errors={errors} />
        </StudyPanel>
      )}
    </StudyShell>
  );
}

function StudyShell({
  modeLabel,
  progress,
  headline,
  steps,
  topAction,
  boundary,
  children,
}: {
  modeLabel: string;
  progress: string;
  headline: string;
  steps: Array<{ label: string; active: boolean; complete: boolean }>;
  topAction?: React.ReactNode;
  boundary: string;
  children: React.ReactNode;
}) {
  return (
    <div className="study-runner study-evidence-workbench">
      <header className="study-topbar">
        <div className="study-brand"><img src="/assets/today-signal-orb.png" alt="" /><div><strong>MX‑01 comprehension study</strong><span>{modeLabel} · synthetic study fixture</span></div></div>
        <div className="study-progress" aria-label={progress}><span>{progress}</span>{topAction}</div>
      </header>
      <main className="study-main">
        <aside className="study-rail" aria-label="Evidence workflow">
          <p className="study-kicker">Evidence protocol</p>
          <h1>{headline}</h1>
          <ol>{steps.map((step) => <StudyRailStep key={step.label} {...step} />)}</ol>
          <div className="study-boundary"><LockClosedIcon aria-hidden="true" /><p>{boundary}</p></div>
        </aside>
        <section className="study-workspace" aria-live="polite">{children}</section>
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

function FileDrop({ id, label, detail, accept, onFile, complete = false }: { id: string; label: string; detail: string; accept: string; onFile: (file: File | undefined) => void; complete?: boolean }) {
  return (
    <label className={`study-file-drop${complete ? " complete" : ""}`} htmlFor={id}>
      <span className="study-file-icon">{complete ? <CheckCircledIcon aria-hidden="true" /> : <FileTextIcon aria-hidden="true" />}</span>
      <strong>{label}</strong>
      <small>{detail}</small>
      <span className="study-file-button">{complete ? "Replace file" : "Choose file"}</span>
      <input id={id} type="file" accept={accept} onChange={(event) => onFile(event.target.files?.[0])} />
    </label>
  );
}

function ErrorList({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return <div className="study-errors" role="alert"><strong>Evidence cannot continue</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>;
}

function ParticipantNav({ currentIndex, saved, onSelect }: { currentIndex: number; saved: Set<string>; onSelect: (index: number) => void }) {
  return (
    <div className="study-participant-nav" aria-label="Participant scores">
      <button type="button" aria-label="Previous participant" disabled={currentIndex === 0} onClick={() => onSelect(currentIndex - 1)}><ChevronLeftIcon /></button>
      <div>{participantIds.map((id, index) => <button key={id} type="button" className={`${index === currentIndex ? "active" : ""}${saved.has(id) ? " saved" : ""}`} onClick={() => onSelect(index)} aria-label={`${id}${saved.has(id) ? ", scored" : ""}`}>{id.slice(1)}</button>)}</div>
      <button type="button" aria-label="Next participant" disabled={currentIndex === participantIds.length - 1} onClick={() => onSelect(currentIndex + 1)}><ChevronRightIcon /></button>
    </div>
  );
}

function ResponseEvidence({ record }: { record: RawStudyRecord }) {
  return (
    <div className="study-response-evidence">
      <div className="study-response-heading"><span>Frozen response</span><small>{record.recruiter_profile} · {record.screen_order}</small></div>
      <dl>
        <ResponseRow label="Who" value={record.lead_who_verbatim} />
        <ResponseRow label="Change" value={record.lead_change_verbatim} />
        <ResponseRow label="Why now" value={record.lead_why_verbatim} />
        <ResponseRow label="Next" value={record.lead_next_verbatim} />
        <ResponseRow label="Destination" value={record.lead_destination_verbatim} />
        <ResponseRow label="Fact vs action" value={record.fact_action_verbatim} />
      </dl>
    </div>
  );
}

function ResponseRow({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function CriterionGroup({ title, criterionIds, participantId, decisions, onDecision }: { title: string; criterionIds: CriterionId[]; participantId: string; decisions: CriterionDraft; onDecision: (criterionId: CriterionId, value: boolean) => void }) {
  return (
    <fieldset className="study-criteria">
      <legend>{title}</legend>
      {criterionIds.map((criterionId) => {
        const criterion = criteria.find((item) => item.id === criterionId)!;
        return (
          <div className="study-criterion" key={criterionId}>
            <div><strong>{criterion.shortLabel}</strong><span>{criterion.description}</span></div>
            <div className="study-binary" role="radiogroup" aria-label={`${participantId} ${criterion.shortLabel}`}>
              <label><input type="radio" name={`${participantId}-${criterionId}`} checked={decisions[criterionId] === true} onChange={() => onDecision(criterionId, true)} /><span>Supported</span></label>
              <label><input type="radio" name={`${participantId}-${criterionId}`} checked={decisions[criterionId] === false} onChange={() => onDecision(criterionId, false)} /><span>Not supported</span></label>
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}

function DisagreementNav({ disagreements, drafts, currentIndex, onSelect }: { disagreements: ReturnType<typeof findDisagreements>; drafts: Record<string, AdjudicationDraft>; currentIndex: number; onSelect: (index: number) => void }) {
  return (
    <div className="study-disagreement-nav">
      <button type="button" disabled={currentIndex === 0} onClick={() => onSelect(currentIndex - 1)}><ChevronLeftIcon aria-hidden="true" /> Previous</button>
      <span>{currentIndex + 1} of {disagreements.length}</span>
      <button type="button" disabled={currentIndex === disagreements.length - 1} onClick={() => onSelect(currentIndex + 1)}>Next <ChevronRightIcon aria-hidden="true" /></button>
      <div>{disagreements.map((item, index) => <button key={disagreementKey(item.participantId, item.criterionId)} type="button" className={`${index === currentIndex ? "active" : ""}${isAdjudicationComplete(drafts[disagreementKey(item.participantId, item.criterionId)]) ? " complete" : ""}`} onClick={() => onSelect(index)} aria-label={`Disagreement ${index + 1}`}>{index + 1}</button>)}</div>
    </div>
  );
}

function ScoreValue({ label, value }: { label: string; value: boolean }) {
  return <div className={value ? "supported" : "unsupported"}><span>{label}</span><strong>{value ? "Supported" : "Not supported"}</strong></div>;
}

function GateCard({ label, passes, gate }: { label: string; passes: number; gate: string }) {
  return <div className={`study-gate-card ${gate}`}><span>{label}</span><strong>{passes}/10</strong><small>{gate} · minimum 9/10</small></div>;
}

function toParticipantScore(participantId: string, draft: ScoreDraft): ParticipantScore {
  return { participantId, decisions: draft.decisions as ParticipantScore["decisions"], notes: draft.notes };
}

function testPassDraft(decisions: CriterionDraft, test: "five-second" | "fact-action") {
  return criteria.filter((criterion) => criterion.test === test).every((criterion) => decisions[criterion.id] === true);
}

function disagreementKey(participantId: string, criterionId: CriterionId) {
  return `${participantId}:${criterionId}`;
}

function isAdjudicationComplete(draft: AdjudicationDraft | undefined): draft is { finalValue: boolean; rationale: string } {
  return draft?.finalValue !== null && Boolean(draft?.rationale.trim());
}

async function sha256(text: string): Promise<string> {
  const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeFilePart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "scorer";
}

function withoutParticipant(current: Set<string>, participantId: string) {
  if (!current.has(participantId)) return current;
  const next = new Set(current);
  next.delete(participantId);
  return next;
}

function downloadText(fileName: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
