import {
  classifyCaptureError,
  normalizeSelection,
  normalizeTabSource,
} from "./lib/capture-contract.js";
import { contactTaskFromReviewedImage, contactTaskReviewURL, submitContactTaskInWeb } from "./lib/contact-handoff.js";
import { normalizeLocalOrigin } from "./lib/handoff-contract.js";

async function handoffReviewedImage(envelope) {
  const origin = normalizeLocalOrigin(envelope.handoff_target), payload = await contactTaskFromReviewedImage(envelope);
  const tab = await chrome.tabs.create({ url: `${origin}/contact-agent?source=browser-extension` });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const current = await chrome.tabs.get(tab.id);
    if (current.status === "complete") break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const current = await chrome.tabs.get(tab.id);
  if (new URL(current.url).origin !== origin || new URL(current.url).pathname !== "/contact-agent") {
    return { state: "failed", code: "session_stale", message: "Sign in to the intended Web account, then retry the same reviewed image." };
  }
  // Chrome executes the supplied function in the exact tab and awaits its
  // Promise. No bearer token, broad host permission or new backend bypass.
  const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN",
    func: submitContactTaskInWeb, args: [origin, envelope.session.version, payload] });
  if (result.result?.contact_task_id) await chrome.tabs.update(tab.id, { url: contactTaskReviewURL(origin, result.result.contact_task_id) });
  return result.result;
}

async function enableActionPanel() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

enableActionPanel().catch(() => {
  // The panel can still be opened from Chrome's side-panel menu.
});

chrome.runtime.onInstalled.addListener(() => {
  enableActionPanel().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  enableActionPanel().catch(() => {});
});

async function activeTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });

  if (!tab?.id || typeof tab.windowId !== "number") {
    throw new Error("No active tab is available.");
  }

  return tab;
}

async function captureVisibleSource() {
  const tab = await activeTab();
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png",
  });

  return {
    ok: true,
    kind: "visible_tab",
    source: normalizeTabSource(tab),
    data_url: dataUrl,
  };
}

async function captureSelectedText() {
  const tab = await activeTab();
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => globalThis.getSelection?.()?.toString() ?? "",
  });
  const selection = normalizeSelection(result);

  if (!selection.ok) {
    return selection;
  }

  return {
    ok: true,
    kind: "selected_text",
    source: normalizeTabSource(tab),
    text: selection.text,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "handoff.reviewed-image" && sender.id === chrome.runtime.id) {
    handoffReviewedImage(message.envelope).then(sendResponse).catch(() => sendResponse({ state: "unknown",
      code: "contact_handoff_unverified", message: "Receipt not verified. Retry the same reviewed image to recover the existing task without duplicating it." }));
    return true;
  }
  if (!["capture.visible", "capture.selection"].includes(message?.type)) {
    return false;
  }

  const operation =
    message.type === "capture.visible"
      ? captureVisibleSource()
      : captureSelectedText();

  operation
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, ...classifyCaptureError(error) }));

  return true;
});
