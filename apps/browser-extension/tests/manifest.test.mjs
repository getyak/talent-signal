import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(here, "../load-unpacked");
const manifest = JSON.parse(
  await readFile(path.join(extensionRoot, "manifest.json"), "utf8"),
);
const html = await readFile(path.join(extensionRoot, "sidepanel.html"), "utf8");
const css = await readFile(path.join(extensionRoot, "sidepanel.css"), "utf8");

test("uses Manifest V3 and the exact minimum permission set", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, [
    "activeTab",
    "scripting",
    "sidePanel",
  ]);
  assert.deepEqual(manifest.host_permissions, [
    "http://localhost/*",
    "http://127.0.0.1/*",
  ]);
  assert.equal(manifest.incognito, "not_allowed");
});

test("declares no ambient collection or broad access surfaces", () => {
  assert.equal("content_scripts" in manifest, false);
  assert.equal("externally_connectable" in manifest, false);
  assert.equal("optional_permissions" in manifest, false);
  assert.equal("optional_host_permissions" in manifest, false);
  assert.doesNotMatch(
    JSON.stringify(manifest),
    /<all_urls>|https:\/\/\*|http:\/\/\*|cookies|history|webRequest|tabCapture|"tabs"/,
  );
});

test("ships only local extension code in the review page", () => {
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/i);
  assert.doesNotMatch(html, /<link[^>]+href=["']https?:/i);
  assert.match(html, /<script type="module" src="sidepanel\.js"><\/script>/);
});

test("provides unique landmarks, live status, and an ordered review path", () => {
  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
  assert.equal(new Set(ids).size, ids.length);
  assert.match(html, /href="#main"/);
  assert.match(html, /id="assistive-status"[\s\S]*role="status"/);
  assert.match(html, /aria-label="Review progress"/);
  assert.match(html, /id="submission-status"[\s\S]*aria-live="polite"/);
});

test("declares visible focus, increased contrast, narrow reflow, and reduced motion", () => {
  assert.match(css, /:focus-visible\s*\{[\s\S]*outline:/);
  assert.match(css, /@media \(prefers-contrast: more\)/);
  assert.match(css, /@media \(max-width: 260px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /transition:\s*none !important/);
});
