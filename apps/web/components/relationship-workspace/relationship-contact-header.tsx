import type {
  RelationshipScope,
  WorkspaceReviewResponse,
} from "@talent-signal/contracts";
import {
  AddressBook,
  Clock,
  FileImage,
  ShieldCheck,
} from "@phosphor-icons/react";

import { formatDate, sourceKindLabel } from "./relationship-display";

type Scope = Pick<RelationshipScope, "person" | "relationship_context">;

export function relationshipCurrentDependency(
  workspace: WorkspaceReviewResponse,
) {
  if (workspace.source_authorization.state !== "authorized") {
    return `来源访问状态：${workspace.source_authorization.state}`;
  }
  if (workspace.latest_effect?.outcome?.status === "verified") {
    return "下一步已记录";
  }
  if (
    workspace.analysis.assertions.some(
      (assertion) => assertion.review_status === "pending",
    )
  ) {
    return "证据需要审阅";
  }
  if (
    workspace.analysis.assertions.some(
      (assertion) => assertion.review_status === "confirmed",
    )
  ) {
    return "关系背景为最新状态";
  }
  return "没有已确认变化";
}

export function RelationshipContactHeader({
  scope,
  workspace = null,
}: {
  scope: Scope;
  workspace?: WorkspaceReviewResponse | null;
}) {
  const dependency = workspace
    ? relationshipCurrentDependency(workspace)
    : "等待来源编译";

  return (
    <section className="context-contact-header" id="contact-overview">
      <div className="context-contact-header__portrait">
        <div
          aria-label={`${scope.person.display_label} 的姓名首字；没有已核验联系人照片`}
          className="context-contact-header__avatar"
          role="img"
        >
          {scope.person.display_label.trim().slice(0, 1).toUpperCase()}
        </div>
        <span>没有已核验照片</span>
      </div>
      <div className="context-contact-header__identity">
        <p className="eyebrow">
          {workspace ? "持续更新的联系人页面" : "持续更新的人物页面"}
        </p>
        <h1 data-long={scope.person.display_label.length > 22}>
          {scope.person.display_label}
        </h1>
        <p>{scope.relationship_context.display_label}</p>
        <div>
          <span>
            <AddressBook aria-hidden="true" size={14} />
            身份由招聘顾问关联
          </span>
          {workspace ? (
            <>
              <span>
                <FileImage aria-hidden="true" size={14} />
                {sourceKindLabel(workspace.capture.source.kind)}
              </span>
              <span>
                <Clock aria-hidden="true" size={14} />
                更新于 {formatDate(workspace.analysis.created_at)}
              </span>
            </>
          ) : (
            <span>
              <ShieldCheck aria-hidden="true" size={14} />
              来源结论保持可审阅
            </span>
          )}
        </div>
      </div>
      <div
        className="context-contact-header__signal"
        data-state={workspace ? "governed" : "uncompiled"}
      >
        <span>{workspace ? "当前依赖项" : "当前工作状态"}</span>
        <strong>{dependency}</strong>
        <small>
          {workspace
            ? "从审阅状态得出，绝不用于评价此人。"
            : "尚未形成已确认事实或行动。"}
        </small>
      </div>
    </section>
  );
}
