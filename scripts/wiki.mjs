#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";

const root = process.cwd();
const indexDirectory = resolve(root, "_index");
const pagesDirectory = resolve(indexDirectory, "pages");
const docsDirectory = resolve(root, "docs");
const logPath = resolve(indexDirectory, "log.md");
const generatedPrefix = "<!-- wiki-generated";
const allowedStatuses = new Set(["draft", "published", "archived"]);
const requiredIndexPaths = [
  "_index/README.md",
  "_index/inbox/README.md",
  "_index/notes/README.md",
  "_index/sources/README.md",
  "_index/templates/page.md",
  "_index/templates/note.md",
  "_index/templates/source.md",
  "_index/log.md",
];

function fail(message) {
  throw new Error(message);
}

function slashPath(value) {
  return value.split("\\").join("/");
}

function repositoryPath(absolutePath) {
  return slashPath(relative(root, absolutePath));
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function listFiles(directory, predicate = () => true) {
  if (!existsSync(directory)) return [];

  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(absolutePath, predicate));
    } else if (entry.isFile() && predicate(absolutePath)) {
      files.push(absolutePath);
    }
  }
  return files.sort((a, b) => repositoryPath(a).localeCompare(repositoryPath(b)));
}

function parseFrontMatter(sourcePath, text) {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "---") {
    fail(`${repositoryPath(sourcePath)} must start with YAML-like front matter`);
  }

  const closingIndex = lines.indexOf("---", 1);
  if (closingIndex === -1) {
    fail(`${repositoryPath(sourcePath)} has unclosed front matter`);
  }

  const metadata = {};
  for (const line of lines.slice(1, closingIndex)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator < 1) {
      fail(`${repositoryPath(sourcePath)} has invalid front matter line: ${line}`);
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (Object.hasOwn(metadata, key)) {
      fail(`${repositoryPath(sourcePath)} repeats front matter key "${key}"`);
    }
    metadata[key] = value;
  }

  return {
    metadata,
    body: lines.slice(closingIndex + 1).join("\n").trim() + "\n",
  };
}

function normalizeTarget(sourcePath, target) {
  if (!target) fail(`${repositoryPath(sourcePath)} requires a target`);
  const normalized = posix.normalize(slashPath(target));
  if (
    isAbsolute(target) ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    !normalized.startsWith("docs/") ||
    !normalized.endsWith(".md")
  ) {
    fail(
      `${repositoryPath(sourcePath)} target must be a Markdown path beneath docs/`,
    );
  }
  if (normalized === "docs/README.md") {
    fail(`${repositoryPath(sourcePath)} cannot target reserved docs/README.md`);
  }
  return normalized;
}

function processOutsideCode(markdown, transform) {
  let inFence = false;
  let fenceMarker = "";
  const lines = markdown.split("\n");

  return lines
    .map((line) => {
      const fence = line.match(/^\s*(`{3,}|~{3,})/);
      if (fence) {
        if (!inFence) {
          inFence = true;
          fenceMarker = fence[1][0];
        } else if (fence[1][0] === fenceMarker) {
          inFence = false;
          fenceMarker = "";
        }
        return line;
      }
      if (inFence) return line;

      return line
        .split(/(`+[^`]*`+)/g)
        .map((segment) => (segment.startsWith("`") ? segment : transform(segment)))
        .join("");
    })
    .join("\n");
}

function wikiLinks(markdown) {
  const links = [];
  processOutsideCode(markdown, (segment) => {
    segment.replace(
      /\[\[([a-z0-9][a-z0-9-]*)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g,
      (raw, id, section, label) => {
        links.push({ raw, id, section: section?.trim(), label: label?.trim() });
        return raw;
      },
    );
    return segment;
  });
  return links;
}

function malformedWikiLinks(markdown) {
  const malformed = [];
  processOutsideCode(markdown, (segment) => {
    for (const match of segment.matchAll(/\[\[[^\]\n]*\]\]/g)) {
      if (
        !/^\[\[([a-z0-9][a-z0-9-]*)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]$/.test(
          match[0],
        )
      ) {
        malformed.push(match[0]);
      }
    }
    return segment;
  });
  return malformed;
}

function githubAnchor(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function headingAnchors(markdown) {
  const anchors = new Set();
  processOutsideCode(markdown, (segment) => {
    const match = segment.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (match) anchors.add(githubAnchor(match[1]));
    return segment;
  });
  return anchors;
}

function hanCharacterCount(markdown) {
  let count = 0;
  processOutsideCode(markdown, (segment) => {
    const matches = segment.match(/\p{Script=Han}/gu);
    count += matches?.length ?? 0;
    return segment;
  });
  return count;
}

function loadPages() {
  if (!existsSync(pagesDirectory)) {
    fail("_index/pages/ does not exist");
  }

  const pages = listFiles(pagesDirectory, (file) => file.endsWith(".md")).map(
    (sourcePath) => {
      const raw = readFileSync(sourcePath, "utf8");
      const { metadata, body } = parseFrontMatter(sourcePath, raw);
      const requiredKeys = ["id", "title", "summary", "status", "language"];
      for (const key of requiredKeys) {
        if (!metadata[key]) {
          fail(`${repositoryPath(sourcePath)} requires front matter key "${key}"`);
        }
      }

      if (!/^[a-z0-9][a-z0-9-]*$/.test(metadata.id)) {
        fail(
          `${repositoryPath(sourcePath)} id must use lowercase letters, numbers, and hyphens`,
        );
      }
      if (!allowedStatuses.has(metadata.status)) {
        fail(
          `${repositoryPath(sourcePath)} status must be draft, published, or archived`,
        );
      }
      if (!/^[a-z]{2}(?:-[A-Za-z0-9]+)*$/.test(metadata.language)) {
        fail(
          `${repositoryPath(sourcePath)} language must be a BCP-47-style tag such as en or zh-CN`,
        );
      }
      if (metadata.status === "published" && metadata.language !== "en") {
        fail(
          `${repositoryPath(sourcePath)} published wiki page language must be "en"`,
        );
      }
      if (
        metadata.status === "published" &&
        metadata.language === "en" &&
        hanCharacterCount(body) > 80
      ) {
        fail(
          `${repositoryPath(sourcePath)} contains substantial Han-script prose; published English pages may name non-English sources but must use English governing prose`,
        );
      }
      if (!metadata.summary.endsWith(".")) {
        fail(`${repositoryPath(sourcePath)} summary must be a complete sentence`);
      }

      const firstHeading = body.match(/^# (.+)$/m)?.[1]?.trim();
      if (firstHeading !== metadata.title) {
        fail(
          `${repositoryPath(sourcePath)} first heading must exactly match title "${metadata.title}"`,
        );
      }

      const target =
        metadata.status === "published"
          ? normalizeTarget(sourcePath, metadata.target)
          : metadata.target
            ? normalizeTarget(sourcePath, metadata.target)
            : undefined;

      return {
        id: metadata.id,
        title: metadata.title,
        summary: metadata.summary,
        status: metadata.status,
        language: metadata.language,
        target,
        sourcePath,
        sourceRepositoryPath: repositoryPath(sourcePath),
        raw,
        body,
        anchors: headingAnchors(body),
      };
    },
  );

  const byId = new Map();
  const byTarget = new Map();
  for (const page of pages) {
    if (byId.has(page.id)) {
      fail(
        `duplicate wiki id "${page.id}" in ${byId.get(page.id).sourceRepositoryPath} and ${page.sourceRepositoryPath}`,
      );
    }
    byId.set(page.id, page);

    if (page.target) {
      if (byTarget.has(page.target)) {
        fail(
          `duplicate wiki target "${page.target}" in ${byTarget.get(page.target).sourceRepositoryPath} and ${page.sourceRepositoryPath}`,
        );
      }
      byTarget.set(page.target, page);
    }
  }

  return { pages, byId };
}

function validateWikiLinks(markdown, sourceLabel, byId, publishedOnly = false) {
  const malformed = malformedWikiLinks(markdown);
  if (malformed.length) {
    fail(`${sourceLabel} contains invalid wiki link syntax: ${malformed[0]}`);
  }

  for (const link of wikiLinks(markdown)) {
    const target = byId.get(link.id);
    if (!target) {
      fail(`${sourceLabel} links to unknown wiki page "${link.id}"`);
    }
    if (publishedOnly && target.status !== "published") {
      fail(`${sourceLabel} links to non-published wiki page "${link.id}"`);
    }
    if (
      link.section &&
      !target.anchors.has(githubAnchor(link.section))
    ) {
      fail(
        `${sourceLabel} links to missing section "${link.section}" in "${link.id}"`,
      );
    }
  }
}

function relativeMarkdownLink(fromTarget, toTarget, section) {
  const fromDirectory = posix.dirname(fromTarget);
  let link = posix.relative(fromDirectory, toTarget);
  if (!link.startsWith(".")) link = `./${link}`;
  if (section) link += `#${githubAnchor(section)}`;
  return link;
}

function renderBody(page, byId) {
  return processOutsideCode(page.body.trimEnd(), (segment) =>
    segment.replace(
      /\[\[([a-z0-9][a-z0-9-]*)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g,
      (_raw, id, section, label) => {
        const target = byId.get(id);
        const text = label?.trim() || (section ? section.trim() : target.title);
        const href = relativeMarkdownLink(page.target, target.target, section);
        return `[${text}](${href})`;
      },
    ),
  );
}

function generatedHeader(source, contentDigest) {
  return [
    `<!-- wiki-generated source="${source}" digest="${contentDigest}" -->`,
    "<!-- Edit the _index source and run `pnpm wiki:build`; do not edit this file directly. -->",
    "",
    "",
  ].join("\n");
}

function compileWiki() {
  for (const requiredPath of requiredIndexPaths) {
    if (!existsSync(resolve(root, requiredPath))) {
      fail(`required wiki path is missing: ${requiredPath}`);
    }
  }

  const { pages, byId } = loadPages();
  const publishedPages = pages.filter((page) => page.status === "published");
  const knowledgeMapPath = resolve(docsDirectory, "README.md");
  if (existsSync(knowledgeMapPath)) {
    const knowledgeMap = readFileSync(knowledgeMapPath, "utf8");
    for (const page of publishedPages) {
      const routedTarget = posix.relative("docs", page.target);
      if (!knowledgeMap.includes(`(${routedTarget})`)) {
        fail(
          `docs/README.md must route to published wiki page ${page.target}`,
        );
      }
    }
  }

  for (const page of pages) {
    validateWikiLinks(
      page.body,
      page.sourceRepositoryPath,
      byId,
      page.status === "published",
    );
  }
  validateWikiLinks(
    readFileSync(resolve(indexDirectory, "README.md"), "utf8"),
    "_index/README.md",
    byId,
    true,
  );

  const backlinks = new Map(publishedPages.map((page) => [page.id, new Map()]));
  for (const page of publishedPages) {
    for (const link of wikiLinks(page.body)) {
      if (link.id !== page.id) backlinks.get(link.id).set(page.id, page);
    }
  }

  const expected = new Map();
  for (const page of publishedPages) {
    let body = renderBody(page, byId);
    const inbound = [...backlinks.get(page.id).values()].sort((a, b) =>
      a.title.localeCompare(b.title),
    );

    if (inbound.length) {
      body += "\n\n## Backlinks\n\n";
      body += inbound
        .map(
          (source) =>
            `- [${source.title}](${relativeMarkdownLink(page.target, source.target)})`,
        )
        .join("\n");
    }
    body += "\n";

    const pageDigest = digest(page.raw).slice(0, 16);
    expected.set(
      page.target,
      generatedHeader(page.sourceRepositoryPath, pageDigest) + body,
    );
  }

  const sourceDigest = digest(
    pages
      .map((page) => `${page.sourceRepositoryPath}\n${page.raw}`)
      .join("\n"),
  ).slice(0, 16);

  return { expected, sourceDigest, publishedPages };
}

function generatedOrphans(expected) {
  return listFiles(docsDirectory, (file) => file.endsWith(".md"))
    .filter((file) => readFileSync(file, "utf8").startsWith(generatedPrefix))
    .map(repositoryPath)
    .filter((file) => !expected.has(file));
}

function differences(expected) {
  const created = [];
  const updated = [];
  for (const [target, content] of expected) {
    const absolutePath = resolve(root, target);
    if (!existsSync(absolutePath)) {
      created.push(target);
    } else if (readFileSync(absolutePath, "utf8") !== content) {
      updated.push(target);
    }
  }
  return { created, updated, removed: generatedOrphans(expected) };
}

function appendBuildLog(sourceDigest, changes) {
  const timestamp = new Date().toISOString();
  const lines = [
    "",
    `## ${timestamp}`,
    "",
    `- Source digest: \`${sourceDigest}\``,
  ];
  for (const [label, files] of [
    ["Created", changes.created],
    ["Updated", changes.updated],
    ["Removed", changes.removed],
  ]) {
    if (files.length) lines.push(`- ${label}: ${files.map((file) => `\`${file}\``).join(", ")}`);
  }
  writeFileSync(
    logPath,
    readFileSync(logPath, "utf8").trimEnd() + "\n" + lines.join("\n") + "\n",
  );
}

function build() {
  const { expected, sourceDigest, publishedPages } = compileWiki();
  const changes = differences(expected);

  for (const [target, content] of expected) {
    const absolutePath = resolve(root, target);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }
  for (const target of changes.removed) {
    rmSync(resolve(root, target));
  }

  if (changes.created.length || changes.updated.length || changes.removed.length) {
    appendBuildLog(sourceDigest, changes);
    console.log(
      `Wiki compiled: ${publishedPages.length} published page(s), ` +
        `${changes.created.length} created, ${changes.updated.length} updated, ` +
        `${changes.removed.length} removed.`,
    );
  } else {
    console.log(`Wiki already current: ${publishedPages.length} published page(s).`);
  }
}

function check() {
  const { expected, publishedPages } = compileWiki();
  const changes = differences(expected);
  const stale = [...changes.created, ...changes.updated, ...changes.removed];

  if (stale.length) {
    const details = [
      ...changes.created.map((file) => `missing generated file: ${file}`),
      ...changes.updated.map((file) => `stale generated file: ${file}`),
      ...changes.removed.map((file) => `orphaned generated file: ${file}`),
    ];
    fail(
      `compiled wiki is not current:\n- ${details.join("\n- ")}\nRun pnpm wiki:build and commit both source and generated changes.`,
    );
  }

  console.log(`Wiki check passed: ${publishedPages.length} published page(s).`);
}

const command = process.argv[2];

try {
  if (command === "build") {
    build();
  } else if (command === "check") {
    check();
  } else {
    fail("usage: node scripts/wiki.mjs <build|check>");
  }
} catch (error) {
  console.error(`Wiki ${command || "command"} failed: ${error.message}`);
  process.exitCode = 1;
}
