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

  const current=await activeTab();
  if(current.id!==tab.id||current.url!==tab.url)throw new Error("The source tab changed during capture. Capture again from the intended page.");
  return {
    ok: true,
    kind: "visible_tab",
    source: normalizeTabSource(tab),
    data_url: dataUrl,
  };
}

async function captureSelectedText(page = false) {
  const tab = await activeTab();
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [page],
    func: (wholePage) => wholePage ? (document.querySelector("main, article") ?? document.body).innerText : globalThis.getSelection?.()?.toString() ?? "",
  });
  const selection = normalizeSelection(result);

  if (!selection.ok) {
    return selection;
  }

  return {
    ok: true,
    kind: page ? "page_text" : "selected_text",
    source: normalizeTabSource(tab),
    text: selection.text,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!["capture.visible", "capture.selection", "capture.page"].includes(message?.type)) {
    return false;
  }

  const operation =
    message.type === "capture.visible"
      ? captureVisibleSource()
      : captureSelectedText(message.type === "capture.page");

  operation
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, ...classifyCaptureError(error) }));

  return true;
});
