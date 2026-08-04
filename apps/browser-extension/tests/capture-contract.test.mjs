import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyCaptureError,
  MAX_SELECTION_CHARACTERS,
  normalizeSelection,
  normalizeTabSource,
} from "../load-unpacked/lib/capture-contract.js";

test("normalizes only the active source metadata supplied by Chrome", () => {
  assert.deepEqual(
    normalizeTabSource(
      {
        title: "  Candidate conversation  ",
        url: "https://example.test/messages/1",
        favIconUrl: "https://example.test/private-icon",
        history: ["should not be copied"],
      },
      "2026-08-05T09:00:00.000Z",
    ),
    {
      title: "Candidate conversation",
      url: "https://example.test/messages/1",
      captured_at: "2026-08-05T09:00:00.000Z",
    },
  );
});

test("rejects empty and over-broad text selections", () => {
  assert.equal(normalizeSelection("   ").code, "empty_selection");
  assert.equal(
    normalizeSelection("x".repeat(MAX_SELECTION_CHARACTERS + 1)).code,
    "selection_too_large",
  );
  assert.deepEqual(normalizeSelection("  exact excerpt  "), {
    ok: true,
    text: "exact excerpt",
  });
});

test("turns temporary-access denial into a truthful retry instruction", () => {
  const result = classifyCaptureError(
    new Error("Cannot access contents of the page. Extension manifest must request permission."),
  );
  assert.equal(result.code, "permission_denied");
  assert.match(result.message, /toolbar icon/i);
  assert.doesNotMatch(result.message, /uploaded|received|saved/i);
});

test("keeps an unclassified capture failure distinct from permission denial", () => {
  const result = classifyCaptureError(new Error("Image encoder failed"));
  assert.equal(result.code, "capture_failed");
  assert.match(result.message, /Nothing was submitted/i);
});
