import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const component = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace-app.tsx",
  ),
  "utf8",
);
const workspaceReadback = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/use-relationship-workspace-readback.ts",
  ),
  "utf8",
);
const styles = readFileSync(
  resolve(import.meta.dirname, "../app/globals.css"),
  "utf8",
);
const captureController = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/use-screenshot-capture-controller.ts",
  ),
  "utf8",
);
const relationshipWiki = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/relationship-wiki-panel.tsx",
  ),
  "utf8",
);
const personIdentityChoice = readFileSync(
  resolve(import.meta.dirname, "./person-identity-choice.ts"),
  "utf8",
);
const identityReviewCard = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/agent-identity-review-card.tsx",
  ),
  "utf8",
);
const agentCreatePersonCard = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/agent-create-person-card.tsx",
  ),
  "utf8",
);
const personMergeReview = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/person-merge-review.tsx",
  ),
  "utf8",
);
const capturePanel = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/screenshot-capture-panel.tsx",
  ),
  "utf8",
);
const startRelationshipPanel = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/start-relationship-panel.tsx",
  ),
  "utf8",
);
const relationshipDisplay = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/relationship-display.ts",
  ),
  "utf8",
);
const relationshipResourceComposer = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/relationship-resource-composer.tsx",
  ),
  "utf8",
);
const relationshipNextMove = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/relationship-next-move.tsx",
  ),
  "utf8",
);
const relationshipFactReview = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/relationship-fact-review.tsx",
  ),
  "utf8",
);
const relationshipEvidenceProjection = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/relationship-evidence-projection.tsx",
  ),
  "utf8",
);
const relationshipAgentController = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/use-relationship-agent-controller.ts",
  ),
  "utf8",
);
const relationshipAgentPanel = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/relationship-agent-panel.tsx",
  ),
  "utf8",
);
const relationshipContactHeader = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/relationship-contact-header.tsx",
  ),
  "utf8",
);
const relationshipSourceLineage = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/relationship-source-lineage.tsx",
  ),
  "utf8",
);
const relationshipResourceSection = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/relationship-resource-section.tsx",
  ),
  "utf8",
);
const relationshipOnboarding = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/relationship-onboarding.tsx",
  ),
  "utf8",
);
const relationshipAgentStartPanel = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/relationship-agent-start-panel.tsx",
  ),
  "utf8",
);
const agentVoiceInput = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/agent-voice-input.tsx",
  ),
  "utf8",
);
const relationshipHistory = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/relationship-history.tsx",
  ),
  "utf8",
);

describe("relationship workspace accessibility contract", () => {
  it("keeps voice as an editable composer draft with foreground recovery", () => {
    expect(agentVoiceInput).toContain("按下发送前，任何内容都不会进入智能助理");
    expect(agentVoiceInput).toContain("temporary_audio_stored_by_talent_signal !== false");
    expect(agentVoiceInput).toContain('document.addEventListener("visibilitychange"');
    expect(agentVoiceInput).toContain("没有发送任何内容");
    expect(agentVoiceInput).toContain("取消语音转写");
    expect(agentVoiceInput).toContain("requestAbortRef.current?.abort()");
    expect(agentVoiceInput).toContain('aria-live="polite"');
    expect(agentVoiceInput).toContain('aria-pressed={phase === "recording"}');
  });

  it("uses a modal primitive with named content and guarded dismissal", () => {
    expect(capturePanel).toContain(
      'import * as Dialog from "@radix-ui/react-dialog"',
    );
    expect(capturePanel).toContain("<Dialog.Root");
    expect(capturePanel).toContain("<Dialog.Title asChild>");
    expect(capturePanel).toContain("<Dialog.Description asChild>");
    expect(capturePanel).toContain("onEscapeKeyDown");
    expect(capturePanel).toContain("onPointerDownOutside");
  });

  it("restores focus after dismissal but prioritizes fact review after commit", () => {
    expect(capturePanel).toContain("returnTarget.focus({ preventScroll: true })");
    expect(captureController).toContain("committedRef.current = true");
    expect(capturePanel).toContain("wasCommitted()");
    expect(component).toContain(
      "`/workspace?capture=${encodeURIComponent(next.capture.id)}#proposed-changes`,",
    );
  });

  it("keeps browser-local masking keyboard operable and announced", () => {
    expect(capturePanel).toContain(
      'aria-describedby="capture-redaction-help capture-redaction-status"',
    );
    expect(capturePanel).toContain(
      'aria-keyshortcuts="Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight Delete"',
    );
    expect(capturePanel).toContain('aria-live="polite"');
    expect(capturePanel).toContain("onKeyboardAdjust={adjustLatestRedaction}");
  });

  it("decodes local evidence into canvas without a user-controlled DOM URL", () => {
    expect(capturePanel).toContain("function BrowserLocalImage(");
    expect(capturePanel).toContain("createImageBitmap(source)");
    expect(capturePanel).not.toContain("URL.createObjectURL");
    expect(capturePanel).not.toContain("<img");
  });

  it("keeps slow screenshot analysis cancellable without claiming a saved source", () => {
    expect(captureController).toContain("analysisAbortRef");
    expect(captureController).toContain("signal: controller.signal");
    expect(capturePanel).toContain("取消分析");
    expect(captureController).toContain(
      "分析已取消。未保存任何来源",
    );
    expect(captureController).toContain("所需时间比平时更长");
  });

  it("keeps identity creation blocked until the latest people lookup settles", () => {
    for (const panel of [captureController, startRelationshipPanel]) {
      expect(panel).toContain("const requestId = ++peopleRequestIdRef.current;");
      expect(panel).toContain("requestId !== peopleRequestIdRef.current");
      expect(panel).toContain("requestId === peopleRequestIdRef.current");
    }
    expect(capturePanel).toContain(
      'onChange={(event) => setContactName(event.target.value)}',
    );
    expect(captureController).toContain('type: "contact_changed"');
    expect(captureController).toContain("peopleLoading: true");
    expect(captureController).toContain("peopleLookupFailed: false");
    expect(startRelationshipPanel).toMatch(
      /onChange=\{\(event\) => \{\s*setPeopleLoading\(true\);\s*setPeopleLookupFailed\(false\);\s*setContactName/,
    );
    expect(startRelationshipPanel).toMatch(
      /!peopleLoading &&\s*!peopleLookupFailed &&\s*contactName\.trim\(\) &&\s*!contactQueryIsHandle \? \(/,
    );
  });

  it("reuses the original observation time with the retry idempotency key", () => {
    for (const panel of [
      startRelationshipPanel,
      relationshipResourceComposer,
    ]) {
      expect(panel).toContain(
        "const requestCapturedAtRef = useRef<string | null>(null);",
      );
      expect(panel).toContain(
        "requestCapturedAtRef.current = new Date().toISOString();",
      );
      expect(panel).toContain("captured_at: capturedAt");
    }
  });

  it("distinguishes same-name people with relationship context before selection", () => {
    expect(relationshipDisplay).toContain("function personContextSummary(");
    expect(capturePanel).toContain("personContextSummary(person)");
    expect(startRelationshipPanel).toContain("personContextSummary(person)");
    expect(personIdentityChoice).toContain("indistinguishablePersonIds");
    expect(capturePanel).toContain("capture-identity-ambiguity");
    expect(capturePanel).toContain("disabled={ambiguousPersonIds.has(person.id)}");
    expect(captureController).toContain("hasAmbiguousPeople");
  });

  it("gives direct Wiki compilation its own governed Agent path", () => {
    expect(component).toContain(
      "onCompile={() => void relationshipAgent.compileWiki()}",
    );
    expect(component).not.toContain(
      "onCompile={() => void relationshipAgent.ask()}",
    );
    expect(relationshipWiki).toContain("编译 Wiki");
  });

  it("keeps unresolved identity evidence outside the relationship until recruiter judgment", () => {
    expect(identityReviewCard).toContain(
      "来源已保存，但尚未进入任何人物的 Wiki",
    );
    expect(identityReviewCard).toContain('decision: "bind_existing" | "leave_unresolved"');
    expect(identityReviewCard).toContain("expected_case_version: identityCase.version");
    expect(identityReviewCard).toContain("选择联系人并不确认来源中的结论");
  });

  it("keeps new-person creation behind account-scoped identity lookup", () => {
    expect(agentCreatePersonCard).toContain(
      '"/api/local-integration/people/search"',
    );
    expect(agentCreatePersonCard).toContain("canCreateDistinctPerson({");
    expect(agentCreatePersonCard).toContain("当前归属：");
    expect(agentCreatePersonCard).toContain("审阅{duplicateMatches.length");
    expect(agentCreatePersonCard).toContain(
      "打开可逆的合并预览；此联系人草稿不会直接合并任何内容。",
    );
    expect(agentCreatePersonCard).toContain("它不会合并人物或联系任何人。");
  });

  it("keeps person merge as a current preview, reasoned decision, and reversible receipt", () => {
    expect(personMergeReview).toContain(
      "expected_preview_digest: preview.preview_digest",
    );
    expect(personMergeReview).toContain(
      "expected_source_version: preview.source_person.version",
    );
    expect(personMergeReview).toContain(
      "expected_target_version: preview.target_person.version",
    );
    expect(personMergeReview).toContain(
      'decision: "reverse_person_merge"',
    );
    expect(personMergeReview).toContain(
      "仅凭历史记录不能授权拆分。",
    );
    expect(personMergeReview).toContain(
      "不会进行外部写入",
    );
  });

  it("leaves no stale relationship shell after deleting its final source", () => {
    expect(component).toContain("function handleRelationshipRemoved(");
    expect(relationshipResourceComposer).toContain(
      "onEvidenceChanged(announcement, true)",
    );
    expect(component).toContain('window.history.replaceState(null, "", "/workspace")');
  });

  it("offers destination reconciliation instead of blind retry for unknown effects", () => {
    expect(relationshipNextMove).toContain(
      'effect.outcome.status === "unknown"',
    );
    expect(relationshipNextMove).toContain("重试前核对");
    expect(relationshipNextMove).toContain(
      "capture_id: workspace.capture.id",
    );
  });

  it("keeps effect reversal as review, approval, execution, and readback", () => {
    expect(relationshipNextMove).toContain("审阅撤销");
    expect(relationshipNextMove).toContain("批准精确撤销");
    expect(relationshipNextMove).toContain("移除事项并核验");
    expect(relationshipNextMove).toContain("撤回撤销批准");
    expect(relationshipNextMove).toContain("已移除，并核验为不存在");
    expect(relationshipNextMove).toContain(
      "reversalApprovalRequestRef.current",
    );
    expect(relationshipNextMove).toContain(
      "原始效果与两份审计回执",
    );
    expect(styles).toMatch(
      /\.context-effect-reversal__actions button,[\s\S]*min-height: 44px;/,
    );
    expect(styles).toMatch(
      /\.context-effect-reversal__decision > label:has\(input\) \{[\s\S]*?min-height: 44px;/,
    );
  });

  it("turns an invalidated approval into an explicit reapproval path", () => {
    expect(relationshipNextMove).toContain(
      "const staleApprovalNeedsReview =",
    );
    expect(relationshipNextMove).toContain("先前批准已过时。");
    expect(relationshipNextMove).toContain(
      "批准修订后的内部行动",
    );
    expect(relationshipNextMove).toContain(
      'approval === null || approval.status === "stale"',
    );
  });

  it("does not present unavailable source evidence as retained truth or no-action", () => {
    expect(relationshipContactHeader).toContain(
      'workspace.source_authorization.state !== "authorized"',
    );
    expect(relationshipFactReview).toContain("来源访问不可用。");
    expect(relationshipNextMove).toContain(
      "当前没有行动权限。",
    );
    expect(relationshipFactReview).toMatch(
      /先前结论与行动不会自动恢复/,
    );
  });

  it("refreshes the active review before announcing a source-authorization change", () => {
    expect(workspaceReadback).toContain(
      "const refreshWorkspaceReview = useCallback(",
    );
    expect(workspaceReadback).toContain("activeCaptureIdRef.current");
    expect(workspaceReadback).toContain(
      "relationshipWorkspaceReadbackBoundaryError",
    );
    expect(relationshipResourceComposer).toContain("await onEvidenceChanged(");
    expect(component).toMatch(
      /const refreshed = await refreshWorkspaceReview\(\s*workspace\.capture\.id,/,
    );
    expect(component).toContain(
      "当前审阅无法刷新；请重新加载后再作下一项决定。",
    );
  });

  it("separates current fact state from historical versions", () => {
    expect(relationshipEvidenceProjection).toContain(
      'state.state_status === "active"',
    );
    expect(relationshipEvidenceProjection).toContain(
      'state.state_status !== "active"',
    );
    expect(relationshipEvidenceProjection).toContain(
      "先前事实版本",
    );
    expect(relationshipWiki).toContain(
      'block.block_key.startsWith("fact.")',
    );
  });

  it("keeps display-only relationship projections outside command orchestration", () => {
    expect(component).toContain("<RelationshipContactHeader");
    expect(component).toContain("<RelationshipSourceLineage");
    expect(component).toContain("<RelationshipResourceSection");
    expect(component).toContain("<RelationshipOnboarding");
    expect(component).toContain("<RelationshipAgentStartPanel");
    expect(relationshipContactHeader).toContain(
      "从审阅状态得出，绝不用于评价此人。",
    );
    expect(relationshipSourceLineage).toContain(
      "由招聘顾问关联，不根据面孔猜测",
    );
    expect(relationshipResourceSection).toContain(
      "<RelationshipResourceComposer",
    );
    expect(relationshipOnboarding).toContain("<StartRelationshipPanel");
    expect(relationshipAgentStartPanel).toContain(
      "从一条消息开始。",
    );
    expect(relationshipAgentStartPanel).toContain(
      'placeholder="输入消息、粘贴内容或添加任何资料…"',
    );
  });

  it("binds Agent draft recovery and late responses to one canonical scope", () => {
    expect(relationshipAgentController).toContain(
      "${accountId}:${scope.person.id}:${scope.relationship_context.id}",
    );
    expect(relationshipAgentController).toContain("window.sessionStorage");
    expect(relationshipAgentController).toContain("new AbortController()");
    expect(relationshipAgentController).toContain(
      "signal: controller.signal",
    );
    expect(relationshipAgentController).toContain(
      "relationshipAgentResponseIsCurrent({",
    );
    expect(relationshipAgentController).toContain(
      "requestRef.current?.key !== requestConversationKey",
    );
  });

  it("resumes a prior Agent brief as a receipt without caching its answer body", () => {
    expect(relationshipHistory).toContain(
      'candidate.kind === "chat_brief"',
    );
    expect(relationshipHistory).toContain(
      'stale: operation.status !== "completed"',
    );
    expect(relationshipAgentPanel).toContain(
      "审计历史只保留这份限定范围的回执",
    );
    expect(relationshipAgentPanel).toContain(
      "不保留回答正文",
    );
    expect(relationshipAgentPanel).not.toContain("window.sessionStorage");
    expect(relationshipAgentPanel).toContain("aria-expanded={!collapsed}");
    expect(relationshipAgentPanel).toContain("展开关系智能助理");
  });

  it("blocks direct confirmation when a different active value needs supersession", () => {
    expect(relationshipFactReview).toContain(
      "const requiresSupersession = requiresFactSupersession({",
    );
    expect(relationshipFactReview).toContain("需要取代提案");
    expect(relationshipFactReview).toContain(
      "替换它需要一项独立且关联来源的取代提案",
    );
  });

  it("keeps destructive and duplicate-review controls finger-sized on phones", () => {
    expect(styles).toMatch(
      /@media \(max-width: 760px\) \{[\s\S]*\.context-person-merge--closed > button \{[^}]*min-height: 44px;/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 760px\) \{[\s\S]*\.context-danger-zone > \.context-text-button \{[^}]*min-height: 44px;/,
    );
  });

  it("keeps the full action path finger-sized in short landscape viewports", () => {
    expect(styles).toContain(
      "@media (min-width: 641px) and (max-width: 900px) and (max-height: 500px)",
    );
    expect(styles).toMatch(
      /\.context-agent-actions button,[\s\S]*\.context-danger-zone > \.context-text-button \{\s*min-height: 44px;/,
    );
    expect(styles).toMatch(
      /\.context-fact__actions \.context-icon-button \{\s*min-width: 44px;/,
    );
  });

  it("does not shrink the mobile add-source target below finger size", () => {
    expect(styles).toMatch(
      /@media \(max-width: 640px\) \{[\s\S]*?\.context-new-capture \{\s*flex: 0 0 44px;\s*width: 44px;/,
    );
  });
});
