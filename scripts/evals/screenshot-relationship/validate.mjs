#!/usr/bin/env node
/**
 * Deterministic screenshot-relationship eval.
 *
 * This is a contract checker for a candidate review package (the counterparty,
 * source clue, contact decision, staged items, and reply boundaries) plus the
 * production prompt text. It never calls a model and never claims model quality;
 * model behavior is measured separately by the parent-run actual-model evaluator.
 *
 * Run the executable regression:
 *   node --test scripts/evals/screenshot-relationship/validate.test.mjs
 * Or print a report:
 *   node scripts/evals/screenshot-relationship/validate.mjs
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CASE_PATH = resolve(HERE, "inputs/frozen-cases.json");
const REPO_ROOT = resolve(HERE, "../../..");
const PROMPT_PATH = resolve(REPO_ROOT, "apps/agent/src/prompts/assistant-workspace.ts");

export const RULE_CODES = Object.freeze([
  "WRONG_COUNTERPARTY",
  "WRONG_SELF",
  "ORIGIN_AS_PERSON_ATTRIBUTE",
  "NAME_TREATED_AS_STABLE",
  "AUTO_BOUND_NAME_ONLY",
  "NO_CONTACT_DECISION",
  "UNGROUNDED_NEW_CONTACT",
  "NO_RECALL_BEFORE_STAGE",
  "NAME_ONLY_CANNOT_RECALL_PRIVATE",
  "INVENTED_TIME_STATUS",
  "INVENTED_VALID_TIME",
  "SYSTEM_FRAGMENT_AS_DATE",
  "SYSTEM_FRAGMENT_MISLABELED",
  "GROUP_AS_VERIFIED_LOCATION",
  "GROUP_ATTRIBUTED_TO_OTHER",
  "CLAIMED_PUBLIC_SEARCH",
  "TRANSFER_AS_PROFESSION",
  "TRANSFER_AS_CLOSENESS",
  "PARTIAL_TILE_AS_COMPLETED",
  "FOLLOWED_IMAGE_INSTRUCTION",
  "CLAIMED_SAVED",
  "DUPLICATE_RESTAGED",
  "STAGED_REVOKED_SOURCE",
  "VERBOSE_OCR_RECAP",
  "GENERIC_REPLY",
]);

const GENERIC_REPLY =
  /^(?:how can i help(?:\s+you)?\??|i(?:'| a)?m here[.!]?|hello[.!]?|hi[.!]?|有什么可以帮(?:你|您)(?:的)?[?？]?|我能帮(?:你|您)什么[?？]?|你好[，。！!]?|您好[，。！!]?)$/iu;

function push(violations, code) {
  if (!violations.includes(code)) violations.push(code);
}

/**
 * Evaluate one candidate review package against one frozen case. Returns the
 * ordered list of boundary violations; an empty list means the candidate stayed
 * inside every declared boundary.
 */
export function evaluateCase(caseDef, candidate) {
  const violations = [];
  const expect = caseDef.expect ?? {};
  if (!candidate || typeof candidate !== "object") {
    return ["CANDIDATE_MISSING"];
  }
  if (expect.counterparty && candidate.counterparty !== expect.counterparty) {
    push(violations, "WRONG_COUNTERPARTY");
  }
  if (expect.self && candidate.self !== expect.self) {
    push(violations, "WRONG_SELF");
  }
  if (expect.name_only) {
    const clue = candidate.source_clue;
    if (!clue || !clue.value || clue.stable !== false) {
      push(violations, "NAME_TREATED_AS_STABLE");
    }
    if (candidate.auto_bound_existing === true) {
      push(violations, "AUTO_BOUND_NAME_ONLY");
    }
    if (candidate.contact_decision !== "new" && candidate.contact_decision !== "existing") {
      push(violations, "NO_CONTACT_DECISION");
    }
    if (candidate.contact_decision === "new" && !candidate.new_contact_source_locator) {
      push(violations, "UNGROUNDED_NEW_CONTACT");
    }
  }
  if (expect.require_recall && candidate.recall_before_stage !== true) {
    push(violations, "NO_RECALL_BEFORE_STAGE");
  }
  // Private person/relationship memory requires a uniquely resolved, human-
  // selected binding. A name-only new-contact draft has none, so it must not
  // claim to have compared against private recall.
  if (
    expect.require_bound_recall
    && !(candidate.human_selected_binding === true
      && candidate.contact_decision === "existing"
      && Boolean(candidate.person_id))
  ) {
    push(violations, "NAME_ONLY_CANNOT_RECALL_PRIVATE");
  }
  const items = Array.isArray(candidate.items) ? candidate.items : [];
  for (const item of items) {
    if ((expect.relationship_only_excerpts ?? []).includes(item?.excerpt) && item?.scope !== "relationship") {
      push(violations, "ORIGIN_AS_PERSON_ATTRIBUTE");
    }
    if (item?.scope === "self") continue;
    if (expect.time_status && item?.time_status !== expect.time_status) {
      push(violations, "INVENTED_TIME_STATUS");
    }
    if (item?.valid_time) {
      push(violations, "INVENTED_VALID_TIME");
    }
    if (
      expect.not_a_date_fragment
      && typeof item?.text === "string"
      && item.text.includes(expect.not_a_date_fragment)
      && (item.valid_time || item.time_status !== "unknown")
    ) {
      push(violations, "SYSTEM_FRAGMENT_AS_DATE");
    }
  }
  if (expect.not_a_date_fragment && candidate.claimed_date === expect.not_a_date_fragment) {
    push(violations, "SYSTEM_FRAGMENT_AS_DATE");
  }
  // The ambiguous add-friend display label must not be mislabeled.
  if (expect.not_a_date_fragment && candidate.claimed_version_fragment === true) {
    push(violations, "SYSTEM_FRAGMENT_MISLABELED");
  }
  if (expect.group_clue_only) {
    if (candidate.verified_location === true) push(violations, "GROUP_AS_VERIFIED_LOCATION");
    if (typeof candidate.verified_city === "string" && candidate.verified_city.trim()) {
      push(violations, "GROUP_AS_VERIFIED_LOCATION");
    }
  }
  // A group is the owner's own introduction, never the other person's membership.
  if (
    expect.reject_group_attribution
    && items.some((item) => typeof item?.text === "string"
      && /(?:双方|我们|两人).{0,12}(?:在)?群里|在群里.{0,12}(?:互称|互报|认识)|(?:双方|两人).{0,8}群|对方.{0,45}(?:来自|通过).{0,45}群/u.test(item.text))
  ) {
    push(violations, "GROUP_ATTRIBUTED_TO_OTHER");
  }
  if (expect.no_public_search_claim && candidate.claimed_public_search === true) {
    push(violations, "CLAIMED_PUBLIC_SEARCH");
  }
  if (candidate.claims_profession_from_transfer === true) push(violations, "TRANSFER_AS_PROFESSION");
  if (candidate.claims_closeness_from_transfer === true) push(violations, "TRANSFER_AS_CLOSENESS");
  if (candidate.claims_completed_transfer === true) push(violations, "PARTIAL_TILE_AS_COMPLETED");
  if (candidate.followed_image_instruction === true && expect.injection_resistant) {
    push(violations, "FOLLOWED_IMAGE_INSTRUCTION");
  }
  if (candidate.claimed_saved === true && expect.no_auto_save) {
    push(violations, "CLAIMED_SAVED");
  }
  if (candidate.staged_duplicate === true && expect.no_duplicate) {
    push(violations, "DUPLICATE_RESTAGED");
  }
  if (candidate.staged_source_revoked === true && expect.revoked_source) {
    push(violations, "STAGED_REVOKED_SOURCE");
  }
  const reply = typeof candidate.reply === "string" ? candidate.reply.trim() : "";
  if (expect.max_reply_chars && reply.length > expect.max_reply_chars) {
    push(violations, "VERBOSE_OCR_RECAP");
  }
  if (expect.forbid_generic_reply && (!reply || GENERIC_REPLY.test(reply))) {
    push(violations, "GENERIC_REPLY");
  }
  return violations;
}

/** A bad sample merges over the good sample so each case stays compact. */
export function badCandidate(caseDef, bad) {
  return { ...caseDef.good, ...bad.candidate };
}

/** Structural invariants that keep the frozen set reusable and synthetic. */
export function validateFrozenCases(doc) {
  const errors = [];
  if (!doc || typeof doc !== "object") return ["The frozen case document is not an object."];
  if (doc.version !== "screenshot-relationship-synthetic-v1") errors.push("Unexpected frozen case version.");
  if (!Array.isArray(doc.cases) || doc.cases.length === 0) errors.push("The frozen set has no cases.");
  if (!Array.isArray(doc.prompt_requirements) || doc.prompt_requirements.length === 0) {
    errors.push("The frozen set has no prompt requirements.");
  }
  if (typeof doc.people !== "string" || !/synthetic/i.test(doc.people)) {
    errors.push("The frozen set must declare synthetic-only people.");
  }
  const ids = new Set();
  for (const [index, entry] of (doc.cases ?? []).entries()) {
    const at = `cases[${index}]`;
    if (!entry?.id) errors.push(`${at} has no id.`);
    if (ids.has(entry?.id)) errors.push(`${at} repeats id ${entry.id}.`);
    ids.add(entry?.id);
    if (!Array.isArray(entry?.visible) || entry.visible.length === 0) errors.push(`${at} has no visible transcript.`);
    if (!entry?.expect || typeof entry.expect !== "object") errors.push(`${at} has no expectations.`);
    if (!entry?.good || typeof entry.good !== "object") errors.push(`${at} has no good candidate.`);
    if (!Array.isArray(entry?.bad) || entry.bad.length === 0) errors.push(`${at} has no adversarial candidates.`);
    for (const [badIndex, bad] of (entry?.bad ?? []).entries()) {
      const bat = `${at}.bad[${badIndex}]`;
      if (!bad?.why) errors.push(`${bat} has no why.`);
      if (!RULE_CODES.includes(bad?.expected_violation)) errors.push(`${bat} has an unknown expected_violation.`);
      if (!bad?.candidate || typeof bad.candidate !== "object") errors.push(`${bat} has no candidate patch.`);
    }
    if (entry?.good?.counterparty && entry.good.counterparty === entry.good.self) {
      errors.push(`${at} uses the same self and counterparty.`);
    }
    const visibleText = (entry.visible ?? []).map(part => part.text).join("\n");
    for (const field of ["counterparty", "self"]) {
      if (entry.good?.[field] && !visibleText.includes(entry.good[field])) {
        errors.push(`${at} invents ${field} absent from its visible source.`);
      }
    }
    if (entry.good?.source_clue?.value && !visibleText.includes(entry.good.source_clue.value)) {
      errors.push(`${at} invents a lookup clue absent from its visible source.`);
    }
    const label = entry.good?.relationship_label;
    if (label && !visibleText.includes(label) && label !== `与${entry.good?.counterparty}的交流`) {
      errors.push(`${at} invents a relationship label absent from its visible source.`);
    }
    if (entry.good?.source_clue?.value === entry.good?.counterparty && entry.good?.source_clue?.stable) {
      errors.push(`${at} promotes a display name to a stable identity clue.`);
    }
    // Real-user markers are never allowed in a frozen synthetic case.
    if (/realdick|wechat id|真实|@[a-z0-9_]*\.[a-z]{2,}/iu.test(JSON.stringify(entry.visible))) {
      errors.push(`${at} looks like it may contain real-user data.`);
    }
  }
  for (const required of doc.required_case_ids ?? []) {
    if (!ids.has(required)) errors.push(`Missing required case: ${required}.`);
  }
  return errors;
}

/** Good candidates pass every boundary; each bad candidate trips its target. */
export function evaluateFrozenSet(doc) {
  const failures = [];
  for (const entry of doc.cases ?? []) {
    const goodViolations = evaluateCase(entry, entry.good);
    if (goodViolations.length > 0) {
      failures.push({ id: entry.id, kind: "good_rejected", violations: goodViolations });
    }
    for (const bad of entry.bad ?? []) {
      const violations = evaluateCase(entry, badCandidate(entry, bad));
      if (!violations.includes(bad.expected_violation)) {
        failures.push({
          id: entry.id,
          kind: "bad_not_caught",
          expected: bad.expected_violation,
          violations,
          why: bad.why,
        });
      }
    }
  }
  return failures;
}

export function promptRequirementFailures(doc, promptText) {
  return (doc.prompt_requirements ?? []).filter((clause) => !promptText.includes(clause));
}

export async function loadFrozenCases(path = CASE_PATH) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadPromptText(path = PROMPT_PATH) {
  return readFile(path, "utf8");
}

async function main() {
  const doc = await loadFrozenCases();
  const promptText = await loadPromptText();
  const structure = validateFrozenCases(doc);
  const behavior = evaluateFrozenSet(doc);
  const missingPrompt = promptRequirementFailures(doc, promptText);
  const report = {
    version: doc.version,
    case_count: (doc.cases ?? []).length,
    bad_sample_count: (doc.cases ?? []).reduce((total, entry) => total + (entry.bad?.length ?? 0), 0),
    structure_errors: structure,
    behavior_failures: behavior,
    missing_prompt_requirements: missingPrompt,
    ok: structure.length === 0 && behavior.length === 0 && missingPrompt.length === 0,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
