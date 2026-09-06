import {
  AppleLogo,
  ArrowLeft,
  ArrowRight,
} from "@phosphor-icons/react/dist/ssr";
import { OAuthSubmit } from "@/components/oauth-submit";
import { LoginPortraits } from "@/components/login-portraits";
import styles from "./login.module.css";
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
    "暂时无法完成登录，请重试或使用邮箱继续。",
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
  if (session?.user && !sessionExpired && !parameters.error) {
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
    <main id="main-content" className={`auth-page ${styles.page}`} tabIndex={-1}>
      <section className="auth-story" aria-label="Talent Signal 产品背景">
        <div className="auth-story__header">
          <BrandMark />
          <Link href="/">
            <ArrowLeft aria-hidden="true" size={16} />
            返回产品页
          </Link>
        </div>
        <div className={styles.visual}>
          <LoginPortraits />
          <div className={styles.story}>
            <p>每一段关系，都是新的可能。</p>
            <h1>留住线索。<br />让连接自然发生。</h1>
            <span>记得来时的对话，也看见下一步。</span>
          </div>
        </div>
        <p className={styles.footnote}>为认真经营关系的人而造</p>
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
              让每一次重要的对话，都有一个安放的地方。
            </span>
          </header>

          {sessionExpired ? (
            <p className="auth-error" role="alert">
              登录已过期，请重新登录以回到刚才的页面。
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
                      <OAuthSubmit>
                        <Image src="/images/google-sign-in.png" width={20} height={20} alt="" />
                        <span>使用 Google 继续</span>
                      </OAuthSubmit>
                    </form>
                  ) : null}
                  {availability.apple ? (
                    <form action={signInWithApple}>
                      <input
                        type="hidden"
                        name="redirectTo"
                        value={callbackUrl}
                      />
                      <OAuthSubmit className="auth-provider auth-provider--apple">
                        <AppleLogo
                          aria-hidden="true"
                          size={20}
                          weight="fill"
                        />
                        <span>使用 Apple 继续</span>
                      </OAuthSubmit>
                    </form>
                  ) : null}
                </div>
              ) : null}

              {hasOAuth && (availability.password || availability.email) ? (
                <div className="auth-divider">
                  <span>或使用邮箱</span>
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
