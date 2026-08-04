import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const root = process.cwd();

const canonical = [
  "docs/README.md",
  "docs/principles.md",
  "docs/product.md",
  "docs/architecture.md",
  "docs/agent-system.md",
  "docs/capture-to-action.md",
  "docs/design-system.md",
  "docs/delivery.md",
  "docs/integrations.md",
  "docs/documentation.md",
  "docs/codex-work-system.md",
];

const requiredRoot = ["AGENTS.md", "PLANS.md", "REVIEW.md"];
const errors = [];

function fail(message) {
  errors.push(message);
}

for (const relativePath of [...requiredRoot, ...canonical]) {
  if (!existsSync(resolve(root, relativePath))) {
    fail(`Missing required knowledge file: ${relativePath}`);
  }
}

const knowledgeMapPath = resolve(root, "docs/README.md");
const knowledgeMap = existsSync(knowledgeMapPath)
  ? readFileSync(knowledgeMapPath, "utf8")
  : "";

for (const relativePath of canonical.filter(
  (entry) => entry !== "docs/README.md",
)) {
  const localName = relativePath.replace(/^docs\//, "");
  if (!knowledgeMap.includes(`(${localName})`)) {
    fail(`Knowledge map does not route to canonical document: ${relativePath}`);
  }
}

for (const relativePath of canonical) {
  const absolutePath = resolve(root, relativePath);
  if (!existsSync(absolutePath)) continue;
  const content = readFileSync(absolutePath, "utf8");
  const lineCount = content.split(/\r?\n/).length;

  if (lineCount > 320) {
    fail(
      `Canonical document exceeds the 320-line context budget: ${relativePath} (${lineCount})`,
    );
  }

  const disallowedFence = content.match(
    /^```(?:json|jsonc|javascript|js|typescript|ts|tsx|swift|sql|toml|yaml|yml|bash|sh|shell)\s*$/im,
  );
  if (disallowedFence) {
    fail(
      `Implementation-level code fence belongs outside canonical docs: ${relativePath} (${disallowedFence[0]})`,
    );
  }

  if (/^(?:GET|POST|PUT|PATCH|DELETE)\s+\/\S+/m.test(content)) {
    fail(`Endpoint inventory belongs in executable references: ${relativePath}`);
  }
}

const agentsPath = resolve(root, "AGENTS.md");
if (existsSync(agentsPath)) {
  const agents = readFileSync(agentsPath, "utf8");
  for (const requiredReference of [
    "docs/README.md",
    "PLANS.md",
    "REVIEW.md",
    "docs/documentation.md",
  ]) {
    if (!agents.includes(requiredReference)) {
      fail(`AGENTS.md must route to ${requiredReference}`);
    }
  }
}

const ignoredDirectories = new Set([
  ".git",
  ".next",
  "coverage",
  "node_modules",
  "tmp",
  "vendor",
]);

function collectMarkdownFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) continue;
      files.push(...collectMarkdownFiles(join(directory, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(relative(root, join(directory, entry.name)));
    }
  }
  return files;
}

const markdownFiles = collectMarkdownFiles(root);

const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;

for (const relativePath of markdownFiles) {
  const absolutePath = resolve(root, relativePath);
  const content = readFileSync(absolutePath, "utf8");
  let match;

  while ((match = linkPattern.exec(content)) !== null) {
    let target = match[1].trim();
    if (
      !target ||
      target.startsWith("#") ||
      /^(?:https?:|mailto:|data:)/i.test(target)
    ) {
      continue;
    }

    if (target.startsWith("<") && target.endsWith(">")) {
      target = target.slice(1, -1);
    }

    target = target.split("#", 1)[0];
    try {
      target = decodeURIComponent(target);
    } catch {
      fail(`Invalid encoded link in ${relativePath}: ${target}`);
      continue;
    }

    const resolvedTarget = resolve(dirname(absolutePath), target);
    if (!existsSync(resolvedTarget)) {
      fail(`Broken local link in ${relativePath}: ${match[1]}`);
      continue;
    }

    if (
      extname(target) === "" &&
      statSync(resolvedTarget).isFile() &&
      !target.endsWith(".md")
    ) {
      fail(`Ambiguous extensionless file link in ${relativePath}: ${target}`);
    }
  }
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR ${error}`);
  console.error(`Documentation check failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(
  `Documentation check passed: ${canonical.length} canonical documents and ${markdownFiles.length} Markdown files.`,
);
