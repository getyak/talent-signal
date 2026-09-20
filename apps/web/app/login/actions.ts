"use server";

import { TalentSignalClient } from "@talent-signal/contracts";
import { clearTestWorkspaceSession } from "@/lib/server/testWorkspaceSession";
import { readPrimaryBackendSessionClaims, backendAuthBaseUrl } from "@/lib/server/backendAuth";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { prepareGoogleSignIn, bindGoogleNonce } from "@/lib/server/google-session";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import {
  passwordRegistrationSchema,
  passwordSignInSchema,
  safeRedirectTarget,
} from "@/lib/auth-config";
import {
  authFailureCodeFromCredentialsCode,
  authFailureIsRetryable,
  authFailureMessage,
  type AuthFailureCode,
} from "@/lib/auth-feedback";
import { authenticatedBackendClient } from "@/lib/server/backendAuth";

export type SignInState = {
  error: string;
  code?: AuthFailureCode;
  retryable?: boolean;
  /** Non-secret values restored onto the form after a failed action. */
  values?: {
    displayName?: string;
    email?: string;
    identifier?: string;
  };
};

const BACKEND_LOGOUT_TIMEOUT_MS = 1_500;

function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function failedState(
  code: AuthFailureCode,
  mode: "register" | "sign-in",
  values?: SignInState["values"],
  message: string = authFailureMessage(code, mode),
): SignInState {
  return {
    error: message,
    code,
    retryable: authFailureIsRetryable(code),
    values,
  };
}

async function logoutBackendWithinDeadline(
  logout: () => Promise<unknown>,
) {
  let timeoutID: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      logout(),
      new Promise<never>((_, reject) => {
        timeoutID = setTimeout(
          () => reject(new Error("Backend logout timed out.")),
          BACKEND_LOGOUT_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutID) clearTimeout(timeoutID);
  }
}

export async function signInWithPasswordAccount(
  _previousState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const values = { identifier: formString(formData, "identifier") };
  const parsed = passwordSignInSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return failedState("invalid_input", "sign-in", values);
  }

  try {
    await signIn("password-account", {
      ...parsed.data,
      mode: "sign-in",
      redirectTo: safeRedirectTarget(formData.get("redirectTo")),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const code = authFailureCodeFromCredentialsCode(
        "code" in error ? String(error.code) : "",
        "sign-in",
      );
      return failedState(code, "sign-in", values);
    }
    throw error;
  }
  return { error: "" };
}

export async function registerPasswordAccount(
  _previousState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const values = {
    displayName: formString(formData, "displayName"),
    email: formString(formData, "email"),
  };
  if (formData.get("password") !== formData.get("confirmPassword")) {
    return failedState(
      "invalid_input",
      "register",
      values,
      "两次输入的密码不一致。",
    );
  }
  const parsed = passwordRegistrationSchema.safeParse({
    username: formData.get("username") || `u${randomUUID().replaceAll("-", "")}`,
    email: formData.get("email"),
    displayName: formData.get("displayName"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return failedState(
      "invalid_input",
      "register",
      values,
      "用户名需为 3–40 个字符，请填写有效邮箱，并设置至少 8 个字符的密码。",
    );
  }

  try {
    await signIn("password-account", {
      ...parsed.data,
      mode: "register",
      redirectTo: safeRedirectTarget(formData.get("redirectTo")),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const code = authFailureCodeFromCredentialsCode(
        "code" in error ? String(error.code) : "",
        "register",
      );
      return failedState(code, "register", values);
    }
    throw error;
  }
  return { error: "" };
}

export async function signInWithEmail(
  _previousState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const values = { email: formString(formData, "email") };
  const redirectTo = safeRedirectTarget(formData.get("redirectTo"));

  try {
    await signIn("email-password", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const code =
        error.type === "CredentialsSignin"
          ? authFailureCodeFromCredentialsCode(
              "code" in error ? String(error.code) : "",
              "sign-in",
            )
          : "service_unavailable";
      return failedState(code, "sign-in", values);
    }
    throw error;
  }

  return { error: "" };
}

export async function signInWithGoogle(formData: FormData) {
  let nonce: string;
  try { nonce = await prepareGoogleSignIn(); }
  catch { redirect("/login?error=Configuration"); }
  const url = await signIn("google", {
    redirect: false, redirectTo: safeRedirectTarget(formData.get("redirectTo")),
  });
  redirect(await bindGoogleNonce(url, nonce));
}

export async function signInWithApple(formData: FormData) {
  await signIn("apple", {
    redirectTo: safeRedirectTarget(formData.get("redirectTo")),
  });
}

export async function signInWithDefaultAccount(formData: FormData) {
  await signIn("default-account", {
    redirectTo: safeRedirectTarget(formData.get("redirectTo")),
  });
}

export async function signOutOfWorkspace() {
  try {
    const backend = await authenticatedBackendClient();
    if (backend) {
      await logoutBackendWithinDeadline(() => backend.logout());
    }
  } catch {
    // Local sign-out must still succeed if the backend session expired or the
    // account service is temporarily unreachable.
  }
  try {
    const primary = await readPrimaryBackendSessionClaims();
    if (primary) await logoutBackendWithinDeadline(() => new TalentSignalClient(backendAuthBaseUrl(), primary.backendAccessToken).logout());
  } catch { /* Local sign-out remains available during an outage. */ }
  await clearTestWorkspaceSession();
  await signOut({ redirectTo: "/" });
}
