import type { AccountSettings } from "@talent-signal/contracts";

export type WorkspaceConnectionStatus =
  | "not_connected"
  | "authorizing"
  | "connected"
  | "expired"
  | "revoked"
  | "error";

export type WorkspaceConnection = {
  id: string;
  label: string;
  description: string;
  status: WorkspaceConnectionStatus;
  statusLabel: string;
  scopeLabel: string;
  recovery: string | null;
  canAuthorize: boolean;
};

const labels: Record<WorkspaceConnectionStatus, string> = {
  authorizing: "等待授权",
  connected: "已连接",
  error: "连接异常",
  expired: "授权已过期",
  not_connected: "未连接",
  revoked: "已撤销",
};

/**
 * Presentation for a connector record supplied by an owning adapter. This
 * function never infers success from a login method or from an available UI.
 */
export function connectionPresentation(input: {
  id: string;
  label: string;
  description: string;
  status: WorkspaceConnectionStatus;
  scopeLabel: string;
  canAuthorize: boolean;
  errorCode?: string | null;
}): WorkspaceConnection {
  let recovery: string | null = null;
  if (input.status === "expired") {
    recovery = input.canAuthorize
      ? "重新授权前会再次显示所需范围；旧授权不会继续执行。"
      : "当前版本尚未提供重新授权入口，旧授权不会继续执行。";
  } else if (input.status === "revoked") {
    recovery = "授权已被撤销；已有来源按各自保留策略处理，不会恢复连接。";
  } else if (input.status === "error") {
    recovery = input.errorCode
      ? `连接器返回 ${input.errorCode}；没有把异常当成成功。`
      : "连接状态无法核验；没有把异常当成成功。";
  } else if (input.status === "authorizing") {
    recovery = "授权尚未完成；关闭页面不会获得任何新权限。";
  }

  return {
    ...input,
    statusLabel: labels[input.status],
    recovery,
  };
}

/**
 * The Web host currently owns account authentication, not provider data
 * authorization. Keep those concepts visible and separate until an adapter
 * can return a provider receipt.
 */
export function webWorkspaceConnections(
  settings: AccountSettings,
): WorkspaceConnection[] {
  const methods = settings.user.login_methods;
  const signInLabel = methods.length
    ? methods
        .map((method) =>
          method === "google" ? "Google" : method === "apple" ? "Apple" : "密码",
        )
        .join("、")
    : "没有可核验方式";

  return [
    connectionPresentation({
      id: "account-sign-in",
      label: "账号登录",
      description:
        "只用于确认当前用户和工作空间，不包含联系人、邮箱或日历数据权限。",
      status: methods.length ? "connected" : "error",
      scopeLabel: `登录方式：${signInLabel}`,
      canAuthorize: false,
      errorCode: methods.length ? null : "LOGIN_METHOD_UNAVAILABLE",
    }),
    connectionPresentation({
      id: "google-calendar",
      label: "Google Calendar",
      description:
        "会议页可以准备并下载日历草稿；当前没有日历 OAuth 适配器，也不会直接创建事件。",
      status: "not_connected",
      scopeLabel: "已授予范围：无",
      canAuthorize: false,
    }),
    connectionPresentation({
      id: "macos-capture",
      label: "macOS 窗口采集",
      description:
        "仅由本机壳子在用户明确选择窗口后提供；Web 页面没有屏幕读取权限。",
      status: "not_connected",
      scopeLabel: "当前主机：Web · 原生能力：不可用",
      canAuthorize: false,
    }),
  ];
}
