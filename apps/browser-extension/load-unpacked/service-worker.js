import {
  classifyCaptureError,
  normalizeSelection,
  normalizeTabSource,
} from "./lib/capture-contract.js";

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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
