import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import test from "node:test";

const manifest = JSON.parse(
  await readFile(new URL("../../config/infisical-secrets.json", import.meta.url), "utf8"),
);
const repositoryRoot = new URL("../..", import.meta.url).pathname;

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (new Set([".next", "dist", "node_modules"]).has(entry.name)) return [];
      return sourceFiles(path);
    }
    if (/\.(?:test|spec)\./u.test(entry.name)) return [];
    return new Set([".js", ".mjs", ".rb", ".sh", ".ts", ".tsx", ".yaml", ".yml"])
      .has(extname(entry.name))
      ? [path]
      : [];
  });
}

test("secret groups use unique canonical paths and valid names", () => {
  const paths = Object.values(manifest.groups).map(({ path }) => path);
  assert.equal(new Set(paths).size, paths.length);
  for (const group of Object.values(manifest.groups)) {
    assert.match(group.path, /^\/[a-z0-9/-]+$/u);
    assert.equal(group.names.length > 0, true);
    assert.equal(new Set(group.names).size, group.names.length);
    for (const name of group.names) assert.match(name, /^[A-Z][A-Z0-9_]+$/u);
  }
});

test("contracts reference declared paths and required names", () => {
  const declaredPaths = new Set(
    Object.values(manifest.groups).map(({ path }) => path),
  );
  const declaredNames = new Set(
    Object.values(manifest.groups).flatMap(({ names }) => names),
  );
  for (const contract of Object.values(manifest.contracts)) {
    assert.equal(contract.paths.every((path) => declaredPaths.has(path)), true);
    assert.equal(contract.required.every((name) => declaredNames.has(name)), true);
  }
});

test("GitHub OIDC is bound to the release contract boundary", () => {
  assert.equal(manifest.githubOidc.environment, "staging");
  assert.equal(manifest.githubOidc.path, manifest.groups.release.path);
  assert.equal(
    manifest.githubOidc.subject,
    "repo:getyak/talent-signal:environment:testflight",
  );
  assert.equal(manifest.githubOidc.accessTokenTtlSeconds, 900);
  assert.match(manifest.githubOidc.identityId, /^[0-9a-f-]{36}$/u);
});

test("credential-shaped runtime names are owned by Infisical", () => {
  const declaredNames = new Set(
    Object.values(manifest.groups).flatMap(({ names }) => names),
  );
  const discoveredNames = new Set();
  const patterns = [
    /process\.env\.([A-Z][A-Z0-9_]*)/gu,
    /process\.env\[["']([A-Z][A-Z0-9_]*)["']\]/gu,
    /ENV\.fetch\("([A-Z][A-Z0-9_]*)"/gu,
    /ENV\[["']([A-Z][A-Z0-9_]*)["']\]/gu,
    /\$\{\{\s*secrets\.([A-Z][A-Z0-9_]*)\s*\}\}/gu,
    /\$\{\{\s*secrets\[["']([A-Z][A-Z0-9_]*)["']\]\s*\}\}/gu,
    /\$\{([A-Z][A-Z0-9_]*)(?=[:}?])/gu,
  ];
  for (const root of ["apps", "scripts", ".github", "fastlane"]) {
    for (const path of sourceFiles(join(repositoryRoot, root))) {
      const source = readFileSync(path, "utf8");
      for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) discoveredNames.add(match[1]);
      }
    }
  }
  for (const composeFile of ["compose.yaml", "compose.production.yaml", "compose.testflight.yaml"]) {
    const source = readFileSync(join(repositoryRoot, composeFile), "utf8");
    for (const match of source.matchAll(/\$\{([A-Z][A-Z0-9_]*)(?=[:}?])/gu)) {
      discoveredNames.add(match[1]);
    }
  }

  const bootstrapOrPlatformNames = new Set(["GH_TOKEN", "GITHUB_TOKEN", "INFISICAL_TOKEN"]);
  const credentialShaped = [...discoveredNames].filter(
    (name) =>
      /(?:API_KEY|DATABASE_URL|DSN|PASSWORD|SECRET|TOKEN)$/u.test(name) &&
      !bootstrapOrPlatformNames.has(name),
  );
  assert.deepEqual(
    credentialShaped.filter((name) => !declaredNames.has(name)).sort(),
    [],
  );
  for (const credentialBearingName of [
    "ANTHROPIC_AUTH_TOKEN",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "TALENT_SIGNAL_ANALYSIS_RECEIPT_SECRET",
    "TALENT_SIGNAL_OPENROUTER_PROXY_URL",
  ]) {
    assert.equal(declaredNames.has(credentialBearingName), true);
  }
});
