import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { authenticatedBackendClient, readPrimaryBackendSessionClaims } from "@/lib/server/backendAuth";
import { completeLoginMethodChange, startLoginMethodChange } from "@/lib/server/loginMethods";
import {
  LINK_COMPLETE_PATH,
  clearAuthRound,
  clearStagedAuth,
  flowIsLive,
  readAuthOperation,
  readAuthProof,
  readAuthRound,
  sealAuthOperation,
  sessionFingerprint,
  validateStagedProof,
} from "@/lib/server/stagedAuth";

export const dynamic = "force-dynamic";

const fail = async (): Promise<never> => {
  await clearStagedAuth();
  redirect("/workspace/settings?link=error");
};

/**
 * Fixed same-origin completion route for staged sign-in method changes
 * (ADR 0018, "Web reauthentication without a password").
 *
 * This is a Route Handler, so sealed state may be consumed and resealed here;
 * page rendering stays read-only. The ordinary session cookie is available on
 * this top-level same-site navigation, so the original session fingerprint and
 * frozen revisions are revalidated before any staged proof is used. Every
 * missing, stale, cancelled or wrong-purpose state fails closed to Settings,
 * and success always follows an authoritative backend settings readback.
 */
export async function GET(): Promise<never> {
  const operation = await readAuthOperation();
  const proof = await readAuthProof();
  const claims = await readPrimaryBackendSessionClaims();
  if (!operation || !claims) return fail();
  // The exact original session must still be the caller's session, and the
  // flow must still be inside its frozen absolute lifetime.
  if (
    sessionFingerprint(claims.backendAccessToken) !== operation.sessionFingerprint ||
    !flowIsLive(operation)
  ) {
    return fail();
  }

  const client = await authenticatedBackendClient();
  if (!client) return fail();
  let settings;
  try {
    settings = await client.accountSettings();
  } catch {
    return fail();
  }
  if (
    claims.backendAccountId !== operation.accountId ||
    claims.backendUserId !== operation.userId ||
    settings.workspace.revision !== operation.accountRevision ||
    settings.user.revision !== operation.userRevision
  ) {
    return fail();
  }

  // The just-completed explicit round is the only authority here. Each role's
  // proof is validated against its own sealed round and the frozen flow
  // lifetime; the other role's proof is preserved untouched.
  const activeRound = await readAuthRound();
  const currentProof = validateStagedProof({
    operation,
    round: activeRound,
    proof: await readAuthProof("current"),
    role: activeRound?.role ?? "current",
  })?.round.role === "target"
    ? validateStagedProof({
        operation,
        round: activeRound,
        proof: await readAuthProof("current"),
        role: "target",
      })
    : validateStagedProof({
        operation,
        round: activeRound,
        proof: await readAuthProof("current"),
        role: "current",
      });
  const reauthProof = currentProof
    ? {
        kind: "provider" as const,
        provider: currentProof.round.provider,
        challenge_id: currentProof.round.challengeId,
        identity_token: (await readAuthProof(
          currentProof.round.role === "duplicate" ? "duplicate" : "current",
        ))!.identityToken,
      }
    : null;
  try {
    if (operation.intent === "verify_identity" || operation.intent === "verify_duplicate_identity") {
      // Recovery rounds stage their proof into their own role slot and keep
      // it sealed for the recovery screen's prepare step.
      const recoverySlot = activeRound?.role === "duplicate" ? "duplicate" : "current";
      const recoveryValidation = validateStagedProof({
        operation,
        round: activeRound,
        proof: await readAuthProof(recoverySlot),
        role: activeRound?.role === "duplicate" ? "duplicate" : "current",
      });
      if (!recoveryValidation) return fail();
      // The proof stays sealed and one-use; the authenticated recovery flow
      // that requested this reauthentication consumes it next.
      redirect("/workspace/settings?link=verified");
    }

    if (operation.intent === "set_password" || operation.intent === "change_password") {
      if (operation.attempt || reauthProof) {
        const minted = operation.attempt
          ? null
          : await startLoginMethodChange({
              id: randomUUID(),
              intent: operation.intent,
              step_up: reauthProof!,
              expected_account_revision: operation.accountRevision,
              expected_user_revision: operation.userRevision,
            });
        const attempt = operation.attempt ?? {
          attempt_id: minted!.attempt_id,
          attempt_secret: minted!.attempt_secret,
          challenge_id: minted!.provider_challenge?.challenge_id ?? "",
          challenge_nonce: minted!.provider_challenge?.nonce ?? "",
        };
        await sealAuthOperation(
          { ...operation, attempt },
          operation.reauthProvider === "apple",
        );
        redirect("/workspace/settings/link-complete/password");
      }
      return fail();
    }

    if (operation.intent === "unlink_provider") {
      if (!operation.attempt && (!reauthProof || !operation.unlinkProvider)) return fail();
      const attempt = operation.attempt ??
        (await startLoginMethodChange({
          id: randomUUID(),
          intent: "unlink_provider",
          provider: operation.unlinkProvider!,
          step_up: reauthProof!,
          expected_account_revision: operation.accountRevision,
          expected_user_revision: operation.userRevision,
        }));
      await completeLoginMethodChange({
        attempt_id: attempt.attempt_id,
        attempt_secret: attempt.attempt_secret,
      });
      await clearStagedAuth();
      redirect(
        `/workspace/settings?link=done&method=${encodeURIComponent(operation.unlinkProvider ?? "")}&state=disconnected`,
      );
    }

    // link_provider: current-provider proof and new-provider proof are
    // distinct purposes and distinct round trips.
    if (operation.step === "awaiting-reauth") {
      if (!reauthProof || !operation.targetProvider) return fail();
      const attempt = await startLoginMethodChange({
        id: randomUUID(),
        intent: "link_provider",
        provider: operation.targetProvider,
        step_up: reauthProof,
        expected_account_revision: operation.accountRevision,
        expected_user_revision: operation.userRevision,
      });
      const challenge = attempt.provider_challenge;
      if (!challenge) return fail();
      // The completed current round is retired here: a delayed error from the
      // finished round can no longer route into this flow. The target round is
      // sealed only by the explicit continue action.
      await clearAuthRound();
      await sealAuthOperation(
        {
          ...operation,
          step: "awaiting-target",
          attempt: {
            attempt_id: attempt.attempt_id,
            attempt_secret: attempt.attempt_secret,
            challenge_id: challenge.challenge_id,
            challenge_nonce: challenge.nonce,
          },
        },
        operation.targetProvider === "apple",
      );
      redirect("/workspace/settings/link-complete/link");
    }

    const targetValidation = validateStagedProof({
      operation,
      round: activeRound,
      proof: await readAuthProof("current"),
      role: "target",
    });
    if (
      !operation.attempt ||
      !targetValidation ||
      targetValidation.round.purpose !== "target" ||
      targetValidation.round.provider !== operation.targetProvider
    ) {
      return fail();
    }
    const targetProof = {
      identityToken: (await readAuthProof("current"))!.identityToken,
    };
    await completeLoginMethodChange({
      attempt_id: operation.attempt.attempt_id,
      attempt_secret: operation.attempt.attempt_secret,
      identity_token: targetProof.identityToken,
    });
    await clearStagedAuth();
    redirect(
      `/workspace/settings?link=done&method=${encodeURIComponent(operation.targetProvider ?? "")}&state=connected`,
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    return fail();
  }
}

export const LINK_COMPLETE_ROUTE = LINK_COMPLETE_PATH;
