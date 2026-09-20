/**
 * Pure filtering for the global workspace search dialog.
 *
 * Search reads the same authorized People directory projection and the same
 * Session directory rows the rest of the shell already renders. It never
 * invents a second store, never relaxes scope and never fabricates matches
 * when the backend has not returned data.
 */

export type WorkspaceSearchPerson = {
  id: string;
  label: string;
  detail: string;
  avatarUrl: string | null;
};

export type WorkspaceSearchSession = {
  id: string;
  title: string;
  detail: string;
};

export type WorkspaceSearchResults = {
  people: WorkspaceSearchPerson[];
  sessions: WorkspaceSearchSession[];
  total: number;
};

const EMPTY: WorkspaceSearchResults = { people: [], sessions: [], total: 0 };

/** Case-insensitive, NFKC-normalized substring match. */
export function workspaceSearchMatches(haystack: string, query: string): boolean {
  const normalizedQuery = query.normalize("NFKC").trim().toLocaleLowerCase();
  if (!normalizedQuery) return false;
  return haystack
    .normalize("NFKC")
    .toLocaleLowerCase()
    .includes(normalizedQuery);
}

export function searchWorkspaceResults(input: {
  people: readonly WorkspaceSearchPerson[];
  sessions: readonly WorkspaceSearchSession[];
  query: string;
  limit?: number;
}): WorkspaceSearchResults {
  const query = input.query.normalize("NFKC").trim();
  if (!query) return EMPTY;
  const limit = input.limit ?? 8;
  const people = input.people
    .filter(
      (person) =>
        workspaceSearchMatches(person.label, query) ||
        workspaceSearchMatches(person.detail, query),
    )
    .slice(0, limit);
  const sessions = input.sessions
    .filter(
      (session) =>
        workspaceSearchMatches(session.title, query) ||
        workspaceSearchMatches(session.detail, query),
    )
    .slice(0, limit);
  return { people, sessions, total: people.length + sessions.length };
}

/** Keyboard shortcut for the global search dialog: ⌘K / Ctrl+K. */
export function isWorkspaceSearchShortcut(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}): boolean {
  if (event.altKey) return false;
  if (event.key.toLocaleLowerCase() !== "k") return false;
  return event.metaKey || event.ctrlKey;
}
