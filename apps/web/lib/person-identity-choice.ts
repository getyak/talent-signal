import type { PersonDirectoryItem } from "@talent-signal/contracts";

const handleLabels: Record<string, string> = {
  email: "邮箱",
  linkedin: "LinkedIn",
  phone: "电话",
  wechat: "微信",
};

function normalized(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export function personIdentityChoiceClues(person: PersonDirectoryItem) {
  const profile = person.profile?.headline.trim();
  const handles = person.identity_matches.flatMap((match) => {
    if (match.kind === "name") {
      return [];
    }
    const status = match.kind === "expired_handle" ? "历史" : "已确认";
    return [
      `${status}${handleLabels[match.handle_type] ?? match.handle_type} · ${match.display_hint}`,
    ];
  });
  const contexts = person.contexts.map(
    (context) => `关系 · ${context.display_label}`,
  );
  return [...(profile ? [`简介 · ${profile}`] : []), ...handles, ...contexts];
}

export function personIdentityChoiceFingerprint(person: PersonDirectoryItem) {
  const confirmedHandles = person.identity_matches.flatMap((match) =>
    match.kind === "confirmed_handle"
      ? [
          `${match.handle_type}:${normalized(match.display_hint)}`,
        ]
      : [],
  );
  return JSON.stringify({
    confirmedHandles: confirmedHandles.sort(),
    displayLabel: normalized(person.display_label),
  });
}

export function indistinguishablePersonIds(people: PersonDirectoryItem[]) {
  const groups = new Map<string, string[]>();
  for (const person of people) {
    const fingerprint = personIdentityChoiceFingerprint(person);
    groups.set(fingerprint, [...(groups.get(fingerprint) ?? []), person.id]);
  }
  return new Set(
    [...groups.values()]
      .filter((ids) => ids.length > 1)
      .flat(),
  );
}

export type ScreenshotIdentityChoiceIssue =
  | "ambiguous_existing_person"
  | "ambiguous_new_person"
  | "selected_person_not_in_candidates";

export function screenshotIdentityChoiceIssue(
  people: PersonDirectoryItem[],
  selectedPersonId: string | null,
): ScreenshotIdentityChoiceIssue | null {
  const ambiguousIds = indistinguishablePersonIds(people);
  if (selectedPersonId) {
    if (!people.some((person) => person.id === selectedPersonId)) {
      return "selected_person_not_in_candidates";
    }
    return ambiguousIds.has(selectedPersonId)
      ? "ambiguous_existing_person"
      : null;
  }
  return ambiguousIds.size > 0 ? "ambiguous_new_person" : null;
}
