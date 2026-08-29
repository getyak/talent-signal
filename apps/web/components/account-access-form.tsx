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
  const label = mode === "register" ? "创建工作台" : "进入工作台";
  return (
    <button className="button auth-submit" type="submit" disabled={pending}>
      {pending ? "正在保护账号" : label}
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
    <section className="account-access" aria-label="工作台账号访问">
      {registrationEnabled ? (
        <div className="auth-mode-switch" role="tablist" aria-label="账号模式">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "sign-in"}
            onClick={() => setMode("sign-in")}
          >
            登录
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            onClick={() => setMode("register")}
          >
            创建账号
          </button>
        </div>
      ) : null}

      {mode === "sign-in" ? (
        <form className="email-sign-in" action={signInAction}>
          <input type="hidden" name="redirectTo" value={callbackUrl} />
          <div className="auth-field">
            <label htmlFor="account-identifier">用户名或邮箱</label>
            <input
              id="account-identifier"
              name="identifier"
              type="text"
              autoComplete="username"
              placeholder="输入用户名或邮箱"
              required
            />
          </div>
          <div className="auth-field">
            <label htmlFor="account-password">密码</label>
            <input
              id="account-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="输入密码"
              minLength={1}
              maxLength={128}
              required
            />
          </div>
          <FormError message={signInState.error} />
          <SubmitButton mode="sign-in" />
          <p className="auth-account-note">
            本地管理员：<strong>cubxxw</strong>。身份验证只会打开账号范围；关系变更仍需审阅。
          </p>
        </form>
      ) : (
        <form className="email-sign-in" action={registrationAction}>
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
                maxLength={100}
                required
              />
            </div>
            <div className="auth-field">
              <label htmlFor="registration-username">用户名</label>
              <input
                id="registration-username"
                name="username"
                type="text"
                autoComplete="username"
                placeholder="字母、数字、. _ -"
                minLength={3}
                maxLength={40}
                pattern="[a-zA-Z0-9][a-zA-Z0-9._-]*"
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
              maxLength={320}
              required
            />
          </div>
          <div className="auth-fields-grid">
            <div className="auth-field">
              <label htmlFor="registration-password">密码</label>
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
              <label htmlFor="registration-confirm-password">确认密码</label>
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
            只有表单成功提交后才会创建新的私密工作台；注册过程中不会添加任何候选人证据。
          </p>
        </form>
      )}
    </section>
  );
}
