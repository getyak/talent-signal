import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { authSecret, type BackendSessionClaims } from "./backendAuth";
import { contactHandoffSessionVersion } from "./contact-handoff-session";

/**
 * Server-signed Memory entry capability.
 *
 * The actual authenticated Web entry mints this: Chat Session, People person,
 * or Pursuit exact role/evidence. It binds the current account/user/login
 * fingerprint, purpose and exact target. The BFF derives purpose and target
 * from it and rejects any browser claim that disagrees, so a business surface
 * can never widen itself into private Chat scope (or vice versa).
 *
 * The token stays in React memory or server props only; it is never written to
 * browser storage or a URL.
 */
export type MemoryEntryPurpose = "chat" | "people" | "relationship";

export type MemoryEntryPayload = {
  version: 1;
  accountId: string;
  userId: string;
  binding: string;
  purpose: MemoryEntryPurpose;
  stage?: "bootstrap" | "review";
  sessionId: string | null;
  personId: string | null;
  contextId: string | null;
  pursuitId: string | null;
  pursuitRoleId: string | null;
  pursuitEvidenceFragmentId: string | null;
  pursuitCaptureId?: string | null;
  pursuitCaptureVersion?: number | null;
  expiresAt: string;
};

const CAPABILITY_TTL_MS = 60 * 60 * 1000;

function sign(encoded: string): string {
  return createHmac("sha256", authSecret())
    .update(`memory-entry.v1:${encoded}`)
    .digest("base64url");
}

export function mintMemoryEntryCapability(
  claims: BackendSessionClaims,
  entry: {
    purpose: MemoryEntryPurpose;
  stage?: "bootstrap" | "review";
    sessionId?: string | null;
    personId?: string | null;
    contextId?: string | null;
    pursuitId?: string | null;
    pursuitRoleId?: string | null;
    pursuitEvidenceFragmentId?: string | null;
    pursuitCaptureId?: string | null;
    pursuitCaptureVersion?: number | null;
  },
): string {
  const payload: MemoryEntryPayload = {
    version: 1,
    accountId: claims.backendAccountId,
    userId: claims.backendUserId,
    binding: contactHandoffSessionVersion(claims),
    purpose: entry.purpose,
    stage: entry.stage ?? "review",
    sessionId: entry.sessionId ?? null,
    personId: entry.personId ?? null,
    contextId: entry.contextId ?? null,
    pursuitId: entry.pursuitId ?? null,
    pursuitRoleId: entry.pursuitRoleId ?? null,
    pursuitEvidenceFragmentId: entry.pursuitEvidenceFragmentId ?? null,
    pursuitCaptureId: entry.pursuitCaptureId ?? null,
    pursuitCaptureVersion: entry.pursuitCaptureVersion ?? null,
    expiresAt: new Date(Date.now() + CAPABILITY_TTL_MS).toISOString(),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyMemoryEntryCapability(
  token: string | null | undefined,
  claims: BackendSessionClaims,
): MemoryEntryPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  let payload: MemoryEntryPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as MemoryEntryPayload;
  } catch {
    return null;
  }
  if (payload.version !== 1) return null;
  if (payload.accountId !== claims.backendAccountId) return null;
  if (payload.userId !== claims.backendUserId) return null;
  if (payload.binding !== contactHandoffSessionVersion(claims)) return null;
  const expires = Date.parse(payload.expiresAt);
  if (!Number.isFinite(expires) || expires <= Date.now()) return null;
  return payload;
}
