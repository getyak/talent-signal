"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import {
  passwordRegistrationSchema,
  passwordSignInSchema,
  safeRedirectTarget,
} from "@/lib/auth-config";
import { authenticatedBackendClient } from "@/lib/server/backendAuth";

export type SignInState = {
  error: string;
};

function credentialsErrorMessage(error: AuthError, mode: "register" | "sign-in") {
  const code = "code" in error ? String(error.code) : "";
  if (code === "service_unavailable") {
    return "Account access is temporarily unavailable. Check the local backend and try again.";
  }
  if (mode === "register" && code === "account_exists") {
    return "An account already uses that username or email.";
  }
  return mode === "register"
    ? "The account could not be created. Review the details and try again."
    : "The username, email, or password is not recognized.";
}

export async function signInWithPasswordAccount(
  _previousState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = passwordSignInSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter your username or email and password." };
  }

  try {
    await signIn("password-account", {
      ...parsed.data,
      mode: "sign-in",
      redirectTo: safeRedirectTarget(formData.get("redirectTo")),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: credentialsErrorMessage(error, "sign-in") };
    }
    throw error;
  }
  return { error: "" };
}

export async function registerPasswordAccount(
  _previousState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  if (formData.get("password") !== formData.get("confirmPassword")) {
    return { error: "Passwords do not match." };
  }
  const parsed = passwordRegistrationSchema.safeParse({
    username: formData.get("username"),
    email: formData.get("email"),
    displayName: formData.get("displayName"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      error:
        "Use a 3–40 character username, a valid email, and a password of at least 8 characters.",
    };
  }

  try {
    await signIn("password-account", {
      ...parsed.data,
      mode: "register",
      redirectTo: safeRedirectTarget(formData.get("redirectTo")),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: credentialsErrorMessage(error, "register") };
    }
    throw error;
  }
  return { error: "" };
}

export async function signInWithEmail(
  _previousState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const redirectTo = safeRedirectTarget(formData.get("redirectTo"));

  try {
    await signIn("email-password", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error:
          error.type === "CredentialsSignin"
            ? "The email or password is not recognized."
            : "Sign in could not be completed. Please try again.",
      };
    }
    throw error;
  }

  return { error: "" };
}

export async function signInWithGoogle(formData: FormData) {
  await signIn("google", {
    redirectTo: safeRedirectTarget(formData.get("redirectTo")),
  });
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
      await backend.logout();
    }
  } catch {
    // Local sign-out must still succeed if the backend session expired or the
    // account service is temporarily unreachable.
  }
  await signOut({ redirectTo: "/" });
}
