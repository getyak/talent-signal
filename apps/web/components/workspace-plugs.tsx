import {
  CalendarBlank,
  Desktop,
  Key,
  LockKey,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import type { WorkspaceConnection } from "@/lib/workspace-plugs";
import Link from "next/link";

import styles from "./workspace-plugs.module.css";
import { WorkspaceNativeBoundary } from "./workspace-native-boundary";

const icons = {
  "account-sign-in": Key,
  "google-calendar": CalendarBlank,
  "macos-capture": Desktop,
} as const;

export function WorkspacePlugs({
  connections,
  error,
}: {
  connections: WorkspaceConnection[];
  error: string | null;
}) {
  return (
    <main className={styles.page} id="main-content" tabIndex={-1}>
      <header className={styles.header}>
        <h1>连接</h1>
        <p>
          每个连接只显示当前可核验的状态和范围。登录、读取来源、准备草稿与执行外部写入是不同权限。
        </p>
      </header>

      {error ? (
        <section className={styles.error} role="alert">
          <WarningCircle aria-hidden="true" size={20} />
          <div>
            <strong>连接状态暂时无法核验</strong>
            <p>{error} 没有使用浏览器缓存或默认“已连接”状态。</p>
            <Link href="/workspace/plugs">重新读取</Link>
          </div>
        </section>
      ) : (
        <section aria-labelledby="connections-title" className={styles.listSection}>
          <div className={styles.sectionHeading}>
            <div>
              <p>当前账号</p>
              <h2 id="connections-title">能力与授权</h2>
            </div>
            <span>{connections.length} 项</span>
          </div>
          <ul className={styles.list}>
            {connections.map((connection) => {
              const Icon = icons[connection.id as keyof typeof icons] ?? LockKey;
              return (
                <li className={styles.row} data-status={connection.status} key={connection.id}>
                  <span aria-hidden="true" className={styles.icon}>
                    <Icon size={18} weight="duotone" />
                  </span>
                  <div className={styles.body}>
                    <div className={styles.titleLine}>
                      <h3>{connection.label}</h3>
                      <span className={styles.status}>{connection.statusLabel}</span>
                    </div>
                    <p>{connection.description}</p>
                    <small>{connection.scopeLabel}</small>
                    {connection.recovery ? (
                      <p className={styles.recovery}>{connection.recovery}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <details className={styles.directionNote}>
            <summary>连接方向与不可用能力</summary>
            <p>
              当前版本只实现读取方向：已授权的来源可以被读取，并在写入前始终询问。
              把 Talent Signal 作为受控服务接入其他客户端（MCP 发布）尚未实现，
              因此这里不提供方向切换、客户端列表或范围开关。
            </p>
          </details>
        </section>
      )}

      <aside className={styles.boundary}>
        <LockKey aria-hidden="true" size={18} />
        <p>
          当前没有可用的日历授权入口。Talent Signal 不会把 Google 登录当成日历许可，也不会让远程 Web 内容获得原生采集能力。
        </p>
      </aside>

      <details className={styles.nativeBoundary}>
        <summary>查看 Mac 本机能力说明</summary>
        <WorkspaceNativeBoundary />
      </details>
    </main>
  );
}
