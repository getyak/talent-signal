import styles from "./workspace-loading.module.css";

/**
 * Route-neutral skeleton for the workspace stage. It stays compact so it reads
 * as the page loading in place, not as a separate hero: a 24px title, a short
 * line, and the blocks the destination usually occupies.
 */
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
      <div className={styles.inner}>
        <p className={styles.eyebrow}>正在载入</p>
        <h1 id="workspace-loading-title">正在打开当前工作台</h1>
        <p className={styles.hint}>
          正在读取内容，你仍可使用侧栏切换页面。
        </p>
        <div aria-hidden="true" className={styles.skeleton}>
          <i className={styles.skeletonTitle} />
          <i />
          <i />
          <i className={styles.skeletonShort} />
        </div>
      </div>
    </main>
  );
}
