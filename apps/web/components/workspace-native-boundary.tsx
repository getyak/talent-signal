"use client";

import {
  NativeCapabilityStatus,
  createUnavailablePlatformAdapter,
} from "@talent-signal/workspace-ui";

const webPlatform = createUnavailablePlatformAdapter({
  host: "web",
  reason: "浏览器没有 Talent Signal 桌面桥接；请在已验证的 macOS App 中使用。",
});

/**
 * This Web projection intentionally has no account/session props. It can show
 * the native boundary, but cannot manufacture a native scope or invoke an
 * operation from remote content.
 */
export function WorkspaceNativeBoundary() {
  return (
    <NativeCapabilityStatus
      adapter={webPlatform}
      description="浏览器继续负责账号与服务连接；窗口采集、本地 OCR、快捷面板和系统通知只在本地打包的 macOS App 内开放。"
      title="macOS 能力"
    />
  );
}
