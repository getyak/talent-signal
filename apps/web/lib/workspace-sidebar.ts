/**
 * Pure projections for the sidebar's real people hierarchy.
 *
 * The sidebar never owns People or Session state. It renders the same
 * account-scoped directory projection the People page shows, and pairs each
 * person with the sessions whose server-provided `person_id` matches. Nothing
 * here infers a person from a name, a label or a heuristic.
 */

export type SidebarPersonContext = {
  id: string;
  label: string;
};

export type SidebarPerson = {
  id: string;
  label: string;
  detail: string;
  avatarUrl: string | null;
  contexts: SidebarPersonContext[];
};

export type SidebarSessionRow = {
  id: string;
  title: string;
  personId: string | null;
  active: boolean;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Rejects any payload that is not a bounded People directory response. */
export function sidebarPeopleFromDirectory(
  payload: unknown,
  limit = 5,
): SidebarPerson[] {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("people" in payload) ||
    !Array.isArray((payload as { people?: unknown }).people)
  ) {
    return [];
  }
  const people: SidebarPerson[] = [];
  for (const entry of (payload as { people: unknown[] }).people) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const id = text(record.id);
    const label = text(record.display_label);
    if (!id || !label) continue;
    const contexts = Array.isArray(record.contexts)
      ? (record.contexts as unknown[])
          .map((context) => {
            if (!context || typeof context !== "object") return null;
            const item = context as Record<string, unknown>;
            const contextId = text(item.id);
            const contextLabel = text(item.display_label);
            if (!contextId || !contextLabel) return null;
            return { id: contextId, label: contextLabel } satisfies SidebarPersonContext;
          })
          .filter((context): context is SidebarPersonContext => context !== null)
      : [];
    const avatar =
      record.avatar && typeof record.avatar === "object"
        ? text((record.avatar as Record<string, unknown>).url)
        : "";
    people.push({
      id,
      label,
      detail: contexts[0]?.label ?? "联系人",
      avatarUrl: avatar || null,
      contexts,
    });
    if (people.length === limit) break;
  }
  return people;
}

/** Bounded, active-only session rows keyed by the server-provided person id. */
export function sidebarSessionRows(payload: unknown): SidebarSessionRow[] {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("sessions" in payload) ||
    !Array.isArray((payload as { sessions?: unknown }).sessions)
  ) {
    return [];
  }
  const rows: SidebarSessionRow[] = [];
  for (const entry of (payload as { sessions: unknown[] }).sessions) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const id = text(record.session_id);
    const title = text(record.title);
    if (!id || !title) continue;
    rows.push({
      id,
      title,
      personId: text(record.person_id) || null,
      active: record.state === "active",
    });
  }
  return rows;
}

/**
 * Sessions that the canonical record already bound to this exact person id.
 * A name match is never sufficient, so this returns nothing without one.
 */
export function relatedSessionsForPerson(
  rows: readonly SidebarSessionRow[],
  personId: string,
  limit = 2,
): SidebarSessionRow[] {
  return rows
    .filter((row) => row.active && row.personId === personId)
    .slice(0, limit);
}

/** Deep link to a person's living page, preferring a real relationship context. */
export function sidebarPersonHref(person: SidebarPerson): string {
  const context = person.contexts[0];
  if (!context) return `/workspace?person=${encodeURIComponent(person.id)}`;
  const search = new URLSearchParams({
    person: person.id,
    context: context.id,
  });
  return `/workspace?${search.toString()}`;
}
