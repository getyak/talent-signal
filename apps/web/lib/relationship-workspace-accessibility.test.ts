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
const relationshipHistory = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/relationship-workspace/relationship-history.tsx",
  ),
  "utf8",
);

describe("relationship workspace accessibility contract", () => {
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
    expect(capturePanel).toContain("Cancel analysis");
    expect(captureController).toContain(
      "Analysis canceled. No source was saved.",
    );
    expect(captureController).toContain("This is taking longer than usual.");
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
  });

  it("keeps unresolved identity evidence outside the relationship until recruiter judgment", () => {
    expect(identityReviewCard).toContain(
      "The source is saved, but it is not part of either person",
    );
    expect(identityReviewCard).toContain('decision: "bind_existing" | "leave_unresolved"');
    expect(identityReviewCard).toContain("expected_case_version: identityCase.version");
    expect(identityReviewCard).toContain("Choosing a person does not confirm the source");
  });

  it("keeps new-person creation behind account-scoped identity lookup", () => {
    expect(agentCreatePersonCard).toContain(
      '"/api/local-integration/people/search"',
    );
    expect(agentCreatePersonCard).toContain("canCreateDistinctPerson({");
    expect(agentCreatePersonCard).toContain("Current owner:");
    expect(agentCreatePersonCard).toContain("It never merges or contacts anyone.");
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
      "History alone never authorizes the split.",
    );
    expect(personMergeReview).toContain(
      "performs no external write",
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
    expect(relationshipNextMove).toContain("Reconcile before retry");
    expect(relationshipNextMove).toContain(
      "capture_id: workspace.capture.id",
    );
  });

  it("keeps effect reversal as review, approval, execution, and readback", () => {
    expect(relationshipNextMove).toContain("Review reversal");
    expect(relationshipNextMove).toContain("Approve exact reversal");
    expect(relationshipNextMove).toContain("Remove item and verify");
    expect(relationshipNextMove).toContain("Revoke reversal approval");
    expect(relationshipNextMove).toContain("Removed and verified absent");
    expect(relationshipNextMove).toContain(
      "reversalApprovalRequestRef.current",
    );
    expect(relationshipNextMove).toContain(
      "Original effect and both audit receipts",
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
    expect(relationshipNextMove).toContain("Prior approval is stale.");
    expect(relationshipNextMove).toContain(
      "Approve revised internal action",
    );
    expect(relationshipNextMove).toContain(
      'approval === null || approval.status === "stale"',
    );
  });

  it("does not present unavailable source evidence as retained truth or no-action", () => {
    expect(relationshipContactHeader).toContain(
      'workspace.source_authorization.state !== "authorized"',
    );
    expect(relationshipFactReview).toContain("Source access is unavailable.");
    expect(relationshipNextMove).toContain(
      "No action authority is available.",
    );
    expect(relationshipFactReview).toMatch(
      /Its prior conclusions and actions\s+will not return/,
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
      "The current review could not refresh; reload before making another decision.",
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
      "Previous fact versions",
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
      "Derived from review state. It never rates the person.",
    );
    expect(relationshipSourceLineage).toContain(
      "Bound by the recruiter, not guessed from a face",
    );
    expect(relationshipResourceSection).toContain(
      "<RelationshipResourceComposer",
    );
    expect(relationshipOnboarding).toContain("<StartRelationshipPanel");
    expect(relationshipAgentStartPanel).toContain(
      "Start from the person, not a blank prompt.",
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
      "Audit history preserves this scoped receipt",
    );
    expect(relationshipAgentPanel).toContain(
      "not the answer body",
    );
    expect(relationshipAgentPanel).not.toContain("window.sessionStorage");
  });

  it("blocks direct confirmation when a different active value needs supersession", () => {
    expect(relationshipFactReview).toContain(
      "const requiresSupersession = requiresFactSupersession({",
    );
    expect(relationshipFactReview).toContain("Supersession required");
    expect(relationshipFactReview).toContain(
      "Replacing it requires a separate source-linked",
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
