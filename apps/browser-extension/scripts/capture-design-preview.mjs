import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, "../../..");
const extensionRoot = path.join(repositoryRoot, "apps/chrome-extension/dist");
const outputRoot = path.join(
  repositoryRoot,
  "output/playwright/browser-extension-capture-lens",
);
const syntheticScreenshot = path.join(
  repositoryRoot,
  "apps/web/public/marketing/signal-journey/wechat-synthetic.webp",
);

function loadPlaywright() {
  const candidates = [];
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
      // Continue to the next installed package.
    }
  }
  throw new Error(
    "Playwright is unavailable. Install @playwright/test globally and its Chromium browser before capturing the optional design preview.",
  );
}

async function capture(page, filename, fullPage = true) {
  const target = path.join(outputRoot, filename);
  await page.evaluate(() => document.activeElement?.blur());
  await page.screenshot({
    path: target,
    fullPage,
    animations: "disabled",
    scale: "device",
  });
  return path.relative(repositoryRoot, target);
}

async function extensionPage(context, extensionId, query = "") {
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html${query}`);
  return page;
}

async function layoutCheck(page, state) {
  return page.evaluate((stateLabel) => {
    const root = document.scrollingElement;
    return {
      state: stateLabel,
      viewport_width: window.innerWidth,
      scroll_width: root?.scrollWidth ?? null,
      horizontal_overflow:
        Boolean(root) && root.scrollWidth > root.clientWidth + 1,
      active_element: document.activeElement?.id ?? null,
    };
  }, state);
}

const { chromium } = loadPlaywright();
await mkdir(outputRoot, { recursive: true });
const userDataDir = await mkdtemp(
  path.join(os.tmpdir(), "talent-signal-capture-lens-"),
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

const artifacts = [];
const checks = [];
try {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;

  const entry = await extensionPage(context, extensionId);
  await entry.locator("#capture-view").waitFor({ state: "visible" });
  checks.push(await layoutCheck(entry, "entry-light-390"));
  artifacts.push(await capture(entry, "01-capture-lens-light-390.png"));
  await entry.close();

  const screenshotReview = await extensionPage(context, extensionId);
  await screenshotReview.locator("#capture-view").waitFor({ state: "visible" });
  await screenshotReview.locator("#upload-image").setInputFiles(
    syntheticScreenshot,
  );
  await screenshotReview.locator("#screenshot-review").waitFor({
    state: "visible",
  });
  checks.push(await layoutCheck(screenshotReview, "screenshot-review-390"));
  artifacts.push(
    await capture(screenshotReview, "02-screenshot-review-light-390.png"),
  );
  await screenshotReview.close();

  const fixture = await extensionPage(
    context,
    extensionId,
    "?mode=fixture&case=TS-CORE-01&scenario=received",
  );
  await fixture.locator("#review-view").waitFor({ state: "visible" });
  checks.push(await layoutCheck(fixture, "evidence-review-390"));
  artifacts.push(await capture(fixture, "03-evidence-review-light-390.png"));
  await fixture.locator("#check-session").click();
  await fixture.locator("#session-state").filter({
    hasText: "Synthetic session",
  }).waitFor();
  await fixture.locator("#approval-check").check();
  await fixture.locator("#submit-button").click();
  await fixture.waitForFunction(
    () =>
      document.querySelector("#submission-status")?.dataset.state ===
      "received",
  );
  await fixture.locator(".dispatch-shell").scrollIntoViewIfNeeded();
  artifacts.push(
    await capture(fixture, "04-receipt-dispatch-light-390.png", false),
  );
  await fixture.close();

  const dark = await extensionPage(context, extensionId);
  await dark.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await dark.reload();
  await dark.locator("#capture-view").waitFor({ state: "visible" });
  checks.push(await layoutCheck(dark, "entry-dark-390"));
  artifacts.push(await capture(dark, "05-capture-lens-dark-390.png"));
  await dark.close();

  const narrow = await extensionPage(context, extensionId);
  await narrow.setViewportSize({ width: 320, height: 760 });
  await narrow.locator("#capture-view").waitFor({ state: "visible" });
  checks.push(await layoutCheck(narrow, "entry-light-320"));
  artifacts.push(await capture(narrow, "06-capture-lens-light-320.png"));
  await narrow.close();

  process.stdout.write(
    `${JSON.stringify({ extension_id: extensionId, artifacts, checks }, null, 2)}\n`,
  );
} finally {
  await context.close();
}
