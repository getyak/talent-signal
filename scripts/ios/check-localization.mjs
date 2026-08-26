#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const sourceRoot = join(repositoryRoot, "apps/ios/Sources");
const resourcesRoot = join(repositoryRoot, "apps/ios/Resources");
const policy = JSON.parse(
  readFileSync(join(repositoryRoot, "scripts/ios/localization-policy.json"), "utf8"),
);

function swiftFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return swiftFiles(path);
    return entry.isFile() && entry.name.endsWith(".swift") ? [path] : [];
  });
}

function catalog(name) {
  const path = join(resourcesRoot, name);
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (value.sourceLanguage !== "en") {
    throw new Error(`${name} must declare English as its source language.`);
  }
  for (const [key, entry] of Object.entries(value.strings ?? {})) {
    const translation = entry.localizations?.["zh-Hans"]?.stringUnit;
    if (
      !translation ||
      translation.state !== "translated" ||
      typeof translation.value !== "string" ||
      translation.value.trim().length === 0
    ) {
      throw new Error(`${name} is missing a reviewed zh-Hans value for: ${key}`);
    }
  }
  return new Set(Object.keys(value.strings ?? {}));
}

function occurrences(source, expression) {
  return [...source.matchAll(expression)];
}

const interfaceKeys = catalog("Localizable.xcstrings");
catalog("InfoPlist.xcstrings");

let legacyInlineCount = 0;
let rawInterfaceLiteralCount = 0;
const missingCatalogKeys = new Set();
const fileInventory = [];

for (const path of swiftFiles(sourceRoot)) {
  const source = readFileSync(path, "utf8");
  const legacy = occurrences(source, /\bzhHans\s*:/gu).length;
  const raw = occurrences(
    source,
    /\b(?:Text|Button|Label|navigationTitle|accessibilityLabel)\(\s*"/gu,
  ).length;
  const directCatalogCalls = occurrences(
    source,
    /\b(?:appLanguage|language|interfaceLanguage)\.text\(\s*"((?:\\.|[^"\\])*)"\s*\)/gsu,
  );
  for (const match of directCatalogCalls) {
    const key = match[1].replaceAll('\\"', '"').replaceAll("\\\\", "\\");
    if (!interfaceKeys.has(key)) missingCatalogKeys.add(key);
  }
  legacyInlineCount += legacy;
  rawInterfaceLiteralCount += raw;
  if (legacy > 0 || raw > 0) {
    fileInventory.push({
      file: relative(repositoryRoot, path),
      legacy,
      raw,
    });
  }
}

if (missingCatalogKeys.size > 0) {
  throw new Error(
    `One-argument AppLanguage keys are absent from Localizable.xcstrings:\n${[
      ...missingCatalogKeys,
    ]
      .sort()
      .map((key) => `- ${key}`)
      .join("\n")}`,
  );
}
if (legacyInlineCount > policy.maximumLegacyInlineBilingualCalls) {
  throw new Error(
    `Inline bilingual calls increased from the allowed ${policy.maximumLegacyInlineBilingualCalls} to ${legacyInlineCount}. Add new interface copy to Localizable.xcstrings instead.`,
  );
}
if (rawInterfaceLiteralCount > policy.maximumRawInterfaceLiterals) {
  throw new Error(
    `Raw SwiftUI interface literals increased from the allowed ${policy.maximumRawInterfaceLiterals} to ${rawInterfaceLiteralCount}. Route new interface copy through AppLanguage.`,
  );
}

const remaining = fileInventory
  .sort((left, right) => right.legacy + right.raw - (left.legacy + left.raw))
  .slice(0, 8)
  .map(({ file, legacy, raw }) => `${file}: inline=${legacy}, raw=${raw}`)
  .join("\n");
console.log(
  [
    `iOS localization boundary passed: ${interfaceKeys.size} catalog keys; ${legacyInlineCount} transitional inline bilingual calls; ${rawInterfaceLiteralCount} raw SwiftUI literals.`,
    "Largest remaining migration surfaces:",
    remaining || "none",
  ].join("\n"),
);
