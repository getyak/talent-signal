"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { safeRedirectTarget } from "@/lib/auth-config";

export type SignInState = {
  error: string;
};

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
  await signOut({ redirectTo: "/" });
}
