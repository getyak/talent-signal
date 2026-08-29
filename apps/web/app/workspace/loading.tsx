import styles from "./workspace-loading.module.css";

export default function WorkspaceLoading() {
  return (
    <main
      id="main-content"
      className={styles.loading}
      aria-labelledby="workspace-loading-title"
      role="status"
      aria-live="polite"
      tabIndex={-1}
    >
      <header className={styles.header}>
        <p className={styles.eyebrow}>账号范围内读取</p>
        <h1 id="workspace-loading-title">正在打开当前工作台</h1>
        <p>
          视图同步期间，导航与账号控制仍可使用。加载不会创建或批准任何外部行动。
        </p>
      </header>

      <div className={styles.skeleton} aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <i key={index} />
        ))}
      </div>
    </main>
  );
}
