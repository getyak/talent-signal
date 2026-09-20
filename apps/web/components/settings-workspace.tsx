"use client";

import {
  ArrowSquareOut,
  Moon,
  Sun,
} from "@phosphor-icons/react";
import type { AccountSettings } from "@talent-signal/contracts";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { AccountSettingsPanel } from "./account-settings";
import { AgentResponsePreference } from "./agent-response-preference";
import {
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "@/lib/settings-sections";
import styles from "./settings-workspace.module.css";

export type { SettingsSection } from "@/lib/settings-sections";

function Group({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.group}>
      <div className={styles.groupHead}>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.row}>
      <div>
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

const THEME_EVENT = "talent-signal:theme-change";

function subscribeTheme(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function themeSnapshot(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function subscribeNever() {
  return () => {};
}

function ThemeChoice() {
  const theme = useSyncExternalStore(subscribeTheme, themeSnapshot, () => "light");

  function choose(next: "light" | "dark") {
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem("talent-signal-theme", next);
    } catch {
      /* Theme still applies for this session without storage. */
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <div aria-label="外观" className={styles.segmented} role="group">
      <button
        aria-pressed={theme === "light"}
        onClick={() => choose("light")}
        type="button"
      >
        <Sun aria-hidden="true" size={14} /> 浅色
      </button>
      <button
        aria-pressed={theme === "dark"}
        onClick={() => choose("dark")}
        type="button"
      >
        <Moon aria-hidden="true" size={14} /> 深色
      </button>
    </div>
  );
}

function AppearancePane({ sessionVersion }: { sessionVersion: string | null }) {
  const timeZone = useSyncExternalStore(
    subscribeNever,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "未提供",
    () => "正在读取…",
  );


  return (
    <div className={styles.pane}>
      <Group
        description="界面只改变呈现方式；明暗主题保存在这台设备上。"
        title="界面"
      >
        <Row description="选择这台设备上的显示主题。" title="外观">
          <ThemeChoice />
        </Row>
        <Row description="工作台界面语言。" title="语言">
          <span className={styles.rowValue}>简体中文</span>
        </Row>
        <Row
          description="按浏览器报告的时区解释时间；产品不会根据语言猜测时区。"
          title="时区"
        >
          <span className={styles.rowValue}>{timeZone}</span>
        </Row>
      </Group>
      <Group
        description="只改变回复的展开方式，不改变来源判断或操作权限。"
        title="智能助理回复"
      >
        {sessionVersion ? (
          <AgentResponsePreference embedded key={sessionVersion} sessionVersion={sessionVersion} />
        ) : (
          <p className={styles.notice}>
            登录空间暂不可用，无法读取已保存的回复偏好。重新登录后这里会显示真实偏好。
          </p>
        )}
      </Group>
    </div>
  );
}

export function SettingsWorkspace({
  initial,
  sessionVersion,
  section,
  labEnabled,
}: {
  initial: AccountSettings | null;
  sessionVersion: string | null;
  section: SettingsSection;
  labEnabled: boolean;
}) {
  return (
    <main className={styles.page} id="main-content" tabIndex={-1}>
      <header className={styles.heading}>
        <h1>设置</h1>
        <p>
          账号、空间与界面偏好。进阶与测试工具放在后面，不影响日常对话。
        </p>
      </header>
      <div className={styles.frame}>
        <nav aria-label="设置分区" className={styles.nav}>
          {SETTINGS_SECTIONS.filter(
            (item) => item.id !== "testing" || labEnabled,
          ).map((item) => (
            <Link
              aria-current={item.id === section ? "page" : undefined}
              href={item.href}
              key={item.id}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.pane}>
          {section === "account" || section === "workspace" ? (
            initial ? (
              <AccountSettingsPanel
                embedded
                initial={initial}
                key={`${initial.workspace.id}-${section}`}
                section={section}
              />
            ) : (
              <section className={styles.unavailable}>
                <h2>账号设置暂时无法连接</h2>
                <p className={styles.notice}>
                  账号服务不可用时，系统不会展示缓存或示例中的身份、成员或会话。
                </p>
                <Link
                  className={styles.rowAction}
                  href="/login?callbackUrl=%2Fworkspace%2Fsettings"
                >
                  重新登录
                </Link>
              </section>
            )
          ) : null}

          {section === "appearance" ? (
            <AppearancePane sessionVersion={sessionVersion} />
          ) : null}

          {section === "connections" ? (
            <Group
              description="连接与权限由账号后端裁定；这里只提供入口，不显示缓存状态。"
              title="来源与连接"
            >
              <Row
                description="查看每个连接的范围、失效与重新授权状态。"
                title="连接与权限"
              >
                <Link className={styles.rowAction} href="/workspace/plugs">
                  打开连接
                  <ArrowSquareOut aria-hidden="true" size={14} />
                </Link>
              </Row>
              <Row
                description="账号专属的来源、授权与删除状态。"
                title="来源"
              >
                <Link className={styles.rowAction} href="/workspace/captures">
                  打开来源
                  <ArrowSquareOut aria-hidden="true" size={14} />
                </Link>
              </Row>
            </Group>
          ) : null}

          {section === "advanced" ? (
            <Group
              description="这些工具面向排查问题；不会创建、批准或发送任何外部操作。"
              title="高级"
            >
              <Row description="查看系统组件与最近的核验结果。" title="系统检测">
                <Link
                  className={styles.rowAction}
                  href="/workspace/settings/diagnostics"
                >
                  打开检测
                  <ArrowSquareOut aria-hidden="true" size={14} />
                </Link>
              </Row>
              <Row description="产品运行的反馈记录。" title="运行反馈">
                <Link className={styles.rowAction} href="/workspace/monitor">
                  打开反馈
                  <ArrowSquareOut aria-hidden="true" size={14} />
                </Link>
              </Row>
              <Row
                description="冻结的边界案例，用于独立验证授权与来源语义。"
                title="冻结边界案例"
              >
                <Link className={styles.rowAction} href="/workspace/boundaries">
                  打开案例
                  <ArrowSquareOut aria-hidden="true" size={14} />
                </Link>
              </Row>
            </Group>
          ) : null}

          {section === "testing" && labEnabled ? (
            <Group
              description="隔离的评测与测试空间。这里不进入日常产品导航。"
              title="测试与诊断"
            >
              <Row description="隔离场景、重放与 Reality Receipt。" title="场景评测">
                <Link className={styles.rowAction} href="/workspace/lab">
                  打开 Lab
                  <ArrowSquareOut aria-hidden="true" size={14} />
                </Link>
              </Row>
              <Row description="用自己的账号进入隔离测试空间。" title="测试空间">
                <Link
                  className={styles.rowAction}
                  href="/workspace/settings/testing"
                >
                  打开测试空间
                  <ArrowSquareOut aria-hidden="true" size={14} />
                </Link>
              </Row>
              <Row description="系统组件与最近核验结果。" title="系统检测">
                <Link
                  className={styles.rowAction}
                  href="/workspace/settings/diagnostics"
                >
                  打开检测
                  <ArrowSquareOut aria-hidden="true" size={14} />
                </Link>
              </Row>
            </Group>
          ) : null}
        </div>
      </div>
    </main>
  );
}
