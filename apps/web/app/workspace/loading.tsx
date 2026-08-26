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
        <p className={styles.eyebrow}>Account-scoped readback</p>
        <h1 id="workspace-loading-title">Opening the current workspace</h1>
        <p>
          Navigation and account controls remain available while this view
          catches up. Loading does not create or approve any external action.
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
