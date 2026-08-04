"use client";

import { ArrowRight } from "@phosphor-icons/react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  signInWithEmail,
  type SignInState,
} from "@/app/login/actions";

const initialState: SignInState = { error: "" };

function SubmitButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="button auth-submit"
      type="submit"
      disabled={pending || !enabled}
    >
      {pending ? "Checking account" : "Continue with email"}
      <ArrowRight aria-hidden="true" size={17} />
    </button>
  );
}

export function EmailSignInForm({
  callbackUrl,
  enabled,
}: {
  callbackUrl: string;
  enabled: boolean;
}) {
  const [state, formAction] = useActionState(signInWithEmail, initialState);

  return (
    <form className="email-sign-in" action={formAction}>
      <input type="hidden" name="redirectTo" value={callbackUrl} />
      <div className="auth-field">
        <label htmlFor="sign-in-email">Email</label>
        <input
          id="sign-in-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@searchfirm.com"
          required
          disabled={!enabled}
        />
      </div>
      <div className="auth-field">
        <label htmlFor="sign-in-password">Password</label>
        <input
          id="sign-in-password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          minLength={8}
          maxLength={128}
          required
          disabled={!enabled}
        />
      </div>
      {state.error && (
        <p className="auth-error" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton enabled={enabled} />
      {!enabled && (
        <p className="auth-configuration-note">
          Email sign-in becomes available when a default account and password
          hash are configured.
        </p>
      )}
    </form>
  );
}
