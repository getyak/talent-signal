import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, "../../..");
const extensionRoot = path.join(repositoryRoot, "apps/chrome-extension/dist");
const evidenceRoot = path.join(
  repositoryRoot,
  "docs/evaluations/round-2/browser-extension",
);

function loadPlaywright() {
  const candidates = [];
  try {
    candidates.push("playwright");
  } catch {
    // Candidate resolution is attempted below.
  }

  try {
    const globalRoot = execFileSync("npm", ["root", "-g"], {
      encoding: "utf8",
    }).trim();
    candidates.push(
      path.join(globalRoot, "@playwright/test/node_modules/playwright"),
      path.join(globalRoot, "playwright"),
    );
  } catch {
    // The Homebrew fallback below remains available.
  }

  candidates.push(
    "/opt/homebrew/lib/node_modules/@playwright/test/node_modules/playwright",
  );

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Continue to the next installed Playwright location.
    }
  }
  throw new Error(
    "Playwright is unavailable. Install it or expose a local/global playwright package.",
  );
}

async function axeSource() {
  const virtualStore = path.join(repositoryRoot, "node_modules/.pnpm");
  const packages = await readdir(virtualStore);
  const axePackage = packages.find((name) => name.startsWith("axe-core@"));
  if (!axePackage) {
    throw new Error("axe-core is unavailable in the pnpm virtual store.");
  }
  return readFile(
    path.join(
      virtualStore,
      axePackage,
      "node_modules/axe-core/axe.min.js",
    ),
    "utf8",
  );
}

function relativeEvidence(file) {
  return path.relative(repositoryRoot, file);
}

async function screenshot(page, filename, { fullPage = true } = {}) {
  const target = path.join(evidenceRoot, filename);
  await page.screenshot({
    path: target,
    fullPage,
    animations: "disabled",
    scale: "device",
  });
  return relativeEvidence(target);
}

async function openExtensionPage(context, extensionId, query, viewport) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html${query}`);
  await page.locator("#review-view").waitFor({ state: "visible" });
  await page.locator("#review-heading").waitFor({ state: "visible" });
  return page;
}

async function stateSnapshot(page, id, screenshotFile) {
  const metrics = await page.evaluate(() => {
    const scrolling = document.scrollingElement;
    const status = document.querySelector("#submission-status");
    const focused = document.activeElement;
    return {
      title: document.title,
      viewport: {
        inner_width: window.innerWidth,
        inner_height: window.innerHeight,
        device_pixel_ratio: window.devicePixelRatio,
        visual_scale: window.visualViewport?.scale ?? null,
      },
      document: {
        client_width: scrolling?.clientWidth ?? null,
        scroll_width: scrolling?.scrollWidth ?? null,
        client_height: scrolling?.clientHeight ?? null,
        scroll_height: scrolling?.scrollHeight ?? null,
        horizontal_overflow:
          Boolean(scrolling) && scrolling.scrollWidth > scrolling.clientWidth + 1,
      },
      focused: {
        id: focused?.id ?? null,
        tag: focused?.tagName?.toLowerCase() ?? null,
        text: focused?.textContent?.trim().slice(0, 160) ?? null,
      },
      review_visible:
        document.querySelector("#review-view")?.hidden === false,
      capture_visible:
        document.querySelector("#capture-view")?.hidden === false,
      capture_alert:
        document.querySelector("#capture-alert")?.hidden === false
          ? {
              title:
                document
                  .querySelector("#capture-alert-title")
                  ?.textContent?.trim() ?? null,
              copy:
                document
                  .querySelector("#capture-alert-copy")
                  ?.textContent?.trim() ?? null,
            }
          : null,
      session_state:
        document.querySelector("#session-state")?.textContent?.trim() ?? null,
      disposition:
        document.querySelector("#fixture-disposition")?.textContent?.trim() ??
        null,
      submission: status?.hidden
        ? null
        : {
            state: status?.dataset.state ?? null,
            title:
              document.querySelector("#submission-title")?.textContent?.trim() ??
              null,
            copy:
              document.querySelector("#submission-copy")?.textContent?.trim() ??
              null,
          },
      local_deleted:
        document.querySelector("#local-cleared")?.hidden === false,
      primary_action: {
        label:
          document.querySelector("#submit-button")?.textContent?.trim() ?? null,
        disabled:
          document.querySelector("#submit-button")?.disabled ?? null,
      },
    };
  });

  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(50);
  return {
    id,
    screenshot: await screenshot(page, screenshotFile),
    ...metrics,
  };
}

async function checkSyntheticSession(page) {
  await page.locator("#check-session").click();
  await page
    .locator("#session-state")
    .filter({ hasText: /Synthetic session/ })
    .waitFor();
}

async function approve(page) {
  await page.locator("#approval-check").check();
  await page.locator("#submit-button").waitFor({ state: "visible" });
}

async function submitAndWait(page, state) {
  await page.locator("#submit-button").click();
  await page
    .locator("#submission-status")
    .filter({ has: page.locator(`[data-state="${state}"]`) })
    .waitFor()
    .catch(async () => {
      await page.waitForFunction(
        (expected) =>
          document.querySelector("#submission-status")?.dataset.state ===
          expected,
        state,
      );
    });
}

async function runAxe(page, axeText, label) {
  await page.evaluate(axeText);
  const result = await page.evaluate(async () => {
    const audit = await globalThis.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
      },
    });
    return {
      url: audit.url,
      timestamp: audit.timestamp,
      test_engine: audit.testEngine,
      test_environment: audit.testEnvironment,
      violations: audit.violations,
      incomplete: audit.incomplete,
      passes_count: audit.passes.length,
      inapplicable_count: audit.inapplicable.length,
    };
  });
  return { label, ...result };
}

async function accessibilityTranscript(context, page) {
  const session = await context.newCDPSession(page);
  const { nodes } = await session.send("Accessibility.getFullAXTree");
  const transcript = nodes
    .filter((item) => !item.ignored)
    .map((item) => ({
      role: item.role?.value ?? null,
      name: item.name?.value ?? null,
      value: item.value?.value ?? null,
      description: item.description?.value ?? null,
      properties: Object.fromEntries(
        (item.properties ?? [])
          .filter((property) =>
            [
              "checked",
              "disabled",
              "expanded",
              "focused",
              "invalid",
              "live",
              "multiline",
              "required",
              "selected",
            ].includes(property.name),
          )
          .map((property) => [property.name, property.value?.value ?? null]),
      ),
    }))
    .filter(
      (item) =>
        item.name ||
        [
          "RootWebArea",
          "main",
          "banner",
          "contentinfo",
          "status",
        ].includes(item.role),
    );
  await session.detach();
  return transcript;
}

async function installAriaObserver(page) {
  await page.evaluate(() => {
    globalThis.__talentSignalAriaLog = [];
    const liveNodes = [
      ...document.querySelectorAll(
        "[aria-live]:not([aria-live='off']), [role='alert']",
      ),
    ];
    const observer = new MutationObserver(() => {
      for (const element of liveNodes) {
        const text = element.textContent?.replace(/\s+/g, " ").trim();
        if (!element.hidden && text) {
          const last = globalThis.__talentSignalAriaLog.at(-1);
          if (last?.text !== text) {
            globalThis.__talentSignalAriaLog.push({
              at: new Date().toISOString(),
              role: element.getAttribute("role"),
              live: element.getAttribute("aria-live"),
              text,
            });
          }
        }
      }
    });
    liveNodes.forEach((node) =>
      observer.observe(node, {
        attributes: true,
        attributeFilter: ["hidden", "aria-busy"],
        characterData: true,
        childList: true,
        subtree: true,
      }),
    );
    globalThis.__talentSignalAriaObserver = observer;
  });
}

async function focusedControl(page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    const style = getComputedStyle(element);
    const label =
      element?.getAttribute("aria-label") ||
      element?.labels?.[0]?.textContent?.replace(/\s+/g, " ").trim() ||
      element?.textContent?.replace(/\s+/g, " ").trim() ||
      element?.getAttribute("name") ||
      "";
    return {
      id: element?.id ?? null,
      tag: element?.tagName?.toLowerCase() ?? null,
      type: element?.getAttribute("type") ?? null,
      label: label.slice(0, 220),
      outline_style: style.outlineStyle,
      outline_width: style.outlineWidth,
      outline_color: style.outlineColor,
      checked: element?.checked ?? null,
      disabled: element?.disabled ?? null,
    };
  });
}

async function keyboardOnlyFlow(context, extensionId) {
  const page = await openExtensionPage(
    context,
    extensionId,
    "?mode=fixture&case=TS-CORE-01&scenario=received",
    { width: 390, height: 844 },
  );
  await installAriaObserver(page);
  const focusOrder = [await focusedControl(page)];
  const network = [];
  let submitted = false;
  page.on("request", (request) => {
    if (["fetch", "xhr"].includes(request.resourceType())) {
      network.push({
        phase: submitted ? "after_submit" : "before_submit",
        method: request.method(),
        resource_type: request.resourceType(),
        url: request.url(),
      });
    }
  });

  let approved = false;
  let focusScreenshot = null;
  for (let index = 0; index < 60 && !submitted; index += 1) {
    await page.keyboard.press("Tab");
    const focused = await focusedControl(page);
    focusOrder.push(focused);

    if (focused.id === "check-session") {
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () =>
          document.querySelector("#session-state")?.textContent?.trim() ===
          "Synthetic session",
      );
    } else if (focused.id === "approval-check") {
      await page.keyboard.press("Space");
      approved = await page.locator("#approval-check").isChecked();
    } else if (focused.id === "submit-button" && approved) {
      focusScreenshot = await screenshot(
        page,
        "15-keyboard-visible-focus-submit.png",
        { fullPage: false },
      );
      await page.keyboard.press("Enter");
      submitted = true;
      await page.waitForFunction(
        () =>
          document.querySelector("#submission-status")?.dataset.state ===
          "received",
      );
    }
  }

  const apiRequests = network.filter((request) =>
    request.url.includes("/api/browser-extension/captures"),
  );
  const ariaLog = await page.evaluate(
    () => globalThis.__talentSignalAriaLog ?? [],
  );
  const axTree = await accessibilityTranscript(context, page);
  const result = {
    completed: submitted,
    approval_reached: approved,
    final_state: await page
      .locator("#submission-status")
      .getAttribute("data-state"),
    focus_screenshot: focusScreenshot,
    focus_order: focusOrder,
    every_keyboard_focus_has_visible_outline: focusOrder
      .filter((item) => item.tag && item.id !== "review-heading")
      .every(
        (item) =>
          item.outline_style !== "none" &&
          Number.parseFloat(item.outline_width) >= 2,
      ),
    fetch_xhr_requests: network,
    capture_api_requests: apiRequests,
    pre_submit_capture_api_silence: apiRequests.every(
      (request) => request.phase !== "before_submit",
    ),
    aria_live_transcript: ariaLog,
    accessibility_tree: axTree,
  };
  await page.close();
  return result;
}

const { chromium } = loadPlaywright();
await mkdir(evidenceRoot, { recursive: true });
const axeText = await axeSource();
const userDataDir = await mkdtemp(
  path.join(os.tmpdir(), "talent-signal-extension-round-2-"),
);
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: "chromium",
  headless: true,
  args: [
    `--disable-extensions-except=${extensionRoot}`,
    `--load-extension=${extensionRoot}`,
  ],
  viewport: { width: 390, height: 844 },
});

const run = {
  run_id: "TS-browser-extension-round-2",
  created_at: new Date().toISOString(),
  environment: {
    browser: await context.browser()?.version?.(),
    target: "Playwright bundled Chromium persistent context",
    headless: true,
    package: relativeEvidence(extensionRoot),
    real_candidate_data: false,
    external_writes: false,
  },
  service_worker: null,
  extension_id: null,
  states: [],
  accessibility: [],
  keyboard_only_flow: null,
  media: {},
  zoom: {},
  caveat:
    "This proves the built unpacked package in Playwright Chromium. It is not user Google Chrome chrome://extensions, toolbar, or positive activeTab evidence and does not resolve XS-CAPTURE-01.",
};

try {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent("serviceworker");
  run.service_worker = worker.url();
  run.extension_id = new URL(worker.url()).host;
  const extensionId = run.extension_id;

  const core = await openExtensionPage(
    context,
    extensionId,
    "?mode=fixture&case=TS-CORE-01&scenario=received",
    { width: 390, height: 844 },
  );
  run.states.push(
    await stateSnapshot(core, "core_review", "01-core-review-390.png"),
  );
  run.accessibility.push(await runAxe(core, axeText, "core_review_390"));
  await core.close();

  const empty = await openExtensionPage(
    context,
    extensionId,
    "?mode=fixture&case=TS-CORE-02&scenario=received",
    { width: 320, height: 760 },
  );
  run.states.push(
    await stateSnapshot(
      empty,
      "no_action_empty",
      "02-no-action-empty-320.png",
    ),
  );
  await empty.close();

  const ambiguity = await openExtensionPage(
    context,
    extensionId,
    "?mode=fixture&case=TS-CORE-03&scenario=received",
    { width: 390, height: 844 },
  );
  run.states.push(
    await stateSnapshot(
      ambiguity,
      "ambiguity",
      "03-ambiguity-390.png",
    ),
  );
  await ambiguity.close();

  const permission = await context.newPage();
  await permission.setViewportSize({ width: 390, height: 760 });
  await permission.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await permission.locator("#capture-view").waitFor({ state: "visible" });
  const restricted = await context.newPage();
  await restricted.goto("chrome://version");
  await restricted.bringToFront();
  await permission.evaluate(() =>
    document.querySelector("#capture-selection")?.click(),
  );
  await permission.locator("#capture-alert").waitFor({ state: "visible" });
  run.states.push(
    await stateSnapshot(
      permission,
      "permission_denied",
      "04-permission-denied-390.png",
    ),
  );
  await restricted.close();
  await permission.close();

  const offline = await openExtensionPage(
    context,
    extensionId,
    "?mode=fixture&case=TS-CORE-01&scenario=offline",
    { width: 390, height: 844 },
  );
  await checkSyntheticSession(offline);
  await approve(offline);
  await offline.locator("#submit-button").click();
  run.states.push(
    await stateSnapshot(
      offline,
      "loading",
      "05-loading-pending-390.png",
    ),
  );
  await offline.waitForFunction(
    () => document.querySelector("#submission-status")?.dataset.state === "failed",
  );
  run.states.push(
    await stateSnapshot(offline, "offline", "06-offline-failed-390.png"),
  );
  await offline.locator("#submit-button").click();
  await offline.waitForFunction(
    () =>
      document.querySelector("#submission-status")?.dataset.state === "received",
  );
  run.states.push(
    await stateSnapshot(
      offline,
      "retry_received",
      "07-offline-retry-received-390.png",
    ),
  );
  await offline.close();

  const unknown = await openExtensionPage(
    context,
    extensionId,
    "?mode=fixture&case=TS-CORE-01&scenario=unknown_then_received",
    { width: 390, height: 844 },
  );
  await checkSyntheticSession(unknown);
  await approve(unknown);
  await unknown.locator("#submit-button").click();
  await unknown.waitForFunction(
    () =>
      document.querySelector("#submission-status")?.dataset.state === "unknown",
  );
  run.states.push(
    await stateSnapshot(unknown, "unknown", "08-unknown-receipt-390.png"),
  );
  await unknown.locator("#check-receipt").click();
  await unknown.waitForFunction(
    () =>
      document.querySelector("#submission-status")?.dataset.state === "received",
  );
  run.states.push(
    await stateSnapshot(
      unknown,
      "unknown_reconciled",
      "09-unknown-reconciled-390.png",
    ),
  );
  await unknown.close();

  const stale = await openExtensionPage(
    context,
    extensionId,
    "?mode=fixture&case=TS-CORE-01&scenario=stale_session",
    { width: 390, height: 844 },
  );
  await checkSyntheticSession(stale);
  await approve(stale);
  await stale.locator("#submit-button").click();
  await stale.waitForFunction(
    () => document.querySelector("#submission-status")?.dataset.state === "failed",
  );
  run.states.push(
    await stateSnapshot(stale, "stale_session", "10-stale-session-390.png"),
  );
  await checkSyntheticSession(stale);
  await stale.locator("#submit-button").click();
  await stale.waitForFunction(
    () =>
      document.querySelector("#submission-status")?.dataset.state === "received",
  );
  run.states.push(
    await stateSnapshot(
      stale,
      "stale_recovered",
      "11-stale-recovered-390.png",
    ),
  );
  await stale.close();

  const long320 = await openExtensionPage(
    context,
    extensionId,
    "?mode=fixture&audit=long-mixed-text&scenario=received",
    { width: 320, height: 760 },
  );
  run.states.push(
    await stateSnapshot(
      long320,
      "long_mixed_320",
      "12-long-mixed-text-320.png",
    ),
  );
  run.accessibility.push(await runAxe(long320, axeText, "long_mixed_320"));
  await long320.close();

  const long390 = await openExtensionPage(
    context,
    extensionId,
    "?mode=fixture&audit=long-mixed-text&scenario=received",
    { width: 390, height: 844 },
  );
  run.states.push(
    await stateSnapshot(
      long390,
      "long_mixed_390",
      "13-long-mixed-text-390.png",
    ),
  );
  const zoomBefore = await long390.evaluate(async () => {
    const tab = await chrome.tabs.getCurrent();
    return {
      tab_id: tab?.id ?? null,
      zoom: tab?.id ? await chrome.tabs.getZoom(tab.id) : null,
      inner_width: innerWidth,
    };
  });
  await long390.evaluate(async () => {
    const tab = await chrome.tabs.getCurrent();
    if (!tab?.id) {
      throw new Error("Current extension tab was unavailable for zoom.");
    }
    await chrome.tabs.setZoom(tab.id, 2);
  });
  const zoomCaptureSession = await context.newCDPSession(long390);
  await zoomCaptureSession.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: false,
    screenWidth: 390,
    screenHeight: 844,
  });
  await long390.waitForTimeout(200);
  const zoomAfter = await long390.evaluate(async () => {
    const tab = await chrome.tabs.getCurrent();
    const scrolling = document.scrollingElement;
    return {
      tab_id: tab?.id ?? null,
      zoom: tab?.id ? await chrome.tabs.getZoom(tab.id) : null,
      inner_width: innerWidth,
      client_width: scrolling?.clientWidth ?? null,
      scroll_width: scrolling?.scrollWidth ?? null,
      horizontal_overflow:
        Boolean(scrolling) && scrolling.scrollWidth > scrolling.clientWidth + 1,
      clipped_elements: [...document.body.querySelectorAll("*")]
        .filter((element) => {
          if (
            element.classList.contains("sr-only") ||
            ["TEXTAREA", "SELECT", "CANVAS"].includes(element.tagName)
          ) {
            return false;
          }
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            rect.width === 0 ||
            rect.height === 0
          ) {
            return false;
          }
          return (
            rect.left < -1 ||
            rect.right > innerWidth + 1 ||
            (["hidden", "clip"].includes(style.overflowX) &&
              element.scrollWidth > element.clientWidth + 1)
          );
        })
        .slice(0, 30)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            id: element.id || null,
            class_name:
              typeof element.className === "string"
                ? element.className
                : null,
            text: element.textContent?.replace(/\s+/g, " ").trim().slice(0, 120),
            left: rect.left,
            right: rect.right,
            viewport_width: innerWidth,
          };
        }),
    };
  });
  run.zoom = {
    before: zoomBefore,
    after: zoomAfter,
    screenshot: await screenshot(long390, "14-long-mixed-200-percent-zoom.png"),
  };
  await zoomCaptureSession.send("Emulation.clearDeviceMetricsOverride");
  await zoomCaptureSession.detach();
  await long390.evaluate(async () => {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id) {
      await chrome.tabs.setZoom(tab.id, 1);
    }
  });
  await long390.setViewportSize({ width: 195, height: 844 });
  run.states.push(
    await stateSnapshot(
      long390,
      "long_mixed_195_css_reflow_equivalent",
      "14b-long-mixed-195-css-pixel-reflow.png",
    ),
  );
  await long390.setViewportSize({ width: 390, height: 844 });

  await long390.emulateMedia({
    colorScheme: "dark",
    reducedMotion: "reduce",
    contrast: "more",
  });
  const reducedMotion = await long390.evaluate(() => {
    const button = document.querySelector("#submit-button");
    const style = getComputedStyle(button);
    return {
      media_matches: matchMedia("(prefers-reduced-motion: reduce)").matches,
      contrast_more_matches: matchMedia("(prefers-contrast: more)").matches,
      transition_duration: style.transitionDuration,
      transition_property: style.transitionProperty,
      animation_name: style.animationName,
    };
  });
  run.media.reduced_motion_increased_contrast = {
    ...reducedMotion,
    screenshot: await screenshot(
      long390,
      "16-dark-increased-contrast-reduced-motion.png",
    ),
  };
  run.accessibility.push(
    await runAxe(long390, axeText, "dark_increased_contrast_reduced_motion"),
  );
  const mediaSession = await context.newCDPSession(long390);
  await mediaSession.send("Emulation.setEmulatedVisionDeficiency", {
    type: "achromatopsia",
  });
  run.media.grayscale = {
    emulation: "achromatopsia",
    screenshot: await screenshot(long390, "17-grayscale-state-semantics.png"),
  };
  await mediaSession.send("Emulation.setEmulatedVisionDeficiency", {
    type: "none",
  });
  await mediaSession.detach();
  await long390.close();

  const deleted = await openExtensionPage(
    context,
    extensionId,
    "?mode=fixture&audit=long-mixed-text&scenario=received",
    { width: 390, height: 844 },
  );
  await checkSyntheticSession(deleted);
  await approve(deleted);
  await deleted.locator("#submit-button").click();
  await deleted.waitForFunction(
    () =>
      document.querySelector("#submission-status")?.dataset.state === "received",
  );
  await deleted.locator("#local-cleared").waitFor({ state: "visible" });
  run.states.push(
    await stateSnapshot(
      deleted,
      "local_deleted",
      "18-local-deleted-backend-unverified-390.png",
    ),
  );
  await deleted.close();

  run.keyboard_only_flow = await keyboardOnlyFlow(context, extensionId);
} finally {
  await context.close();
}

const axeViolations = run.accessibility.flatMap((audit) =>
  audit.violations.map((violation) => ({
    audit: audit.label,
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.length,
  })),
);
run.summary = {
  state_count: run.states.length,
  horizontal_overflow_states: run.states
    .filter((state) => state.document.horizontal_overflow)
    .map((state) => state.id),
  axe_audit_count: run.accessibility.length,
  axe_violation_count: axeViolations.length,
  axe_violations: axeViolations,
  keyboard_only_completed: run.keyboard_only_flow?.completed ?? false,
  pre_submit_capture_api_silence:
    run.keyboard_only_flow?.pre_submit_capture_api_silence ?? false,
  active_veto:
    "XS-CAPTURE-01 remains active: no user Google Chrome chrome://extensions/toolbar positive activeTab evidence.",
};

const jsonPath = path.join(evidenceRoot, "loaded-package-evidence.json");
await writeFile(jsonPath, `${JSON.stringify(run, null, 2)}\n`);

const transcriptPath = path.join(evidenceRoot, "screen-reader-transcript.txt");
const transcriptLines = [
  "# Chromium accessibility-tree and ARIA transcript",
  "",
  "This is generated from the loaded unpacked package's Chromium accessibility tree and live-region mutations. It is not a human screen-reader usability session and not user Google Chrome toolbar evidence.",
  "",
  "## Keyboard focus order",
  ...run.keyboard_only_flow.focus_order.map(
    (item, index) =>
      `${index + 1}. ${item.tag ?? "unknown"}#${item.id ?? ""} — ${item.label || "(no accessible text)"} — outline ${item.outline_width} ${item.outline_style}`,
  ),
  "",
  "## ARIA live regions",
  ...run.keyboard_only_flow.aria_live_transcript.map(
    (item, index) =>
      `${index + 1}. [${item.role ?? "none"}/${item.live ?? "off"}] ${item.text}`,
  ),
  "",
  "## Accessibility tree",
  ...run.keyboard_only_flow.accessibility_tree.map(
    (item, index) =>
      `${index + 1}. ${item.role ?? "unknown"} — ${item.name ?? ""}${item.value ? ` — value: ${item.value}` : ""}${Object.keys(item.properties).length ? ` — ${JSON.stringify(item.properties)}` : ""}`,
  ),
  "",
];
await writeFile(transcriptPath, `${transcriptLines.join("\n")}\n`);

process.stdout.write(
  `${JSON.stringify({
    evidence: relativeEvidence(jsonPath),
    transcript: relativeEvidence(transcriptPath),
    extension_id: run.extension_id,
    state_count: run.summary.state_count,
    axe_violation_count: run.summary.axe_violation_count,
    keyboard_only_completed: run.summary.keyboard_only_completed,
    horizontal_overflow_states: run.summary.horizontal_overflow_states,
    zoom: run.zoom,
    caveat: run.caveat,
  }, null, 2)}\n`,
);
