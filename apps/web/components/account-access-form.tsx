"use client";

import { ArrowRight, Check } from "@phosphor-icons/react";
import { useActionState, useId, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { registerPasswordAccount, signInWithPasswordAccount, type SignInState } from "@/app/login/actions";
import { OAuthPendingContext } from "./oauth-submit";
import { PasswordField } from "@/app/login/password-field";
import styles from "@/app/login/login.module.css";

const initialState: SignInState = { error: "" };
type Mode = "register" | "sign-in";
function SubmitButton({ mode }: { mode: Mode }) {
  const { pending } = useFormStatus();
  return <button className={styles.submit} type="submit" disabled={pending} aria-busy={pending}>
    {pending ? (mode === "register" ? "正在创建…" : "正在登录…") : (mode === "register" ? "创建账号" : "登录")}
    <ArrowRight aria-hidden="true" size={18} />
  </button>;
}

export function AccountAccessForm({ callbackUrl, registrationEnabled, initialMode = "sign-in", notice, children }: {
  callbackUrl: string; registrationEnabled: boolean; initialMode?: Mode; notice?: string; children?: ReactNode;
}) {
  const [mode, setMode] = useState<Mode>(registrationEnabled ? initialMode : "sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [oauthPending, setOAuthPending] = useState(false);
  const [signInState, signInAction, signInPending] = useActionState(signInWithPasswordAccount, initialState);
  const [registrationState, registrationAction, registrationPending] = useActionState(registerPasswordAccount, initialState);
  const errorId = useId();
  const passwordHintId = useId();
  const pending = signInPending || registrationPending || oauthPending;
  const state = mode === "sign-in" ? signInState : registrationState;
  const register = mode === "register";
  const [showError, setShowError] = useState(true);
  const error = showError ? state.error : "";
  function switchMode() {
    if (pending) return;
    setMode(register ? "sign-in" : "register");
    setPassword("");
    setShowError(false);
  }
  return (
    <section aria-labelledby="sign-in-title">
      <header className={styles.heading}>
        <p className={styles.eyebrow}>你的关系工作台</p>
        <h1 id="sign-in-title">{register ? "从你开始。" : "继续，保持连接。"}</h1>
        <p>{register ? "先创建账号，其他的慢慢了解。" : "重要的人与对话，都在这里。"}</p>
      </header>
      {notice && <p className={styles.error} role="alert">{notice}</p>}
      <OAuthPendingContext.Provider value={setOAuthPending}><fieldset className={styles.providerBoundary} disabled={signInPending || registrationPending}>{children}</fieldset></OAuthPendingContext.Provider>
      {children && <div className={styles.divider}><span>或使用邮箱</span></div>}
      <form className={styles.form} action={register ? registrationAction : signInAction} onSubmit={event => {
        if (pending) { event.preventDefault(); return; }
        setShowError(true);
      }}>
        <input type="hidden" name="redirectTo" value={callbackUrl} />
        <fieldset disabled={pending} className={styles.fields}>
          <div className="auth-field">
            <label htmlFor="account-email">{register ? "邮箱" : "邮箱或用户名"}</label>
            <input id="account-email" name={register ? "email" : "identifier"} type={register ? "email" : "text"} autoComplete="username"
              inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com"
              value={email} onChange={event => setEmail(event.target.value)} maxLength={320} required
              aria-describedby={error ? errorId : undefined} />
          </div>
          <div>
            <PasswordField key={mode} id="account-password" name="password" label={register ? "设置密码" : "密码"}
              value={password} onChange={setPassword} autoComplete={register ? "new-password" : "current-password"}
              placeholder={register ? "至少 8 个字符" : "输入密码"} minLength={register ? 8 : 1} maxLength={128}
              required disabled={pending} describedBy={register ? passwordHintId : undefined} />
            {register && <p id={passwordHintId} className={styles.passwordHint} data-ready={password.length >= 8}>
              {password.length >= 8 ? <Check size={14} aria-hidden="true" /> : <span className={styles.hintDot} aria-hidden="true" />}
              {password.length >= 8 ? "长度符合要求" : "至少 8 个字符，支持长密码与粘贴"}
            </p>}
          </div>
          {error && <div className={styles.error} role="alert" id={errorId}>
            <p>{error}</p>
            {state.code === "registration_result_unknown" || state.code === "account_exists" ?
              <button type="button" className={styles.textButton} onClick={switchMode}>尝试登录 <ArrowRight size={14} aria-hidden="true" /></button> : null}
          </div>}
          <SubmitButton mode={mode} />
        </fieldset>
      </form>
      {registrationEnabled && <p className={styles.switchMode}>{register ? "已有账号？" : "第一次来？"}
        <button type="button" onClick={switchMode} disabled={pending}>{register ? "登录" : "创建账号"}</button>
      </p>}
    </section>
  );
}
