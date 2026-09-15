import { useCallback, useEffect, useMemo, useState } from "react";

import { NativeCapabilityWorkbench } from "@talent-signal/workspace-ui";

import {
  createDesktopPlatformAdapter,
  desktopSession,
  isQuickPanelShortcut,
  type ActivateBindingRequest,
  type BindingStatus,
} from "./platform";

const platform = createDesktopPlatformAdapter();

const EMPTY_BINDING: ActivateBindingRequest = {
  accessToken: "",
  baseUrl: "http://127.0.0.1:4336",
  sessionId: "",
};

export function App() {
  const [binding, setBinding] = useState<BindingStatus>({ state: "unbound", reason: null });
  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState(EMPTY_BINDING);
  const [formError, setFormError] = useState<string | null>(null);
  const [shortcutNotice, setShortcutNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      setBinding(await desktopSession.status());
    } catch {
      setBinding({ state: "stale", reason: "本机桥接没有返回可核验状态。" });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [refresh]);

  const bindingScope =
    binding.state === "verified"
      ? `${binding.accountId}:${binding.sessionId}`
      : binding.state;
  const intentId = useMemo(() => crypto.randomUUID(), [bindingScope]);

  useEffect(() => {
    if (binding.state !== "verified") return;
    const activeBinding = binding;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isQuickPanelShortcut(event)) return;
      event.preventDefault();
      setShortcutNotice("正在核验并打开快捷面板…");
      void platform
        .openQuickPanel({
          accountId: activeBinding.accountId,
          sessionId: activeBinding.sessionId,
          activityId: intentId,
          label: "当前 Session 的本机能力",
        })
        .then((result) => {
          setShortcutNotice(
            result.status === "opened"
              ? "快捷面板已打开。"
              : "reason" in result
                ? result.reason
                : "快捷面板当前不可用。",
          );
        })
        .catch(() => setShortcutNotice("快捷面板未能打开；没有执行其他操作。"));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [binding, intentId]);

  async function activate() {
    setFormError(null);
    setChecking(true);
    try {
      const next = await desktopSession.activate(form);
      setBinding(next);
      setForm((current) => ({ ...current, accessToken: "" }));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
      setForm((current) => ({ ...current, accessToken: "" }));
    } finally {
      setChecking(false);
    }
  }

  async function disconnect() {
    setChecking(true);
    try {
      setBinding(await desktopSession.disconnect());
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span aria-hidden="true" className="brand-mark">TS</span>
          <div>
            <strong>Talent Signal</strong>
            <span>Relationship workspace</span>
          </div>
        </div>
        <nav aria-label="工作区">
          <a aria-current="page" href="#workspace">当前 Session</a>
          <a href="#native">原生能力</a>
          <a href="#boundary">权限边界</a>
        </nav>
        <div className="sidebar-foot">
          <span className="privacy-dot" />
          本地打包资源 · 无远程 Web
        </div>
      </aside>

      <main id="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">macOS Hybrid · feasibility</p>
            <h1>继续真实 Session</h1>
          </div>
          <BindingBadge checking={checking} status={binding} />
        </header>

        {binding.state === "verified" ? (
          <>
            <section className="binding-summary" aria-label="已验证的本机会话">
              <div>
                <span>账号</span>
                <strong>{binding.accountName}</strong>
              </div>
              <div>
                <span>Session</span>
                <strong>{binding.sessionTitle}</strong>
              </div>
              <div>
                <span>核验时间</span>
                <strong>{new Date(binding.verifiedAt).toLocaleString("zh-CN")}</strong>
              </div>
              <div className="summary-actions">
                <span className="shortcut-hint"><kbd>⌘</kbd><kbd>K</kbd> 快捷面板</span>
                <button onClick={() => void refresh()} type="button">重新核验</button>
                <button onClick={() => void disconnect()} type="button">仅移除本机连接</button>
              </div>
            </section>
            {shortcutNotice ? <p className="shortcut-notice" role="status">{shortcutNotice}</p> : null}

            <div id="native" className="workbench-frame">
              <NativeCapabilityWorkbench
                adapter={platform}
                description="每次操作都会重新核验 loopback 后端中的账号与 Agent Session；令牌保存在 Keychain，不进入 WebView 存储。"
                intentId={intentId}
                scope={{ accountId: binding.accountId, sessionId: binding.sessionId }}
                title="当前 Session 的本机能力"
              />
            </div>
          </>
        ) : (
          <BindingForm
            checking={checking}
            error={formError ?? binding.reason}
            form={form}
            onActivate={() => void activate()}
            onChange={setForm}
          />
        )}

        <section className="boundary-card" id="boundary">
          <p className="eyebrow">Execution boundary</p>
          <h2>本机能力不会扩大业务权限</h2>
          <p>
            壳子只能访问显式 loopback 端口。窗口图像以短期不透明句柄保存在 App 缓存；
            OCR 仅调用打包的 Vision helper；通知只包含“就绪 / 失败”状态。任何 Person、
            Evidence、Meeting 或外部写入仍需在对应业务界面单独确认。
          </p>
        </section>
      </main>
    </div>
  );
}

function BindingBadge({ checking, status }: { checking: boolean; status: BindingStatus }) {
  const label = checking
    ? "核验中"
    : status.state === "verified"
      ? "Session 已核验"
      : status.state === "stale"
        ? "连接陈旧"
        : status.state === "revoked"
          ? "连接失效"
          : "尚未连接";
  return <span className="binding-badge" data-state={checking ? "checking" : status.state}>{label}</span>;
}

function BindingForm({
  checking,
  error,
  form,
  onActivate,
  onChange,
}: {
  checking: boolean;
  error: string | null;
  form: ActivateBindingRequest;
  onActivate: () => void;
  onChange: (value: ActivateBindingRequest) => void;
}) {
  return (
    <section className="connection-card">
      <div>
        <p className="eyebrow">Local authenticated adapter</p>
        <h2>连接本机 Talent Signal 后端</h2>
        <p className="lede">
          只接受带显式端口的 <code>http://127.0.0.1</code> 或 <code>http://localhost</code>。
          核验成功后，令牌写入 macOS Keychain 并立即从表单清除。
        </p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onActivate();
        }}
      >
        <label>
          本机后端
          <input
            autoCapitalize="none"
            autoCorrect="off"
            onChange={(event) => onChange({ ...form, baseUrl: event.target.value })}
            spellCheck={false}
            value={form.baseUrl}
          />
        </label>
        <label>
          Agent Session ID
          <input
            autoCapitalize="none"
            autoCorrect="off"
            onChange={(event) => onChange({ ...form, sessionId: event.target.value })}
            placeholder="00000000-0000-0000-0000-000000000000"
            spellCheck={false}
            value={form.sessionId}
          />
        </label>
        <label>
          Access token
          <input
            autoComplete="off"
            onChange={(event) => onChange({ ...form, accessToken: event.target.value })}
            type="password"
            value={form.accessToken}
          />
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button disabled={checking || !form.accessToken || !form.sessionId} type="submit">
          {checking ? "正在核验…" : "核验并保存在 Keychain"}
        </button>
      </form>
    </section>
  );
}
