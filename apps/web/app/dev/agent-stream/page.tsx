import { notFound } from "next/navigation";

import { PursuitAgentRail } from "@/components/pursuit-agent-rail";
import {
  agentTaskStreamPreviewTask,
  STREAM_PREVIEW_IDS,
} from "@/lib/agentTaskStreamFixture";

import styles from "./preview.module.css";

export default function AgentStreamPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className={styles.page}>
      <section className={styles.context}>
        <p>受治理的关系工作区</p>
        <h1>CFO succession search</h1>
        <span>流式简报视觉与恢复状态的冻结验证表面。</span>
      </section>
      <PursuitAgentRail
        agentContext={{
          captureId: STREAM_PREVIEW_IDS.capture,
          evidenceRefs: [STREAM_PREVIEW_IDS.evidence],
        }}
        eventStreamHref="/api/dev/agent-stream"
        evidenceHref="#evidence"
        initialTask={agentTaskStreamPreviewTask()}
        pursuit={{
          id: STREAM_PREVIEW_IDS.pursuit,
          milestone: "薪酬边界校准",
          revision: 7,
          title: "CFO succession search",
        }}
      />
      <section className={styles.evidence} id="evidence">
        <p>受治理来源</p>
        <strong>客户同步记录 · 已审阅</strong>
        <span>这里只展示合成内容；预览不会读取或写入真实候选人数据。</span>
      </section>
    </main>
  );
}
