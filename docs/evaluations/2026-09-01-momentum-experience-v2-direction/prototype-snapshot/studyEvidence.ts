export const participantIds = Array.from(
  { length: 10 },
  (_, index) => `P${String(index + 1).padStart(2, "0")}`,
);

export const rawStudyHeaders = [
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
] as const;

export type RawStudyHeader = (typeof rawStudyHeaders)[number];
export type RawStudyRecord = Record<RawStudyHeader, string>;
export type ScorerRole = "scorer_1" | "scorer_2";

export const criteria = [
  {
    id: "lead_context",
    test: "five-second" as const,
    shortLabel: "Alex + Aurora context",
    description: "Identifies Alex/the candidate and the Aurora role context.",
    responseFields: ["lead_who_verbatim"] as RawStudyHeader[],
  },
  {
    id: "lead_remote_unresolved",
    test: "five-second" as const,
    shortLabel: "Remote remains unresolved",
    description: "States that the remote policy remains unresolved.",
    responseFields: ["lead_change_verbatim"] as RawStudyHeader[],
  },
  {
    id: "lead_due",
    test: "five-second" as const,
    shortLabel: "Due Wednesday / Sep 2",
    description: "Recognizes that the decision is due Wednesday or Sep 2.",
    responseFields: ["lead_why_verbatim"] as RawStudyHeader[],
  },
  {
    id: "lead_next_review",
    test: "five-second" as const,
    shortLabel: "Review the fact next",
    description: "Says the recruiter should review or confirm the supported fact next.",
    responseFields: ["lead_next_verbatim"] as RawStudyHeader[],
  },
  {
    id: "lead_destination",
    test: "five-second" as const,
    shortLabel: "Correct continuation",
    description: "Indicates the lead dependency or “Review one supported fact” destination.",
    responseFields: ["lead_destination_verbatim"] as RawStudyHeader[],
  },
  {
    id: "authority_fact_internal_only",
    test: "fact-action" as const,
    shortLabel: "Fact changes internal state only",
    description: "Understands that Confirm fact changes unknown to Sep 2 without authorizing a write.",
    responseFields: ["fact_action_verbatim"] as RawStudyHeader[],
  },
  {
    id: "authority_reminder_local_only",
    test: "fact-action" as const,
    shortLabel: "Approval creates one local reminder",
    description: "Understands that Approve exact effect authorizes one recruiter-owned local reminder.",
    responseFields: ["fact_action_verbatim"] as RawStudyHeader[],
  },
  {
    id: "authority_no_external_write",
    test: "fact-action" as const,
    shortLabel: "No external write implied",
    description: "Does not infer a message, meeting, contact, ATS, or CRM write.",
    responseFields: ["fact_action_verbatim"] as RawStudyHeader[],
  },
] as const;

export type CriterionId = (typeof criteria)[number]["id"];
export type CriterionDecision = Record<CriterionId, boolean>;
export type CriterionDraft = Record<CriterionId, boolean | null>;

export const scorerHeaders = [
  "raw_sha256",
  "participant_id",
  "scorer_role",
  "scorer_id",
  ...criteria.map((criterion) => criterion.id),
  "five_second_pass",
  "fact_action_pass",
  "scorer_notes",
] as const;

export const adjudicationHeaders = [
  "raw_sha256",
  "participant_id",
  "criterion_id",
  "scorer_1_value",
  "scorer_2_value",
  "final_value",
  "adjudicator_id",
  "rationale",
] as const;

export const finalResultHeaders = [...rawStudyHeaders] as const;

export type ValidationResult<Value> =
  | { ok: true; value: Value }
  | { ok: false; errors: string[] };

export type ParticipantScore = {
  participantId: string;
  decisions: CriterionDecision;
  notes: string;
};

export type ScorerRecord = ParticipantScore & {
  rawSha256: string;
  scorerRole: ScorerRole;
  scorerId: string;
  fiveSecondPass: boolean;
  factActionPass: boolean;
};

export type ScorerBundle = {
  rawSha256: string;
  scorerRole: ScorerRole;
  scorerId: string;
  records: ScorerRecord[];
};

export type ScorerPair = {
  scorer1: ScorerBundle;
  scorer2: ScorerBundle;
};

export type Disagreement = {
  participantId: string;
  criterionId: CriterionId;
  scorer1Value: boolean;
  scorer2Value: boolean;
};

export type AdjudicationDecision = Disagreement & {
  finalValue: boolean;
  rationale: string;
};

export type FinalParticipantResult = {
  participantId: string;
  decisions: CriterionDecision;
  fiveSecondPass: boolean;
  factActionPass: boolean;
  adjudications: AdjudicationDecision[];
};

export type FinalStudy = {
  rawSha256: string;
  adjudicatorId: string;
  scorerPair: ScorerPair;
  results: FinalParticipantResult[];
};

export function emptyCriterionDraft(): CriterionDraft {
  return Object.fromEntries(criteria.map((criterion) => [criterion.id, null])) as CriterionDraft;
}

export function orderForParticipant(participantId: string): "fact-first" | "approval-first" {
  const number = Number.parseInt(participantId.slice(1), 10);
  return number % 2 === 0 ? "approval-first" : "fact-first";
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell === "") {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error("CSV ended inside a quoted field.");
  row.push(cell);
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

export function serializeCsv(rows: ReadonlyArray<ReadonlyArray<string | boolean>>): string {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value: string | boolean): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function recordRows(text: string, requiredHeaders: readonly string[]): ValidationResult<Record<string, string>[]> {
  let rows: string[][];
  try {
    rows = parseCsv(text);
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : "CSV could not be parsed."] };
  }
  if (rows.length === 0) return { ok: false, errors: ["CSV is empty."] };

  const headers = rows[0].map((header, index) => index === 0 ? header.replace(/^\uFEFF/, "") : header);
  const errors: string[] = [];
  for (const required of requiredHeaders) {
    if (!headers.includes(required)) errors.push(`Missing required column: ${required}.`);
  }
  const duplicates = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicates.length > 0) errors.push(`Duplicate columns: ${[...new Set(duplicates)].join(", ")}.`);
  if (errors.length > 0) return { ok: false, errors };

  const records = rows.slice(1).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ""]),
  ));
  return { ok: true, value: records };
}

export function parseRawStudyCsv(text: string): ValidationResult<RawStudyRecord[]> {
  const parsed = recordRows(text, rawStudyHeaders);
  if (!parsed.ok) return parsed;
  const errors: string[] = [];
  const records = parsed.value as RawStudyRecord[];

  if (records.length !== participantIds.length) {
    errors.push(`Expected exactly 10 participant rows; found ${records.length}.`);
  }
  const seen = new Set<string>();
  for (const record of records) {
    const id = record.participant_id.trim();
    if (!participantIds.includes(id)) errors.push(`${id || "Blank participant"}: participant_id must be P01–P10.`);
    if (seen.has(id)) errors.push(`${id}: duplicate participant row.`);
    seen.add(id);
    if (record.first_use.trim().toLowerCase() !== "true") errors.push(`${id}: first_use must be true.`);
    if (!record.recruiter_profile.trim()) errors.push(`${id}: recruiter_profile is required.`);
    if (!record.device.trim()) errors.push(`${id}: device is required.`);
    if (record.screen_order.trim() !== orderForParticipant(id)) errors.push(`${id}: screen_order does not match the frozen alternation.`);
    for (const field of [
      "lead_who_verbatim",
      "lead_change_verbatim",
      "lead_why_verbatim",
      "lead_next_verbatim",
      "lead_destination_verbatim",
      "fact_action_verbatim",
    ] as RawStudyHeader[]) {
      if (!record[field].trim()) errors.push(`${id}: ${field} is required before scoring.`);
    }
    for (const field of [
      "five_second_pass",
      "fact_action_pass",
      "scorer_1",
      "scorer_2",
      "adjudication",
    ] as RawStudyHeader[]) {
      if (record[field].trim()) errors.push(`${id}: raw input must leave ${field} blank.`);
    }
  }
  for (const id of participantIds) {
    if (!seen.has(id)) errors.push(`${id}: participant row is missing.`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: records.sort((left, right) => left.participant_id.localeCompare(right.participant_id)) };
}

export function computeTestPass(decisions: CriterionDecision, test: "five-second" | "fact-action"): boolean {
  return criteria.filter((criterion) => criterion.test === test).every((criterion) => decisions[criterion.id]);
}

export function buildScorerCsv(
  rawSha256: string,
  scorerRole: ScorerRole,
  scorerId: string,
  scores: ParticipantScore[],
): string {
  const scoreMap = new Map(scores.map((score) => [score.participantId, score]));
  const rows: Array<Array<string | boolean>> = [Array.from(scorerHeaders)];
  for (const participantId of participantIds) {
    const score = scoreMap.get(participantId);
    if (!score) throw new Error(`${participantId}: completed score is missing.`);
    const fiveSecondPass = computeTestPass(score.decisions, "five-second");
    const factActionPass = computeTestPass(score.decisions, "fact-action");
    rows.push([
      rawSha256,
      participantId,
      scorerRole,
      scorerId.trim(),
      ...criteria.map((criterion) => score.decisions[criterion.id]),
      fiveSecondPass,
      factActionPass,
      score.notes,
    ]);
  }
  return serializeCsv(rows);
}

function parseBoolean(value: string, label: string, errors: string[]): boolean {
  if (value.trim().toLowerCase() === "true") return true;
  if (value.trim().toLowerCase() === "false") return false;
  errors.push(`${label} must be true or false.`);
  return false;
}

export function parseScorerCsv(text: string): ValidationResult<ScorerBundle> {
  const parsed = recordRows(text, scorerHeaders);
  if (!parsed.ok) return parsed;
  const errors: string[] = [];
  if (parsed.value.length !== participantIds.length) {
    errors.push(`Expected exactly 10 scorer rows; found ${parsed.value.length}.`);
  }

  const records: ScorerRecord[] = [];
  const seen = new Set<string>();
  for (const row of parsed.value) {
    const participantId = row.participant_id?.trim() ?? "";
    const scorerRole = row.scorer_role?.trim() as ScorerRole;
    const scorerId = row.scorer_id?.trim() ?? "";
    const rawSha256 = row.raw_sha256?.trim() ?? "";
    if (!participantIds.includes(participantId)) errors.push(`${participantId || "Blank participant"}: scorer participant_id must be P01–P10.`);
    if (seen.has(participantId)) errors.push(`${participantId}: duplicate scorer row.`);
    seen.add(participantId);
    if (scorerRole !== "scorer_1" && scorerRole !== "scorer_2") errors.push(`${participantId}: scorer_role must be scorer_1 or scorer_2.`);
    if (!scorerId) errors.push(`${participantId}: scorer_id is required.`);
    if (!/^[a-f0-9]{64}$/i.test(rawSha256)) errors.push(`${participantId}: raw_sha256 must be a SHA-256 fingerprint.`);

    const decisions = Object.fromEntries(criteria.map((criterion) => [
      criterion.id,
      parseBoolean(row[criterion.id] ?? "", `${participantId}: ${criterion.id}`, errors),
    ])) as CriterionDecision;
    const fiveSecondPass = parseBoolean(row.five_second_pass ?? "", `${participantId}: five_second_pass`, errors);
    const factActionPass = parseBoolean(row.fact_action_pass ?? "", `${participantId}: fact_action_pass`, errors);
    if (fiveSecondPass !== computeTestPass(decisions, "five-second")) errors.push(`${participantId}: five_second_pass does not match its atomic criteria.`);
    if (factActionPass !== computeTestPass(decisions, "fact-action")) errors.push(`${participantId}: fact_action_pass does not match its atomic criteria.`);
    records.push({
      participantId,
      rawSha256,
      scorerRole,
      scorerId,
      decisions,
      fiveSecondPass,
      factActionPass,
      notes: row.scorer_notes ?? "",
    });
  }

  for (const id of participantIds) {
    if (!seen.has(id)) errors.push(`${id}: scorer row is missing.`);
  }
  const roles = new Set(records.map((record) => record.scorerRole));
  const scorerIds = new Set(records.map((record) => record.scorerId));
  const fingerprints = new Set(records.map((record) => record.rawSha256));
  if (roles.size !== 1) errors.push("A scorer file must contain one consistent scorer_role.");
  if (scorerIds.size !== 1) errors.push("A scorer file must contain one consistent scorer_id.");
  if (fingerprints.size !== 1) errors.push("A scorer file must contain one consistent raw_sha256.");
  if (errors.length > 0) return { ok: false, errors };

  const first = records[0];
  return {
    ok: true,
    value: {
      rawSha256: first.rawSha256,
      scorerRole: first.scorerRole,
      scorerId: first.scorerId,
      records: records.sort((left, right) => left.participantId.localeCompare(right.participantId)),
    },
  };
}

export function validateScorerPair(
  first: ScorerBundle,
  second: ScorerBundle,
  rawSha256: string,
): ValidationResult<ScorerPair> {
  const errors: string[] = [];
  if (first.scorerRole === second.scorerRole) errors.push("Import one scorer_1 file and one scorer_2 file.");
  if (first.scorerId.trim().toLowerCase() === second.scorerId.trim().toLowerCase()) errors.push("The two independent scorer IDs must be different.");
  if (first.rawSha256 !== rawSha256 || second.rawSha256 !== rawSha256) errors.push("Both scorer files must match the imported raw-response fingerprint.");
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: first.scorerRole === "scorer_1"
      ? { scorer1: first, scorer2: second }
      : { scorer1: second, scorer2: first },
  };
}

export function findDisagreements(pair: ScorerPair): Disagreement[] {
  const secondMap = new Map(pair.scorer2.records.map((record) => [record.participantId, record]));
  return pair.scorer1.records.flatMap((firstRecord) => {
    const secondRecord = secondMap.get(firstRecord.participantId);
    if (!secondRecord) return [];
    return criteria.flatMap((criterion) => {
      const scorer1Value = firstRecord.decisions[criterion.id];
      const scorer2Value = secondRecord.decisions[criterion.id];
      return scorer1Value === scorer2Value ? [] : [{
        participantId: firstRecord.participantId,
        criterionId: criterion.id,
        scorer1Value,
        scorer2Value,
      }];
    });
  });
}

export function finalizeStudy(
  rawSha256: string,
  pair: ScorerPair,
  adjudicatorId: string,
  adjudications: AdjudicationDecision[],
): ValidationResult<FinalStudy> {
  const errors: string[] = [];
  if (!adjudicatorId.trim()) errors.push("Adjudicator ID is required.");
  if (pair.scorer1.rawSha256 !== rawSha256 || pair.scorer2.rawSha256 !== rawSha256) {
    errors.push("Scorer files do not match the raw-response fingerprint.");
  }
  const disagreements = findDisagreements(pair);
  const decisionMap = new Map(adjudications.map((decision) => [`${decision.participantId}:${decision.criterionId}`, decision]));
  if (decisionMap.size !== adjudications.length) errors.push("Each atomic disagreement may have only one adjudication row.");
  const disagreementMap = new Map(disagreements.map((disagreement) => [`${disagreement.participantId}:${disagreement.criterionId}`, disagreement]));
  for (const decision of adjudications) {
    const key = `${decision.participantId}:${decision.criterionId}`;
    const disagreement = disagreementMap.get(key);
    if (!disagreement) errors.push(`${key}: adjudication does not correspond to a scorer disagreement.`);
    else if (decision.scorer1Value !== disagreement.scorer1Value || decision.scorer2Value !== disagreement.scorer2Value) {
      errors.push(`${key}: adjudication scorer values do not match the frozen scorer files.`);
    }
  }
  for (const disagreement of disagreements) {
    const key = `${disagreement.participantId}:${disagreement.criterionId}`;
    const decision = decisionMap.get(key);
    if (!decision) errors.push(`${key}: final adjudication is missing.`);
    else if (!decision.rationale.trim()) errors.push(`${key}: adjudication rationale is required.`);
  }
  if (errors.length > 0) return { ok: false, errors };

  const scorer2Map = new Map(pair.scorer2.records.map((record) => [record.participantId, record]));
  const results = pair.scorer1.records.map((scorer1Record) => {
    const scorer2Record = scorer2Map.get(scorer1Record.participantId)!;
    const decisions = Object.fromEntries(criteria.map((criterion) => {
      const scorer1Value = scorer1Record.decisions[criterion.id];
      const scorer2Value = scorer2Record.decisions[criterion.id];
      const finalValue = scorer1Value === scorer2Value
        ? scorer1Value
        : decisionMap.get(`${scorer1Record.participantId}:${criterion.id}`)!.finalValue;
      return [criterion.id, finalValue];
    })) as CriterionDecision;
    return {
      participantId: scorer1Record.participantId,
      decisions,
      fiveSecondPass: computeTestPass(decisions, "five-second"),
      factActionPass: computeTestPass(decisions, "fact-action"),
      adjudications: adjudications.filter((decision) => decision.participantId === scorer1Record.participantId),
    };
  });

  return {
    ok: true,
    value: {
      rawSha256,
      adjudicatorId: adjudicatorId.trim(),
      scorerPair: pair,
      results,
    },
  };
}

export function buildFinalResultsCsv(rawRecords: RawStudyRecord[], finalStudy: FinalStudy): string {
  const rawMap = new Map(rawRecords.map((record) => [record.participant_id, record]));
  const finalMap = new Map(finalStudy.results.map((result) => [result.participantId, result]));
  const rows: Array<Array<string | boolean>> = [Array.from(finalResultHeaders)];
  for (const participantId of participantIds) {
    const raw = rawMap.get(participantId)!;
    const result = finalMap.get(participantId)!;
    const adjudication = result.adjudications.length === 0
      ? "agreed independently"
      : result.adjudications.map((decision) => `${decision.criterionId}=${decision.finalValue}: ${decision.rationale.trim()}`).join(" | ");
    rows.push([
      raw.participant_id,
      raw.recruiter_profile,
      raw.first_use,
      raw.device,
      raw.screen_order,
      raw.lead_who_verbatim,
      raw.lead_change_verbatim,
      raw.lead_why_verbatim,
      raw.lead_next_verbatim,
      raw.lead_destination_verbatim,
      result.fiveSecondPass,
      raw.fact_action_verbatim,
      result.factActionPass,
      finalStudy.scorerPair.scorer1.scorerId,
      finalStudy.scorerPair.scorer2.scorerId,
      adjudication,
      raw.notes,
    ]);
  }
  return serializeCsv(rows);
}

export function buildAdjudicationCsv(finalStudy: FinalStudy): string {
  const rows: Array<Array<string | boolean>> = [Array.from(adjudicationHeaders)];
  for (const result of finalStudy.results) {
    for (const decision of result.adjudications) {
      rows.push([
        finalStudy.rawSha256,
        decision.participantId,
        decision.criterionId,
        decision.scorer1Value,
        decision.scorer2Value,
        decision.finalValue,
        finalStudy.adjudicatorId,
        decision.rationale,
      ]);
    }
  }
  return serializeCsv(rows);
}

export function buildStatusDraft(finalStudy: FinalStudy) {
  const fiveSecondPasses = finalStudy.results.filter((result) => result.fiveSecondPass).length;
  const factActionPasses = finalStudy.results.filter((result) => result.factActionPass).length;
  const fiveSecondGate = fiveSecondPasses >= 9 ? "passed" : "failed";
  const factActionGate = factActionPasses >= 9 ? "passed" : "failed";
  const status = fiveSecondGate === "passed" && factActionGate === "passed" ? "passed" : "failed";
  return {
    status,
    participants_required: 10,
    participants_completed: 10,
    five_second_passes: fiveSecondPasses,
    five_second_gate: fiveSecondGate,
    fact_action_passes: factActionPasses,
    fact_action_gate: factActionGate,
    minimum_passes_per_gate: 9,
    raw_response_sha256: finalStudy.rawSha256,
    scorer_1: finalStudy.scorerPair.scorer1.scorerId,
    scorer_2: finalStudy.scorerPair.scorer2.scorerId,
    adjudicator: finalStudy.adjudicatorId,
    draft_requires_manual_review: true,
    claim: `Ten first-use participant responses were independently double-scored by humans. Test A: ${fiveSecondPasses}/10. Test B: ${factActionPasses}/10. This draft has not updated the official MX-01 status.`,
  };
}

export function responseForCriterion(record: RawStudyRecord, criterionId: CriterionId): string {
  const criterion = criteria.find((item) => item.id === criterionId)!;
  return criterion.responseFields.map((field) => record[field]).filter(Boolean).join("\n\n");
}
