import type { PersonDirectoryItem } from "@talent-signal/contracts";

const fieldLabels: Record<string, string> = {
  availability: "Availability",
  competing_process: "Competing process",
  current_employer: "Current company",
  current_role: "Current role",
  decision_deadline: "Decision deadline",
  location: "Location",
  notice_period: "Notice period",
  relocation_requirement: "Relocation requirement",
  work_mode_constraint: "Work mode constraint",
  work_mode_preference: "Work mode preference",
};

export function personContextSummary(person: PersonDirectoryItem) {
  if (person.contexts.length === 0) {
    return "No active relationship context";
  }

  const visibleContexts = person.contexts
    .slice(0, 2)
    .map((context) => context.display_label)
    .join(" · ");
  const remainingCount = Math.max(0, person.contexts.length - 2);
  return remainingCount > 0
    ? `${visibleContexts} · +${remainingCount} more`
    : visibleContexts;
}

export function initials(value: string) {
  const segments = value.trim().split(/\s+/);
  if (segments.length === 1) {
    return value.slice(0, 2).toUpperCase();
  }
  return segments
    .map((segment) => segment[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function fieldLabel(field: string) {
  if (field.startsWith("professional_history.")) {
    return "Professional history";
  }
  return fieldLabels[field] ?? field.replaceAll("_", " ");
}

export function reviewLabel(status: string) {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "dismissed":
      return "Dismissed";
    case "unresolved":
      return "Needs clarification";
    default:
      return "Proposed";
  }
}

export function sourceKindLabel(kind: string) {
  switch (kind) {
    case "screenshot_metadata":
      return "Conversation screenshot";
    case "transcript":
      return "Reviewed conversation";
    case "fixture":
      return "Synthetic capture";
    default:
      return "Imported evidence";
  }
}

export function sourceScopeLabel(scope: string) {
  switch (scope) {
    case "reviewed_extracted_text":
      return "Reviewed text only";
    case "reviewed_selected_text":
      return "Reviewed selection";
    case "reviewed_evidence_crop":
      return "Evidence crop retained";
    case "full_reviewed_source":
      return "Full source retained";
    case "legacy_unknown":
      return "Legacy scope unverified";
    default:
      return scope.replaceAll("_", " ");
  }
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}
