"use client";

import { ArrowRight } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  registerPasswordAccount,
  signInWithPasswordAccount,
  type SignInState,
} from "@/app/login/actions";

const initialState: SignInState = { error: "" };

function SubmitButton({ mode }: { mode: "register" | "sign-in" }) {
  const { pending } = useFormStatus();
  const label = mode === "register" ? "Create workspace" : "Enter workspace";
  return (
    <button className="button auth-submit" type="submit" disabled={pending}>
      {pending ? "Securing account" : label}
      <ArrowRight aria-hidden="true" size={17} />
    </button>
  );
}

function FormError({ message }: { message: string }) {
  return message ? (
    <p className="auth-error" role="alert">
      {message}
    </p>
  ) : null;
}

export function AccountAccessForm({
  callbackUrl,
  registrationEnabled,
}: {
  callbackUrl: string;
  registrationEnabled: boolean;
}) {
  const [mode, setMode] = useState<"register" | "sign-in">("sign-in");
  const [signInState, signInAction] = useActionState(
    signInWithPasswordAccount,
    initialState,
  );
  const [registrationState, registrationAction] = useActionState(
    registerPasswordAccount,
    initialState,
  );

  return (
    <section className="account-access" aria-label="Workspace account access">
      {registrationEnabled ? (
        <div className="auth-mode-switch" role="tablist" aria-label="Account mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "sign-in"}
            onClick={() => setMode("sign-in")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            onClick={() => setMode("register")}
          >
            Create account
          </button>
        </div>
      ) : null}

      {mode === "sign-in" ? (
        <form className="email-sign-in" action={signInAction}>
          <input type="hidden" name="redirectTo" value={callbackUrl} />
          <div className="auth-field">
            <label htmlFor="account-identifier">Username or email</label>
            <input
              id="account-identifier"
              name="identifier"
              type="text"
              autoComplete="username"
              placeholder="Your username or email"
              required
            />
          </div>
          <div className="auth-field">
            <label htmlFor="account-password">Password</label>
            <input
              id="account-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Your password"
              minLength={1}
              maxLength={128}
              required
            />
          </div>
          <FormError message={signInState.error} />
          <SubmitButton mode="sign-in" />
          <p className="auth-account-note">
            Local administrator: <strong>cubxxw</strong>. Authentication opens
            account scope; relationship changes still require review.
          </p>
        </form>
      ) : (
        <form className="email-sign-in" action={registrationAction}>
          <input type="hidden" name="redirectTo" value={callbackUrl} />
          <div className="auth-fields-grid">
            <div className="auth-field">
              <label htmlFor="registration-name">Display name</label>
              <input
                id="registration-name"
                name="displayName"
                type="text"
                autoComplete="name"
                placeholder="How you should appear"
                maxLength={100}
                required
              />
            </div>
            <div className="auth-field">
              <label htmlFor="registration-username">Username</label>
              <input
                id="registration-username"
                name="username"
                type="text"
                autoComplete="username"
                placeholder="letters, numbers, . _ -"
                minLength={3}
                maxLength={40}
                pattern="[a-zA-Z0-9][a-zA-Z0-9._-]*"
                required
              />
            </div>
          </div>
          <div className="auth-field">
            <label htmlFor="registration-email">Email</label>
            <input
              id="registration-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@searchfirm.com"
              maxLength={320}
              required
            />
          </div>
          <div className="auth-fields-grid">
            <div className="auth-field">
              <label htmlFor="registration-password">Password</label>
              <input
                id="registration-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />
            </div>
            <div className="auth-field">
              <label htmlFor="registration-confirm-password">Confirm</label>
              <input
                id="registration-confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />
            </div>
          </div>
          <FormError message={registrationState.error} />
          <SubmitButton mode="register" />
          <p className="auth-account-note">
            A new private workspace is created only after this form succeeds.
            No candidate evidence is added during registration.
          </p>
        </form>
      )}
    </section>
  );
}
