"use client";

import {
  ArrowRight,
  CaretLeft,
  Moon,
  Sun,
} from "@phosphor-icons/react";
import type { AccountSettings } from "@talent-signal/contracts";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { AccountSettingsPanel } from "./account-settings";
import { AgentResponsePreference } from "./agent-response-preference";
import { AvatarDefaultSettings, AvatarEditor } from "./avatar-editor";
import {
  SETTINGS_SECTIONS,
  settingsDrilldownSections,
  type SettingsSection,
} from "@/lib/settings-sections";
import styles from "./settings-workspace.module.css";

export type { SettingsSection } from "@/lib/settings-sections";

const SECTION_DESCRIPTIONS: Partial<Record<SettingsSection, string>> = {
  account: "管理自己的显示名称、登录方式与访问设备。",
  workspace: "空间中的名称、成员与归属，始终有清楚的记录。",
  appearance: "只改变呈现方式与回复展开方式，不改变来源判断或操作权限。",
  connections: "查看已连接的服务、资料入口与各自的权限。",
  advanced: "这些工具面向排查问题；不会创建、批准或发送任何外部操作。",
  testing: "隔离的评测与测试空间。这里不进入日常产品导航。",
};

const LOGIN_METHOD_LABELS: Record<string, string> = {
  google: "Google",
  apple: "Apple",
  password: "邮箱密码",
};

function loginMethodSummary(methods: readonly string[]): string {
  if (methods.length === 0) return "受限测试会话";
  return methods.map((method) => LOGIN_METHOD_LABELS[method] ?? method).join("、");
}

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

function RowLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link className={styles.rowLink} href={href}>
      {label}
      <ArrowRight aria-hidden="true" size={13} />
    </Link>
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
        <Sun aria-hidden="true" size={13} /> 浅色
      </button>
      <button
        aria-pressed={theme === "dark"}
        onClick={() => choose("dark")}
        type="button"
      >
        <Moon aria-hidden="true" size={13} /> 深色
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
      <AvatarDefaultSettings />
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

function ConnectionsPane() {
  return (
    <div className={styles.pane}>
      <Group
        description="查看已连接的服务、资料入口与各自的权限。"
        title="来源与连接"
      >
        <Row
          description="查看每个连接的范围、失效与重新授权状态。"
          title="扩展与权限"
        >
          <RowLink href="/workspace/extensions" label="管理扩展" />
        </Row>
        <Row description="账号专属的来源、授权与删除状态。" title="来源">
          <RowLink href="/workspace/captures" label="打开来源" />
        </Row>
      </Group>
    </div>
  );
}

function AdvancedPane({ labEnabled }: { labEnabled: boolean }) {
  return (
    <div className={styles.pane}>
      <Group
        description="这些工具面向排查问题；不会创建、批准或发送任何外部操作。"
        title="高级"
      >
        <Row description="查看系统组件与最近的核验结果。" title="系统检测">
          <RowLink href="/workspace/settings/diagnostics" label="打开检测" />
        </Row>
        <Row description="产品运行的反馈记录。" title="运行反馈">
          <RowLink href="/workspace/monitor" label="打开反馈" />
        </Row>
        <Row
          description="冻结的边界案例，用于独立验证授权与来源语义。"
          title="冻结边界案例"
        >
          <RowLink href="/workspace/boundaries" label="打开案例" />
        </Row>
      </Group>
      {labEnabled ? (
        <Group description="隔离的评测与测试空间。" title="测试与诊断">
          <Row description="隔离场景、重放与 Reality Receipt。" title="场景评测">
            <RowLink href="/workspace/lab" label="打开 Lab" />
          </Row>
          <Row description="用自己的账号进入隔离测试空间。" title="测试空间">
            <RowLink href="/workspace/settings/testing" label="打开测试空间" />
          </Row>
        </Group>
      ) : null}
    </div>
  );
}

function TestingPane() {
  return (
    <div className={styles.pane}>
      <Group
        description="隔离的评测与测试空间。这里不进入日常产品导航。"
        title="测试与诊断"
      >
        <Row description="隔离场景、重放与 Reality Receipt。" title="场景评测">
          <RowLink href="/workspace/lab" label="打开 Lab" />
        </Row>
        <Row description="用自己的账号进入隔离测试空间。" title="测试空间">
          <RowLink href="/workspace/settings/testing" label="打开测试空间" />
        </Row>
        <Row description="系统组件与最近核验结果。" title="系统检测">
          <RowLink href="/workspace/settings/diagnostics" label="打开检测" />
        </Row>
      </Group>
    </div>
  );
}

/**
 * The default overview. It leads with the real account identity, then grouped
 * rows that each state one consequence and one compact control or drilldown.
 */
function SettingsOverview({
  initial,
  labEnabled,
}: {
  initial: AccountSettings;
  labEnabled: boolean;
}) {
  const role = initial.workspace.is_owner
    ? "所有者"
    : initial.workspace.role === "admin"
      ? "管理员"
      : "成员";

  return (
    <>
      <article className={styles.featured}>
        <AvatarEditor id="self" self label={initial.user.display_name} size={64} />
        <div className={styles.featuredCopy}>
          <h2>{initial.user.display_name}</h2>
          <p>{initial.user.email}</p>
          <span>
            {initial.workspace.name} · {role}
            {initial.workspace.is_test ? " · 测试" : ""}
          </span>
        </div>
        <RowLink href="/workspace/settings?section=account" label="管理账号与安全" />
      </article>

      <Group title="账号">
        <Row
          description="显示名称在账号页面中修改，保存后会重新核验。"
          title="显示名称"
        >
          <span className={styles.rowValue}>{initial.user.display_name}</span>
        </Row>
        <Row title="登录方式">
          <span className={styles.rowValue}>
            {loginMethodSummary(initial.user.login_methods)}
          </span>
        </Row>
        <Row description="退出会话后，该设备需要重新登录。" title="登录会话">
          <span className={styles.rowValue}>
            {initial.sessions.length} 个登录会话
          </span>
        </Row>
        <Row description="空间名称、成员角色与最近的管理记录。" title="工作空间">
          <RowLink href="/workspace/settings?section=workspace" label="查看空间" />
        </Row>
      </Group>

      <Group title="界面与偏好">
        <Row description="只保存在这台设备上。" title="外观">
          <ThemeChoice />
        </Row>
        <Row title="头像" description="默认风格与单独设置的联系人头像。"><RowLink href="/workspace/settings?section=appearance" label="设置头像风格" /></Row>
        <Row title="语言">
          <span className={styles.rowValue}>简体中文</span>
        </Row>
        <Row
          description="只改变回复的展开方式，不改变来源判断或权限。"
          title="回复偏好"
        >
          <RowLink href="/workspace/settings?section=appearance" label="打开偏好" />
        </Row>
      </Group>

      <Group title="连接与来源">
        <Row description="每个连接的范围、失效与重新授权状态。" title="扩展与权限">
          <RowLink href="/workspace/extensions" label="管理扩展" />
        </Row>
        <Row description="账号专属的来源、授权与删除状态。" title="来源">
          <RowLink href="/workspace/captures" label="打开来源" />
        </Row>
      </Group>

      <Group title="本机能力">
        <Row
          description="系统权限、截图与语音由 Talent Signal 原生应用负责；此 Web 版本不提供这些开关。"
          title="桌面与 iOS 能力"
        >
          <span className={styles.rowValue}>在原生应用中管理</span>
        </Row>
      </Group>

      <Group title="排查与测试">
        <Row description="查看系统组件与最近的核验结果。" title="系统检测">
          <RowLink href="/workspace/settings/diagnostics" label="打开检测" />
        </Row>
        <Row description="产品运行的反馈记录。" title="运行反馈">
          <RowLink href="/workspace/monitor" label="打开反馈" />
        </Row>
        <Row
          description="冻结的边界案例，用于独立验证授权与来源语义。"
          title="冻结边界案例"
        >
          <RowLink href="/workspace/boundaries" label="打开案例" />
        </Row>
        {labEnabled ? (
          <Row description="隔离场景、重放与测试空间。" title="测试与诊断">
            <RowLink href="/workspace/settings?section=testing" label="打开" />
          </Row>
        ) : null}
      </Group>
    </>
  );
}

export type StagedRecoveryProjection = {
  operationRef: string | null;
  roles: {
    current: { provider: string; expiresAt: string } | null;
    duplicate: { provider: string; expiresAt: string } | null;
  };
};

export function SettingsWorkspace({
  initial,
  sessionVersion,
  section,
  labEnabled,
  recovery = { operationRef: null, roles: { current: null, duplicate: null } },
}: {
  initial: AccountSettings | null;
  sessionVersion: string | null;
  section: SettingsSection;
  labEnabled: boolean;
  recovery?: StagedRecoveryProjection;
}) {
  const drilldownSections = settingsDrilldownSections(labEnabled);
  const current = SETTINGS_SECTIONS.find((item) => item.id === section);
  const overview = section === "overview";

  return (
    <main className={styles.page} id="main-content" tabIndex={-1}>
      {overview ? (
        <header className={styles.heading}>
          <h1>设置</h1>
          <p>只保留真正影响工作区、建议和信息边界的选项。</p>
        </header>
      ) : (
        <>
          <nav aria-label="设置分区" className={styles.breadcrumb}>
            <Link href="/workspace/settings">
              <CaretLeft aria-hidden="true" size={13} />
              设置
            </Link>
            <strong>{current?.label ?? "设置"}</strong>
          </nav>
          <header className={styles.sectionHeading}>
            <h1>{current?.label ?? "设置"}</h1>
            {SECTION_DESCRIPTIONS[section] ? (
              <p>{SECTION_DESCRIPTIONS[section]}</p>
            ) : null}
          </header>
          <div className={styles.sectionTabs}>
            {drilldownSections.map((item) => (
              <Link
                aria-current={item.id === section ? "page" : undefined}
                href={item.href}
                key={item.id}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </>
      )}

      <div className={styles.pane}>
        {overview ? (
          initial ? (
            <SettingsOverview initial={initial} labEnabled={labEnabled} />
          ) : (
            <section className={styles.unavailable}>
              <h2>账号设置暂时无法连接</h2>
              <p className={styles.notice}>
                账号服务不可用时，系统不会展示缓存或示例中的身份、成员或会话。
              </p>
              <Link className={styles.rowLink} href="/login?callbackUrl=%2Fworkspace%2Fsettings">
                重新登录
              </Link>
            </section>
          )
        ) : null}

        {section === "account" || section === "workspace" ? (
          initial ? (
            <AccountSettingsPanel
              embedded
              initial={initial}
              key={`${initial.workspace.id}-${section}`}
              recovery={recovery}
              section={section}
            />
          ) : (
            <section className={styles.unavailable}>
              <h2>账号设置暂时无法连接</h2>
              <p className={styles.notice}>
                账号服务不可用时，系统不会展示缓存或示例中的身份、成员或会话。
              </p>
              <Link className={styles.rowLink} href="/login?callbackUrl=%2Fworkspace%2Fsettings">
                重新登录
              </Link>
            </section>
          )
        ) : null}

        {section === "appearance" ? (
          <AppearancePane sessionVersion={sessionVersion} />
        ) : null}

        {section === "connections" ? <ConnectionsPane /> : null}

        {section === "advanced" ? <AdvancedPane labEnabled={labEnabled} /> : null}

        {section === "testing" && labEnabled ? <TestingPane /> : null}
      </div>
    </main>
  );
}
