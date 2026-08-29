import type { WorkspaceReviewResponse } from "@talent-signal/contracts";
import { ShieldCheck } from "@phosphor-icons/react";

import { sourceKindLabel, sourceScopeLabel } from "./relationship-display";

export function RelationshipSourceLineage({
  workspace,
}: {
  workspace: WorkspaceReviewResponse;
}) {
  return (
    <section aria-labelledby="lineage-title" className="context-lineage">
      <div className="context-lineage__heading">
        <div>
          <p className="eyebrow">来源链路</p>
          <h2 id="lineage-title">这位联系人如何进入当前视图</h2>
        </div>
        <span>
          <ShieldCheck aria-hidden="true" size={15} weight="duotone" />
          可追溯
        </span>
      </div>
      <ol>
        <li>
          <i aria-hidden="true">01</i>
          <span>来源</span>
          <strong>{sourceKindLabel(workspace.capture.source.kind)}</strong>
          <small>
            {workspace.capture.source.source_timezone
              ? `时区 ${workspace.capture.source.source_timezone}`
              : "对话日期尚未确认"}
          </small>
        </li>
        <li>
          <i aria-hidden="true">02</i>
          <span>身份锚点</span>
          <strong>{workspace.subject.display_label}</strong>
          <small>由招聘顾问关联，不根据面孔猜测</small>
        </li>
        <li>
          <i aria-hidden="true">03</i>
          <span>关系范围</span>
          <strong>{workspace.assignment.display_label}</strong>
          <small>背景始终限定在此关系内</small>
        </li>
        <li>
          <i aria-hidden="true">04</i>
          <span>当前投影</span>
          <strong>持续更新的联系人</strong>
          <small>
            {sourceScopeLabel(
              workspace.capture.source.retention.source_scope,
            )}
          </small>
        </li>
      </ol>
      <p className="context-lineage__note">
        聊天小头像只是来源背景，并非已核验肖像。在招聘顾问添加已确认照片前，本页使用中性的姓名首字标记。
      </p>
    </section>
  );
}
