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

const capturePanel = component.slice(
  component.indexOf("function CapturePanel("),
  component.indexOf("function ConversationTranscriptComposer("),
);
const startRelationshipPanel = component.slice(
  component.indexOf("function StartRelationshipPanel("),
  component.indexOf("function RelationshipResourceComposer("),
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
});
