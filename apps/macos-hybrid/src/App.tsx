import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DesktopWorkspaceLayout } from "./desktop-workspace-layout";
import { BindingBadge, BindingForm } from "./connection-presentation";

import { NativeCapabilityWorkbench } from "@talent-signal/workspace-ui";

import {
  createDesktopPlatformAdapter,
  desktopSession,
  isQuickPanelShortcut,
  type ActivateBindingRequest,
  type BindingStatus,
} from "./platform";
import {
  captureIntentStorageKey,
  loadCaptureIntent,
  pruneCaptureIntents,
  retainCaptureIntentScope,
  saveCaptureIntent,
  sweepExpiredCaptureIntents,
  type CaptureIntentScope,
} from "./captureIntentStorage";

const platform = createDesktopPlatformAdapter();

const EMPTY_BINDING: ActivateBindingRequest = {
  accessToken: "",
  baseUrl: "https://127.0.0.1:4443",
  serverCertificatePem: "",
  sessionId: "",
};

export function App() {
  const [binding, setBinding] = useState<BindingStatus>({ state: "unbound", reason: null });
  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState(EMPTY_BINDING);
  const [formError, setFormError] = useState<string | null>(null);
  const [shortcutNotice, setShortcutNotice] = useState<string | null>(null);
  const viewEpoch = useRef(0);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const verifiedScope = useRef<{ accountId: string; sessionId: string } | null>(null);

  const pruneLocalCaptureIntents = useCallback((retained: CaptureIntentScope | null) => {
    try {
      pruneCaptureIntents(localStorage, retained);
    } catch {
      // Storage failure never re-opens a native permission boundary.
    }
  }, []);

  const sweepLocalCaptureIntents = useCallback(() => {
    try {
      sweepExpiredCaptureIntents(localStorage);
    } catch {
      // Storage failure never changes native binding authority.
    }
  }, []);

  const refresh = useCallback(() => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const expectedEpoch = viewEpoch.current;
    setChecking(true);
    const pending = (async () => {
      sweepLocalCaptureIntents();
      try {
        const next = await desktopSession.status();
        if (viewEpoch.current === expectedEpoch) {
          // A stale, revoked, or merely unbound status is not proof that a
          // native Started receipt was cleared. Retain the exact prior scope
          // so a verified recovery can replay or cancel the same intent.
          verifiedScope.current = retainCaptureIntentScope(verifiedScope.current, next);
          if (next.state === "verified") {
            pruneLocalCaptureIntents(verifiedScope.current);
          }
          setBinding(next);
        }
      } catch {
        if (viewEpoch.current === expectedEpoch) {
          setBinding({ state: "stale", reason: "本机桥接没有返回可核验状态。" });
        }
      } finally {
        if (viewEpoch.current === expectedEpoch) setChecking(false);
        refreshInFlight.current = null;
      }
    })();
    refreshInFlight.current = pending;
    return pending;
  }, [pruneLocalCaptureIntents, sweepLocalCaptureIntents]);

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
        .catch(() =>
          setShortcutNotice("未能确认快捷面板是否已经打开；请先检查当前窗口。"),
        );
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [binding, intentId]);

  async function activate() {
    viewEpoch.current += 1;
    setFormError(null);
    setChecking(true);
    try {
      const next = await desktopSession.activate(form);
      if (next.state === "verified") {
        verifiedScope.current = { accountId: next.accountId, sessionId: next.sessionId };
        pruneLocalCaptureIntents(verifiedScope.current);
      }
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
    viewEpoch.current += 1;
    setChecking(true);
    try {
      const next = await desktopSession.disconnect();
      if (next.state === "unbound") {
        pruneLocalCaptureIntents(null);
        verifiedScope.current = null;
      }
      setBinding(next);
      setShortcutNotice(null);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setFormError(`断开未确认：${reason}`);
      setShortcutNotice("断开未确认；已重新读取本机权威状态，请按当前状态决定是否重试。");
      if (refreshInFlight.current) await refreshInFlight.current;
      await refresh();
    } finally {
      setChecking(false);
    }
  }

  return (
    <DesktopWorkspaceLayout
      accountName={binding.state === "verified" ? binding.accountName : null}
      title={binding.state === "verified" ? binding.sessionTitle : "连接工作区"}
      status={<BindingBadge checking={checking} status={binding} />}
    >
        {binding.state === "verified" ? (
          <>
            <section className="binding-summary" id="connection" aria-label="已验证的本机会话">
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
            {binding.cleanupWarning ? (
              <p className="shortcut-notice" role="status">
                当前 Session 仍已核验，但旧 Keychain 令牌尚未确认清除：
                {binding.cleanupWarning}
              </p>
            ) : null}
            {shortcutNotice ? <p className="shortcut-notice" role="status">{shortcutNotice}</p> : null}

            <div id="native" className="workbench-frame">
              <NativeCapabilityWorkbench
                adapter={platform}
                description="选择一项本机操作，结果会保留在当前对话。"
                intentId={intentId}
                key={bindingScope}
                loadPendingCaptureIntent={() => {
                  const key = captureIntentStorageKey(binding);
                  return loadCaptureIntent(localStorage, key);
                }}
                savePendingCaptureIntent={(value, expectedIntent) => {
                  const key = captureIntentStorageKey(binding);
                  saveCaptureIntent(localStorage, key, value, expectedIntent);
                }}
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
            onDisconnect={() => void disconnect()}
          />
        )}

        <details className="boundary-card" id="boundary">
          <summary>本机处理与权限说明</summary>
          <p>
            壳子只能访问显式 loopback 端口。窗口图像以短期不透明句柄保存在 App 缓存；
            OCR 仅调用打包的 Vision helper；通知只包含“就绪 / 失败”状态。任何 Person、
            Evidence、Meeting 或外部写入仍需在对应业务界面单独确认。
          </p>
        </details>
    </DesktopWorkspaceLayout>
  );
}
