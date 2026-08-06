import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  resolve(import.meta.dirname, "../app/globals.css"),
  "utf8",
);

describe("integration content wrapping", () => {
  it("wraps long recruiter-confirmed values instead of widening the viewport", () => {
    expect(stylesheet).toMatch(
      /\.integration-fact__value\s*\{[^}]*overflow-wrap:\s*anywhere;/,
    );
  });

  it("wraps long evidence and exact-effect text near their decisions", () => {
    expect(stylesheet).toMatch(
      /\.integration-evidence span\s*\{[^}]*overflow-wrap:\s*anywhere;/,
    );
    expect(stylesheet).toMatch(
      /\.integration-source-meta dd,\s*\.integration-action dd\s*\{[^}]*overflow-wrap:\s*anywhere;/,
    );
  });
});
