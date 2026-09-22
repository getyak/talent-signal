"use client";
import { useState } from "react";
import { WorkspaceAccountMenu } from "@/components/workspace-account-menu";
import styles from "@/components/workspace-shell.module.css";

export function DesktopChromeFixture() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarState} data-collapsed={collapsed}>
          <div className={styles.brandRow}>
            <button className={styles.brand} onClick={() => setCollapsed(!collapsed)}>
              <span className={styles.brandMark} /><span className={styles.brandName}>Talent Signal</span>
            </button>
          </div>
        </div>
        <nav style={{ display: "grid", gap: 18, padding: 12, fontSize: 13 }}>
          <span>新对话</span><span>今天</span><span>人物</span><span>日程</span>
        </nav>
        <div className={styles.account}>
          <WorkspaceAccountMenu accountName="Lin" workspaceName="合成测试工作区" signOutAction={() => {}} />
        </div>
      </aside>
      <main style={{ padding: "15vh 8vw" }}>
        <p style={{ color: "var(--muted)", fontSize: 12 }}>桌面更新与连接 · 合成演练</p>
        <h1 style={{ fontSize: 26, fontWeight: 500, margin: "12px 0" }}>继续你的工作。</h1>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>更新只在需要时出现。这里不连接真实账号。</p>
        <textarea aria-label="演练草稿" placeholder="留下一段草稿，检查更新时不会重载页面。" style={{ width: "100%", marginTop: 36, padding: 18, border: "1px solid var(--line-soft)", borderRadius: 12 }} />
      </main>
    </div>
  );
}
