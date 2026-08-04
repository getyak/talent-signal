import { execFileSync } from "node:child_process";
import {
  copyFile,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { tmpdir } from "node:os";

const inputPath = resolve(process.cwd(), process.argv[2]);
const outputPath = resolve(
  process.cwd(),
  process.argv[3] ?? inputPath.replace(/\.svg$/, ".png"),
);
const previewSize = process.argv[4] ?? "2600";

if (extname(inputPath) !== ".svg") {
  throw new Error("Input must be an SVG generated from the Excalidraw scene.");
}

const source = await readFile(inputPath, "utf8");
const svgMatch = source.match(
  /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="([^"]+)" width="([^"]+)" height="([^"]+)">/,
);

if (!svgMatch) {
  throw new Error("Could not read the SVG viewport.");
}

const [minX, minY, width, height] = svgMatch[1].split(" ").map(Number);
const squareSize = Math.max(width, height);
const paddedSource = source
  .replace(
    svgMatch[0],
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${squareSize} ${squareSize}" width="${squareSize}" height="${squareSize}">`,
  )
  .replace(
    `<rect x="${minX}" y="${minY}" width="${width}" height="${height}"`,
    `<rect x="${minX}" y="${minY}" width="${squareSize}" height="${squareSize}"`,
  );

const temporaryDirectory = await mkdtemp(
  resolve(tmpdir(), "talent-signal-architecture-"),
);
const temporarySvg = resolve(
  temporaryDirectory,
  `${basename(inputPath, ".svg")}-square.svg`,
);
const quickLookPng = `${temporarySvg}.png`;
const renderedPng = resolve(temporaryDirectory, "rendered.png");

try {
  await writeFile(temporarySvg, paddedSource, "utf8");
  execFileSync("/usr/bin/qlmanage", [
    "-t",
    "-s",
    previewSize,
    "-o",
    temporaryDirectory,
    temporarySvg,
  ]);
  execFileSync("/opt/homebrew/bin/magick", [
    quickLookPng,
    "-fuzz",
    "1%",
    "-trim",
    "+repage",
    "-bordercolor",
    "#f2f1ed",
    "-border",
    "24",
    renderedPng,
  ]);
  await copyFile(renderedPng, outputPath);
  console.log(outputPath);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
