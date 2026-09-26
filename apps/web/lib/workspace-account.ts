/**
 * Presentation-only derivation for the account footer.
 *
 * The footer uses the real account/workspace names. Avatar presentation and
 * explicit local display preferences live in the shared avatar component. Nothing here grants
 * or reads authority; it only formats identity that the server already
 * resolved for the rendered scope.
 */

export type AccountIdentity = {
  /** Sign-in name or email local part. */
  accountName: string;
  /** Resolved backend account/workspace name, when the session provides one. */
  workspaceName: string | null;
  /** Real avatar URL only when the backend actually returns one. */
  avatarUrl: string | null;
};

function firstToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const local = trimmed.includes("@") ? trimmed.split("@")[0] : trimmed;
  return local.trim();
}

/** One or two stable initials; never a decorative glyph. */
export function accountInitials(value: string | null | undefined): string {
  const source = firstToken(value ?? "");
  if (!source) return "TS";
  const parts = source.split(/[\s._-]+/u).filter(Boolean);
  const letters = parts
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? "")
    .join("");
  return letters.toLocaleUpperCase() || "TS";
}

/** Display name shown under the avatar; the workspace stays secondary. */
export function accountDisplayName(identity: AccountIdentity): string {
  return firstToken(identity.accountName) || "招聘顾问";
}

export function accountWorkspaceLabel(identity: AccountIdentity): string {
  return identity.workspaceName?.trim() || "个人工作区";
}

/** Screen-reader label for the account trigger, never color-only. */
export function accountMenuLabel(identity: AccountIdentity): string {
  return `${accountDisplayName(identity)} · ${accountWorkspaceLabel(identity)}`;
}
