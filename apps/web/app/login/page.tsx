import {
  AppleLogo,
  ArrowLeft,
  ArrowRight,
  GoogleLogo,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AccountAccessForm } from "@/components/account-access-form";
import { BrandMark } from "@/components/brand-mark";
import { EmailSignInForm } from "@/components/email-sign-in-form";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  getAuthAvailability,
  safeRedirectTarget,
} from "@/lib/auth-config";
import { accessRequestHref } from "@/lib/site";
import { getGoogleOAuthCredentials } from "@/lib/server/google-oauth";
import {
  signInWithApple,
  signInWithDefaultAccount,
  signInWithGoogle,
} from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "登录",
  description:
    "登录 Talent Signal 候选人知识工作台。",
  robots: {
    follow: false,
    index: false,
  },
};

const oauthErrors: Record<string, string> = {
  AccessDenied: "该账号未获访问权限。",
  Configuration:
    "登录服务尚未完整配置，请检查凭据与回调地址。",
  OAuthCallbackError:
    "登录服务无法完成回调，请重试。",
  OAuthSignin: "暂时无法连接登录服务，请重试。",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string;
    error?: string;
    reason?: string;
  }>;
}) {
  const session = await auth();
  const parameters = await searchParams;
  const callbackUrl = safeRedirectTarget(parameters.callbackUrl);
  const sessionExpired = parameters.reason === "backend_session_expired";
  if (session?.user && !sessionExpired) {
    redirect(callbackUrl);
  }

  const availability = getAuthAvailability(process.env, {
    google: Boolean(getGoogleOAuthCredentials()),
  });
  const oauthError = parameters.error
    ? (oauthErrors[parameters.error] ??
      "无法完成登录，请尝试其他方式。")
    : "";
  const hasOAuth = availability.google || availability.apple;
  const hasConfiguredSignIn =
    hasOAuth ||
    availability.password ||
    availability.email ||
    availability.defaultAccount;

  return (
    <main id="main-content" className="auth-page">
      <section className="auth-story" aria-label="Talent Signal 产品背景">
        <Image
          src="/images/recruiter-notes.webp"
          alt="一位招聘顾问正在用红色铅笔审阅候选人笔记。"
          fill
          priority
          sizes="(max-width: 767px) 100vw, 52vw"
        />
        <div className="auth-story__veil" />
        <div className="auth-story__header">
          <BrandMark />
          <Link href="/">
            <ArrowLeft aria-hidden="true" size={16} />
            返回产品页
          </Link>
        </div>
        <div className="auth-story__copy">
          <p>候选人知识，始终保留完整来源。</p>
          <h1>回到关系，而不只是回到记录。</h1>
          <div>
            <ShieldCheck aria-hidden="true" size={18} />
            每一项重要变化都保持可审阅。
          </div>
        </div>
      </section>

      <section className="auth-panel" aria-labelledby="sign-in-title">
        <div className="auth-panel__top">
          <BrandMark />
          <ThemeToggle />
        </div>
        <div className="auth-panel__content">
          <header>
            <p>Talent Signal 工作台</p>
            <h2 id="sign-in-title">欢迎回来。</h2>
            <span>
              登录后审阅候选人背景、来源证据与下一步。
            </span>
          </header>

          {sessionExpired ? (
            <p className="auth-error" role="alert">
              安全工作台会话已过期。请重新登录以返回同一页面；系统没有用缓存的关系状态替代当前内容。
            </p>
          ) : null}

          {oauthError && (
            <p className="auth-error" role="alert">
              {oauthError}
            </p>
          )}

          {hasConfiguredSignIn ? (
            <>
              {hasOAuth ? (
                <div className="oauth-methods">
                  {availability.google ? (
                    <form action={signInWithGoogle}>
                      <input
                        type="hidden"
                        name="redirectTo"
                        value={callbackUrl}
                      />
                      <button className="auth-provider" type="submit">
                        <GoogleLogo
                          aria-hidden="true"
                          size={19}
                          weight="bold"
                        />
                        <span>使用 Google 继续</span>
                      </button>
                    </form>
                  ) : null}
                  {availability.apple ? (
                    <form action={signInWithApple}>
                      <input
                        type="hidden"
                        name="redirectTo"
                        value={callbackUrl}
                      />
                      <button
                        className="auth-provider auth-provider--apple"
                        type="submit"
                      >
                        <AppleLogo
                          aria-hidden="true"
                          size={20}
                          weight="fill"
                        />
                        <span>使用 Apple 继续</span>
                      </button>
                    </form>
                  ) : null}
                </div>
              ) : null}

              {hasOAuth && (availability.password || availability.email) ? (
                <div className="auth-divider">
                  <span>或使用工作台账号</span>
                </div>
              ) : null}

              {availability.password ? (
                <AccountAccessForm
                  callbackUrl={callbackUrl}
                  registrationEnabled={availability.registration}
                />
              ) : availability.email ? (
                <EmailSignInForm callbackUrl={callbackUrl} enabled />
              ) : null}
            </>
          ) : (
            <section className="auth-access-state" aria-labelledby="access-title">
              <p>私密工作台访问</p>
              <h3 id="access-title">该工作台尚未开放。</h3>
              <span>
                申请引导式账号，或体验仅在浏览器中运行的证据审阅，无需分享对话。
              </span>
              <div>
                <a className="button" href={accessRequestHref}>
                  申请使用
                  <ArrowRight aria-hidden="true" size={17} />
                </a>
                <Link className="auth-demo-link" href="/demo">
                  体验在线演示
                </Link>
              </div>
            </section>
          )}

          {availability.defaultAccount && (
            <form
              className="default-account"
              action={signInWithDefaultAccount}
            >
              <input type="hidden" name="redirectTo" value={callbackUrl} />
              <div>
                <span>
                  {availability.defaultAccountName
                    .split(/\s+/)
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)}
                </span>
                <p>
                  <strong>{availability.defaultAccountName}</strong>
                  <small>{availability.defaultAccountEmail}</small>
                </p>
              </div>
              <button type="submit">使用默认账号</button>
            </form>
          )}

          <p className="auth-terms">
            继续即表示你确认自己有权访问此工作台中的候选人信息。
          </p>
        </div>
      </section>
    </main>
  );
}
