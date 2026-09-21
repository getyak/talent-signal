"use server";

import { TalentSignalClient, TalentSignalHttpError, type AccountOnboarding, type AccountOnboardingMutation, type AccountOnboardingPreview } from "@talent-signal/contracts";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { backendAuthBaseUrl, readBackendSessionClaims } from "@/lib/server/backendAuth";
import { backendSessionIsExpired } from "@/lib/backend-session";
import { withAuthRequestTimeout } from "@/lib/auth-request-timeout";
import { workspaceSessionsBinding } from "@/lib/server/workspaceSessions";
import { normalizeOnboardingProfileUrl, ONBOARDING_PROFILE_URL_ERROR } from "@/lib/onboarding-profile-url";

export type OnboardingScope = { accountId: string; userId: string; binding: string };
export type OnboardingResult = { data?: AccountOnboarding; error?: string; recovery?: "retry" | "refresh" | "login" };
export type OnboardingPreviewResult = { preview?: AccountOnboardingPreview; error?: string };
const inputSchema = z.object({
  id: z.uuid(), expected_revision: z.number().int().positive(), display_name: z.string().trim().min(1).max(100),
  focus: z.string().trim().max(280), profile_url: z.string().trim().max(2000), status: z.enum(["completed", "skipped"]),
}).strict();

async function boundClient(scope: OnboardingScope) {
  const claims = await readBackendSessionClaims();
  if (!claims || backendSessionIsExpired(claims.backendExpiresAt) || claims.backendAccountId !== scope.accountId ||
      claims.backendUserId !== scope.userId || workspaceSessionsBinding(claims) !== scope.binding) {
    throw new TalentSignalHttpError(401, "ONBOARDING_SESSION_CHANGED", "Session changed", null);
  }
  return new TalentSignalClient(backendAuthBaseUrl(), claims.backendAccessToken);
}

export async function saveOnboarding(scope: OnboardingScope, input: AccountOnboardingMutation): Promise<OnboardingResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { error: "请填写称呼，并检查链接和介绍的长度。" };
  const profileUrl = normalizeOnboardingProfileUrl(parsed.data.profile_url);
  if (profileUrl === null) return { error: ONBOARDING_PROFILE_URL_ERROR };
  const mutation = { ...parsed.data, profile_url: profileUrl };
  try {
    const client = await boundClient(scope);
    const data = await withAuthRequestTimeout(signal => client.updateAccountOnboarding(mutation, signal), { timeoutMs: 5_000 });
    if (data.account_id !== scope.accountId || data.user_id !== scope.userId) {
      return { error: "登录身份发生变化，请重新登录后核对资料。", recovery: "login" };
    }
    if (data.revision !== parsed.data.expected_revision + 1 || data.display_name !== parsed.data.display_name ||
        data.focus !== parsed.data.focus || data.profile_url !== mutation.profile_url || data.status !== parsed.data.status) {
      return { error: "资料已发生变化，请载入最新内容核对。", recovery: "refresh" };
    }
    revalidatePath("/workspace", "layout");
    return { data };
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      if (error.status === 401) return { error: "登录已变化或过期，请重新登录后继续。", recovery: "login" };
      if (error.status === 403) return { error: "请返回自己的工作空间后修改个人资料。", recovery: "refresh" };
      if (error.status === 409) return { error: "资料已经发生变化，请载入最新内容后再保存。", recovery: "refresh" };
      if (error.status === 400 || error.status === 422) return { error: "请检查内容。链接需要是公开的 HTTPS 地址，介绍最多 280 个字符。" };
      if (error.status === 429) return { error: "操作有些频繁，请稍后再试。" };
    }
    return { error: "暂时无法确认是否保存成功。你的填写还在，可以重试这次保存。", recovery: "retry" };
  }
}

export async function previewOnboarding(scope: OnboardingScope, url: string): Promise<OnboardingPreviewResult> {
  if (typeof url !== "string" || !url.trim() || url.length > 2000) return { error: "请先填写一个公开的主页链接。" };
  const profileUrl = normalizeOnboardingProfileUrl(url);
  if (!profileUrl) return { error: ONBOARDING_PROFILE_URL_ERROR };
  try {
    const client = await boundClient(scope);
    return { preview: await withAuthRequestTimeout(signal => client.previewAccountOnboarding({ url: profileUrl }, signal), { timeoutMs: 15_000 }) };
  } catch (error) {
    if (error instanceof TalentSignalHttpError && error.status === 401) return { error: "登录已变化或过期，请重新登录。" };
    if (error instanceof TalentSignalHttpError && error.status === 429) return { error: "读取有些频繁，请稍后再试，或直接填写下方介绍。" };
    return { error: "暂时读不到这个页面。有些主页需要登录；你可以保留链接，直接填写下方介绍。" };
  }
}
