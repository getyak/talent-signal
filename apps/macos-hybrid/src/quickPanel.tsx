import { createRoot } from "react-dom/client";

import "./styles.css";

function QuickPanel() {
  return (
    <main className="quick-panel">
      <p className="eyebrow">Current verified Session</p>
      <h1>回到 Talent Signal 继续</h1>
      <p>此面板不显示候选人、消息或证据内容，也不执行任何外部动作。</p>
      <small>关闭面板不会改变 Session 或草稿。</small>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing quick-panel root");
createRoot(root).render(<QuickPanel />);
