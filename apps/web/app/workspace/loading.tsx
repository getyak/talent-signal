export default function WorkspaceLoading() {
  return (
    <main
      id="main-content"
      className="review-loading"
      aria-labelledby="workspace-loading-title"
      tabIndex={-1}
    >
      <aside className="review-loading__rail" aria-hidden="true">
        <span>TS</span>
        <i />
        <i />
        <i />
      </aside>
      <section className="review-loading__stage" role="status" aria-live="polite">
        <p className="eyebrow">ACCOUNT-SCOPED READBACK</p>
        <h1 id="workspace-loading-title">Opening evidence review</h1>
        <p>
          Reading the latest source, recruiter decisions, action authority, and
          observed result. No new effect is created while this page loads.
        </p>
        <div className="review-loading__progress" aria-hidden="true">
          <span />
        </div>
      </section>
    </main>
  );
}
