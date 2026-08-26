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
  title: "Sign in",
  description:
    "Sign in to the Talent Signal candidate knowledge workspace.",
  robots: {
    follow: false,
    index: false,
  },
};

const oauthErrors: Record<string, string> = {
  AccessDenied: "Access was not granted for this account.",
  Configuration:
    "This sign-in provider is not fully configured. Check its credentials and callback URL.",
  OAuthCallbackError:
    "The sign-in provider could not complete the callback. Please try again.",
  OAuthSignin: "The sign-in provider could not be reached. Please try again.",
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
      "Sign in could not be completed. Please try another method.")
    : "";
  const hasOAuth = availability.google || availability.apple;
  const hasConfiguredSignIn =
    hasOAuth ||
    availability.password ||
    availability.email ||
    availability.defaultAccount;

  return (
    <main id="main-content" className="auth-page">
      <section className="auth-story" aria-label="Talent Signal product context">
        <Image
          src="/images/recruiter-notes.webp"
          alt="A recruiter reviewing candidate notes with a red pencil."
          fill
          priority
          sizes="(max-width: 767px) 100vw, 52vw"
        />
        <div className="auth-story__veil" />
        <div className="auth-story__header">
          <BrandMark />
          <Link href="/">
            <ArrowLeft aria-hidden="true" size={16} />
            Back to product
          </Link>
        </div>
        <div className="auth-story__copy">
          <p>Candidate knowledge, with its sources intact.</p>
          <h1>Return to the relationship, not the record.</h1>
          <div>
            <ShieldCheck aria-hidden="true" size={18} />
            Every meaningful change remains reviewable.
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
            <p>Talent Signal workspace</p>
            <h2 id="sign-in-title">Welcome back.</h2>
            <span>
              Sign in to review candidate context, source evidence, and the
              next move.
            </span>
          </header>

          {sessionExpired ? (
            <p className="auth-error" role="alert">
              Your secure workspace session expired. Sign in again to return
              to the same page; no cached relationship state was substituted.
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
                        <span>Continue with Google</span>
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
                        <span>Continue with Apple</span>
                      </button>
                    </form>
                  ) : null}
                </div>
              ) : null}

              {hasOAuth && (availability.password || availability.email) ? (
                <div className="auth-divider">
                  <span>or use your account</span>
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
              <p>Private workspace access</p>
              <h3 id="access-title">This workspace is not open yet.</h3>
              <span>
                Request a guided account, or inspect the browser-only evidence
                review without sharing a conversation.
              </span>
              <div>
                <a className="button" href={accessRequestHref}>
                  Request access
                  <ArrowRight aria-hidden="true" size={17} />
                </a>
                <Link className="auth-demo-link" href="/demo">
                  Try the live demo
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
              <button type="submit">Use default account</button>
            </form>
          )}

          <p className="auth-terms">
            By continuing, you confirm that you are authorized to access the
            candidate information in this workspace.
          </p>
        </div>
      </section>
    </main>
  );
}
