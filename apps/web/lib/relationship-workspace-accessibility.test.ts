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
const styles = readFileSync(
  resolve(import.meta.dirname, "../app/globals.css"),
  "utf8",
);

const capturePanel = component.slice(
  component.indexOf("function CapturePanel("),
  component.indexOf("function ConversationTranscriptComposer("),
);
const startRelationshipPanel = component.slice(
  component.indexOf("function StartRelationshipPanel("),
  component.indexOf("function RelationshipResourceComposer("),
);
const relationshipResourceComposer = component.slice(
  component.indexOf("function RelationshipResourceComposer("),
  component.indexOf("function AgentIdentityReviewCard("),
);

describe("relationship workspace accessibility contract", () => {
  it("uses a modal primitive with named content and guarded dismissal", () => {
    expect(component).toContain('import * as Dialog from "@radix-ui/react-dialog"');
    expect(capturePanel).toContain("<Dialog.Root");
    expect(capturePanel).toContain("<Dialog.Title asChild>");
    expect(capturePanel).toContain("<Dialog.Description asChild>");
    expect(capturePanel).toContain("onEscapeKeyDown");
    expect(capturePanel).toContain("onPointerDownOutside");
  });

  it("restores focus after dismissal but prioritizes fact review after commit", () => {
    expect(capturePanel).toContain("returnTarget.focus({ preventScroll: true })");
    expect(capturePanel).toContain("committedRef.current = true");
    expect(component).toContain(
      "`/workspace?capture=${encodeURIComponent(next.capture.id)}#proposed-changes`,",
    );
  });

  it("keeps browser-local masking keyboard operable and announced", () => {
    expect(component).toContain(
      'aria-describedby="capture-redaction-help capture-redaction-status"',
    );
    expect(component).toContain(
      'aria-keyshortcuts="Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight Delete"',
    );
    expect(capturePanel).toContain('aria-live="polite"');
    expect(capturePanel).toContain("onKeyboardAdjust={adjustLatestRedaction}");
  });

  it("decodes local evidence into canvas without a user-controlled DOM URL", () => {
    expect(component).toContain("function BrowserLocalImage(");
    expect(component).toContain("createImageBitmap(source)");
    expect(capturePanel).not.toContain("URL.createObjectURL");
    expect(capturePanel).not.toContain("<img");
  });

  it("keeps slow screenshot analysis cancellable without claiming a saved source", () => {
    expect(capturePanel).toContain("analysisAbortRef");
    expect(capturePanel).toContain("signal: controller.signal");
    expect(capturePanel).toContain("Cancel analysis");
    expect(capturePanel).toContain(
      "Analysis canceled. No source was saved.",
    );
    expect(capturePanel).toContain("This is taking longer than usual.");
  });

  it("keeps identity creation blocked until the latest people lookup settles", () => {
    for (const panel of [capturePanel, startRelationshipPanel]) {
      expect(panel).toContain("const requestId = ++peopleRequestIdRef.current;");
      expect(panel).toContain("requestId !== peopleRequestIdRef.current");
      expect(panel).toContain("requestId === peopleRequestIdRef.current");
      expect(panel).toMatch(
        /onChange=\{\(event\) => \{\s*setPeopleLoading\(true\);\s*setPeopleLookupFailed\(false\);\s*setContactName/,
      );
    }
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
    expect(component).toContain("function personContextSummary(");
    expect(capturePanel).toContain("personContextSummary(person)");
    expect(startRelationshipPanel).toContain("personContextSummary(person)");
  });

  it("leaves no stale relationship shell after deleting its final source", () => {
    expect(component).toContain("function handleRelationshipRemoved(");
    expect(component).toContain("onEvidenceChanged(announcement, true)");
    expect(component).toContain('window.history.replaceState(null, "", "/workspace")');
  });

  it("offers destination reconciliation instead of blind retry for unknown effects", () => {
    expect(component).toContain('effect.outcome.status === "unknown"');
    expect(component).toContain("Reconcile before retry");
    expect(component).toContain("capture_id: workspace.capture.id");
  });

  it("keeps effect reversal as review, approval, execution, and readback", () => {
    expect(component).toContain("Review reversal");
    expect(component).toContain("Approve exact reversal");
    expect(component).toContain("Remove item and verify");
    expect(component).toContain("Revoke reversal approval");
    expect(component).toContain("Removed and verified absent");
    expect(component).toContain("reversalApprovalRequestRef.current");
    expect(component).toContain("Original effect and both audit receipts");
    expect(styles).toMatch(
      /\.context-effect-reversal__actions button,[\s\S]*min-height: 44px;/,
    );
    expect(styles).toMatch(
      /\.context-effect-reversal__decision > label:has\(input\) \{[\s\S]*?min-height: 44px;/,
    );
  });

  it("turns an invalidated approval into an explicit reapproval path", () => {
    expect(component).toContain("const staleApprovalNeedsReview =");
    expect(component).toContain("Prior approval is stale.");
    expect(component).toContain("Approve revised internal action");
    expect(component).toContain(
      'approval === null || approval.status === "stale"',
    );
  });

  it("does not present unavailable source evidence as retained truth or no-action", () => {
    expect(component).toContain("const sourceAuthorizationAvailable =");
    expect(component).toContain("Source access is unavailable.");
    expect(component).toContain("No action authority is available.");
    expect(component).toContain(
      "Its prior conclusions and actions will not return",
    );
  });

  it("refreshes the active review before announcing a source-authorization change", () => {
    expect(component).toContain("async function refreshWorkspaceReview(");
    expect(component).toContain("await onEvidenceChanged(");
    expect(component).toContain(
      "const refreshed = await refreshWorkspaceReview(\n                      workspace.capture.id,",
    );
    expect(component).toContain(
      "The current review could not refresh; reload before making another decision.",
    );
  });

  it("separates current fact state from historical versions", () => {
    expect(component).toContain("const activeConfirmedStates =");
    expect(component).toContain("const historicalConfirmedStates =");
    expect(component).toContain("Previous fact versions");
    expect(component).toContain('block.block_key.startsWith("fact.")');
  });

  it("blocks direct confirmation when a different active value needs supersession", () => {
    expect(component).toContain("const requiresSupersession = Boolean(");
    expect(component).toContain("Supersession required");
    expect(component).toContain(
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
