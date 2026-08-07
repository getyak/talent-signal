import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const compiler = resolve("scripts/wiki.mjs");

function write(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "talent-signal-wiki-"));
  cpSync("_index/templates", join(root, "_index/templates"), { recursive: true });
  for (const path of [
    "_index/README.md",
    "_index/inbox/README.md",
    "_index/notes/README.md",
    "_index/sources/README.md",
    "_index/log.md",
  ]) {
    write(root, path, path === "_index/README.md" ? "# Raw wiki\n" : `# ${path}\n`);
  }
  write(root, "docs/manual.md", "# Manual page\n");
  return root;
}

function page({
  id,
  title,
  target,
  body,
  status = "published",
  language = "en",
}) {
  return `---
id: ${id}
title: ${title}
summary: ${title} has one clear purpose.
status: ${status}
language: ${language}
target: ${target}
---

# ${title}

${body}
`;
}

test("build renders portable links, backlinks, and an idempotent log", () => {
  const root = fixture();
  write(
    root,
    "_index/pages/alpha.md",
    page({
      id: "alpha",
      title: "Alpha",
      target: "docs/alpha.md",
      body: "Continue to [[beta|the second page]].",
    }),
  );
  write(
    root,
    "_index/pages/beta.md",
    page({
      id: "beta",
      title: "Beta",
      target: "docs/nested/beta.md",
      body: "## Details\n\nA durable detail.",
    }),
  );

  execFileSync(process.execPath, [compiler, "build"], { cwd: root });

  const alpha = readFileSync(join(root, "docs/alpha.md"), "utf8");
  const beta = readFileSync(join(root, "docs/nested/beta.md"), "utf8");
  const log = readFileSync(join(root, "_index/log.md"), "utf8");

  assert.match(alpha, /\[the second page\]\(\.\/nested\/beta\.md\)/);
  assert.match(beta, /## Backlinks[\s\S]*\[Alpha\]\(\.\.\/alpha\.md\)/);
  assert.match(log, /Source digest/);
  execFileSync(process.execPath, [compiler, "check"], { cwd: root });
  execFileSync(process.execPath, [compiler, "build"], { cwd: root });
  assert.equal(readFileSync(join(root, "_index/log.md"), "utf8"), log);
});

test("check rejects source drift until the wiki is rebuilt", () => {
  const root = fixture();
  const sourcePath = "_index/pages/alpha.md";
  write(
    root,
    sourcePath,
    page({
      id: "alpha",
      title: "Alpha",
      target: "docs/alpha.md",
      body: "Initial content.",
    }),
  );
  execFileSync(process.execPath, [compiler, "build"], { cwd: root });
  write(
    root,
    sourcePath,
    page({
      id: "alpha",
      title: "Alpha",
      target: "docs/alpha.md",
      body: "Changed content.",
    }),
  );

  const result = spawnSync(process.execPath, [compiler, "check"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /stale generated file: docs\/alpha\.md/);
});

test("published pages cannot link to missing or draft pages", () => {
  const root = fixture();
  write(
    root,
    "_index/pages/alpha.md",
    page({
      id: "alpha",
      title: "Alpha",
      target: "docs/alpha.md",
      body: "This link is not ready: [[beta]].",
    }),
  );
  write(
    root,
    "_index/pages/beta.md",
    page({
      id: "beta",
      title: "Beta",
      target: "docs/beta.md",
      status: "draft",
      body: "Draft content.",
    }),
  );

  const result = spawnSync(process.execPath, [compiler, "build"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /links to non-published wiki page "beta"/);
});

test("targets cannot escape docs", () => {
  const root = fixture();
  write(
    root,
    "_index/pages/escape.md",
    page({
      id: "escape",
      title: "Escape",
      target: "../README.md",
      body: "Invalid target.",
    }),
  );

  const result = spawnSync(process.execPath, [compiler, "build"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /target must be a Markdown path beneath docs/);
});

test("published pages must be reachable from a curated knowledge map", () => {
  const root = fixture();
  write(root, "docs/README.md", "# Knowledge map\n");
  write(
    root,
    "_index/pages/alpha.md",
    page({
      id: "alpha",
      title: "Alpha",
      target: "docs/alpha.md",
      body: "Published but not routed.",
    }),
  );

  const result = spawnSync(process.execPath, [compiler, "build"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /docs\/README\.md must route to published wiki page docs\/alpha\.md/,
  );
});

test("malformed wiki links fail instead of leaking into generated docs", () => {
  const root = fixture();
  write(
    root,
    "_index/pages/alpha.md",
    page({
      id: "alpha",
      title: "Alpha",
      target: "docs/alpha.md",
      body: "Broken link: [[Alpha Page]].",
    }),
  );

  const result = spawnSync(process.execPath, [compiler, "build"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /contains invalid wiki link syntax/);
});

test("published pages must use the reviewed English publication layer", () => {
  const root = fixture();
  write(
    root,
    "_index/pages/alpha.md",
    page({
      id: "alpha",
      title: "Alpha",
      target: "docs/alpha.md",
      language: "zh-CN",
      body: "中文发布草稿。",
    }),
  );

  const result = spawnSync(process.execPath, [compiler, "build"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /published wiki page language must be "en"/);
});

test("English publication metadata cannot hide non-English governing prose", () => {
  const root = fixture();
  write(
    root,
    "_index/pages/alpha.md",
    page({
      id: "alpha",
      title: "Alpha",
      target: "docs/alpha.md",
      body:
        "这是一段被错误标记为英文的中文发布正文，编译器必须阻止它进入文档。".repeat(
          8,
        ),
    }),
  );

  const result = spawnSync(process.execPath, [compiler, "build"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /contains substantial Han-script prose/);
});
