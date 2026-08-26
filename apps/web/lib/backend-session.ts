import { TalentSignalHttpError } from "@talent-signal/contracts";

export class BackendSessionExpiredError extends TalentSignalHttpError {
  constructor() {
    super(
      401,
      "backend_session_expired",
      "Your secure workspace session expired. Sign in again to continue.",
      null,
    );
    this.name = "BackendSessionExpiredError";
  }
}

export function isBackendSessionExpiredError(
  error: unknown,
): error is BackendSessionExpiredError {
  return (
    error instanceof BackendSessionExpiredError ||
    (error instanceof TalentSignalHttpError &&
      error.code === "backend_session_expired") ||
    (error !== null &&
      error !== undefined &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "BackendSessionExpiredError")
  );
}

export function backendSessionRecoveryHref(callbackUrl: string): string {
  const parameters = new URLSearchParams({
    callbackUrl,
    reason: "backend_session_expired",
  });
  return `/login?${parameters.toString()}`;
}

export function backendSessionIsExpired(
  expiresAt: string,
  now = Date.now(),
) {
  const expiration = Date.parse(expiresAt);
  return !Number.isFinite(expiration) || expiration <= now;
}
