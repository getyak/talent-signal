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
      {pending ? "正在检查账号" : "使用邮箱继续"}
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
        <label htmlFor="sign-in-email">邮箱</label>
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
        <label htmlFor="sign-in-password">密码</label>
        <input
          id="sign-in-password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="输入密码"
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
          配置默认账号和密码哈希后，即可使用邮箱登录。
        </p>
      )}
    </form>
  );
}
