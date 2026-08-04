export default function WorkspaceLoading() {
  return (
    <main className="review-loading" aria-label="Loading evidence workspace">
      <div className="review-loading__rail" />
      <div className="review-loading__stage">
        <div />
        <div />
        <div />
        <span className="sr-only">Loading evidence workspace</span>
      </div>
    </main>
  );
}
