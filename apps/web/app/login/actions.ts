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
    return "账号服务暂时不可用。请检查本地后端后重试。";
  }
  if (mode === "register" && code === "account_exists") {
    return "该用户名或邮箱已被其他账号使用。";
  }
  return mode === "register"
    ? "无法创建账号，请检查填写内容后重试。"
    : "无法识别该用户名、邮箱或密码。";
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
    return { error: "请输入用户名或邮箱以及密码。" };
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
    return { error: "两次输入的密码不一致。" };
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
        "用户名需为 3–40 个字符，请填写有效邮箱，并设置至少 8 个字符的密码。",
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
            ? "无法识别该邮箱或密码。"
            : "无法完成登录，请重试。",
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
