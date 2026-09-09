import "server-only";
import { createHmac } from "node:crypto";
import { authSecret, type BackendSessionClaims } from "./backendAuth";

/** Opaque, non-authoritative binding to the exact credential reviewed in Web. */
export function contactHandoffSessionVersion(claims: BackendSessionClaims): string {
  return createHmac("sha256", authSecret()).update(JSON.stringify([
    "contact-image-handoff.v1", claims.backendAccountId, claims.backendUserId,
    claims.backendAccessToken, claims.backendExpiresAt,
  ])).digest("hex");
}
