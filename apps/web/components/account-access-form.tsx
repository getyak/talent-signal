"use client";

import { ArrowRight } from "@phosphor-icons/react";
import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  registerPasswordAccount,
  signInWithPasswordAccount,
  type SignInState,
} from "@/app/login/actions";
import { PasswordField } from "@/app/login/password-field";
import styles from "@/app/login/login.module.css";

const initialState: SignInState = { error: "" };

function SubmitButton({ mode }: { mode: "register" | "sign-in" }) {
  const { pending } = useFormStatus();
  const label = mode === "register" ? "创建工作台" : "进入工作台";
  const pendingLabel =
    mode === "register" ? "正在创建账号…" : "正在登录…";
  return (
    <button
      className="button auth-submit"
      type="submit"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? pendingLabel : label}
      <ArrowRight aria-hidden="true" size={17} />
    </button>
  );
}

function FormError({
  describedBy,
  state,
}: {
  describedBy?: string;
  state: SignInState;
}) {
  const { pending } = useFormStatus();
  if (!state.error) return null;
  return (
    <div className="auth-error" role="alert" id={describedBy}>
      <p>{state.error}</p>
      {state.retryable ? (
        <button
          type="submit"
          className={styles.retry}
          disabled={pending}
          aria-busy={pending}
        >
          重试
        </button>
      ) : null}
    </div>
  );
}

export function AccountAccessForm({
  callbackUrl,
  registrationEnabled,
}: {
  callbackUrl: string;
  registrationEnabled: boolean;
}) {
  const [mode, setMode] = useState<"register" | "sign-in">("sign-in");
  const [identifier, setIdentifier] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [registrationPassword, setRegistrationPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signInState, signInAction, signInPending] = useActionState(
    signInWithPasswordAccount,
    initialState,
  );
  const [registrationState, registrationAction, registrationPending] =
    useActionState(registerPasswordAccount, initialState);
  const errorId = useId();
  const pending = signInPending || registrationPending;
  const activeState = mode === "sign-in" ? signInState : registrationState;
  const describedBy = activeState.error ? errorId : undefined;

  function switchMode(next: "register" | "sign-in") {
    if (pending || next === mode) return;
    if (next === "sign-in" && registrationState.values?.email) {
      setIdentifier(registrationState.values.email);
    }
    setMode(next);
    setSignInPassword("");
    setRegistrationPassword("");
    setConfirmPassword("");
  }

  return (
    <section className="account-access" aria-label="工作台账号访问">
      {registrationEnabled ? (
        <div className="auth-mode-switch" role="tablist" aria-label="账号模式">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "sign-in"}
            disabled={pending}
            onClick={() => switchMode("sign-in")}
          >
            登录
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            disabled={pending}
            onClick={() => switchMode("register")}
          >
            创建账号
          </button>
        </div>
      ) : null}

      {mode === "sign-in" ? (
        <form
          className="email-sign-in"
          action={signInAction}
          onSubmit={(event) => {
            if (signInPending) event.preventDefault();
          }}
        >
          <input type="hidden" name="redirectTo" value={callbackUrl} />
          <div className="auth-field">
            <label htmlFor="account-identifier">邮箱</label>
            <input
              id="account-identifier"
              name="identifier"
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              disabled={signInPending}
              aria-invalid={signInState.error ? true : undefined}
              aria-describedby={describedBy}
              required
            />
          </div>
          <PasswordField
            id="account-password"
            name="password"
            label="密码"
            value={signInPassword}
            onChange={setSignInPassword}
            autoComplete="current-password"
            placeholder="输入密码"
            minLength={1}
            maxLength={128}
            required
            disabled={signInPending}
            invalid={Boolean(signInState.error)}
            describedBy={describedBy}
          />
          <FormError state={signInState} describedBy={errorId} />
          <SubmitButton mode="sign-in" />
        </form>
      ) : (
        <form
          className="email-sign-in"
          action={registrationAction}
          onSubmit={(event) => {
            if (registrationPending) event.preventDefault();
          }}
        >
          <input type="hidden" name="redirectTo" value={callbackUrl} />
          <div className="auth-fields-grid">
            <div className="auth-field">
              <label htmlFor="registration-name">显示名称</label>
              <input
                id="registration-name"
                name="displayName"
                type="text"
                autoComplete="name"
                placeholder="你希望显示的名称"
                defaultValue={registrationState.values?.displayName ?? ""}
                maxLength={100}
                disabled={registrationPending}
                aria-invalid={registrationState.error ? true : undefined}
                aria-describedby={describedBy}
                required
              />
            </div>

          </div>
          <div className="auth-field">
            <label htmlFor="registration-email">邮箱</label>
            <input
              id="registration-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@searchfirm.com"
              defaultValue={registrationState.values?.email ?? ""}
              maxLength={320}
              disabled={registrationPending}
              aria-invalid={registrationState.error ? true : undefined}
              aria-describedby={describedBy}
              required
            />
          </div>
          <div className="auth-fields-grid">
            <PasswordField
              id="registration-password"
              name="password"
              label="密码"
              value={registrationPassword}
              onChange={setRegistrationPassword}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              disabled={registrationPending}
              invalid={Boolean(registrationState.error)}
              describedBy={describedBy}
            />
            <PasswordField
              id="registration-confirm-password"
              name="confirmPassword"
              label="确认密码"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              disabled={registrationPending}
              invalid={Boolean(registrationState.error)}
              describedBy={describedBy}
            />
          </div>
          <FormError state={registrationState} describedBy={errorId} />
          {registrationState.code === "registration_result_unknown" ? (
            <button type="button" disabled={pending} onClick={() => switchMode("sign-in")}>尝试登录</button>
          ) : null}
          <SubmitButton mode="register" />
          <p className="auth-account-note">
            只有表单成功提交后才会创建新的私密工作台；注册过程中不会添加任何候选人证据。
          </p>
        </form>
      )}
    </section>
  );
}
