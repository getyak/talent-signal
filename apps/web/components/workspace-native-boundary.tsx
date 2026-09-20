/** Remote workspace content never receives native screen permissions. */
export function WorkspaceNativeBoundary() {
  return (
    <section aria-label="Mac 本机能力说明">
      <h3>工作台与本机工具</h3>
      <p>Mac 主窗口与浏览器共享工作台界面，负责对话、人物资料和日程草稿。</p>
      <p>窗口采集、本地 OCR 等能力在 Mac App 的「本机工具」中使用。先选择窗口，再由你确认；工作台页面本身不能读取屏幕。</p>
    </section>
  );
}
