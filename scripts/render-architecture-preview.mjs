import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const inputPath = resolve(
  process.cwd(),
  process.argv[2] ?? "docs/talent-signal-architecture.excalidraw",
);
const outputPath = resolve(
  process.cwd(),
  process.argv[3] ?? inputPath.replace(/\.excalidraw$/, ".svg"),
);

const document = JSON.parse(await readFile(inputPath, "utf8"));

const escapeXml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function strokeDasharray(element) {
  if (element.strokeStyle === "dashed") return "12 10";
  if (element.strokeStyle === "dotted") return "3 8";
  return "none";
}

function renderRectangle(element) {
  const fill =
    element.backgroundColor === "transparent"
      ? "none"
      : element.backgroundColor;
  const stroke =
    element.strokeColor === "transparent" ? "none" : element.strokeColor;

  return [
    `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}"`,
    ` rx="${element.roundness ? 10 : 0}" fill="${fill}" stroke="${stroke}"`,
    ` stroke-width="${element.strokeWidth}" stroke-dasharray="${strokeDasharray(element)}" />`,
  ].join("");
}

function renderText(element) {
  const lines = element.text.split("\n");
  const lineHeight = element.fontSize * element.lineHeight;
  const contentHeight = lineHeight * lines.length;
  const anchor =
    element.textAlign === "left"
      ? "start"
      : element.textAlign === "right"
        ? "end"
        : "middle";
  const x =
    element.textAlign === "left"
      ? element.x
      : element.textAlign === "right"
        ? element.x + element.width
        : element.x + element.width / 2;
  const startY =
    element.verticalAlign === "top"
      ? element.y + element.fontSize
      : element.verticalAlign === "bottom"
        ? element.y + element.height - contentHeight + element.fontSize
        : element.y +
          (element.height - contentHeight) / 2 +
          element.fontSize;

  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="${x}" y="${startY + index * lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join("");

  return [
    `<text fill="${element.strokeColor}" font-family="Hiragino Sans GB, sans-serif"`,
    ` font-size="${element.fontSize}" font-weight="${element.id.endsWith("-title") || element.id === "title" ? 700 : 400}"`,
    ` text-anchor="${anchor}">${tspans}</text>`,
  ].join("");
}

function renderArrow(element) {
  const points = element.points.map(([x, y]) => [
    element.x + x,
    element.y + y,
  ]);
  const polyline = `<polyline points="${points.map(([x, y]) => `${x},${y}`).join(" ")}" fill="none" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${strokeDasharray(element)}" />`;

  if (!element.endArrowhead || points.length < 2) return polyline;

  const [x2, y2] = points.at(-1);
  const [x1, y1] = points.at(-2);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLength = 12;
  const headWidth = 7;
  const baseX = x2 - headLength * Math.cos(angle);
  const baseY = y2 - headLength * Math.sin(angle);
  const left = [
    baseX + headWidth * Math.cos(angle + Math.PI / 2),
    baseY + headWidth * Math.sin(angle + Math.PI / 2),
  ];
  const right = [
    baseX + headWidth * Math.cos(angle - Math.PI / 2),
    baseY + headWidth * Math.sin(angle - Math.PI / 2),
  ];

  return `${polyline}<polygon points="${x2},${y2} ${left[0]},${left[1]} ${right[0]},${right[1]}" fill="${element.strokeColor}" />`;
}

const visibleElements = document.elements.filter((element) => !element.isDeleted);
const bounds = visibleElements.map((element) => {
  if (element.type !== "arrow") {
    return {
      minX: element.x,
      minY: element.y,
      maxX: element.x + element.width,
      maxY: element.y + element.height,
    };
  }

  const absolutePoints = element.points.map(([x, y]) => [
    element.x + x,
    element.y + y,
  ]);
  return {
    minX: Math.min(...absolutePoints.map(([x]) => x)),
    minY: Math.min(...absolutePoints.map(([, y]) => y)),
    maxX: Math.max(...absolutePoints.map(([x]) => x)),
    maxY: Math.max(...absolutePoints.map(([, y]) => y)),
  };
});
const minX = Math.min(...bounds.map((bound) => bound.minX));
const minY = Math.min(...bounds.map((bound) => bound.minY));
const maxX = Math.max(...bounds.map((bound) => bound.maxX));
const maxY = Math.max(...bounds.map((bound) => bound.maxY));
const padding = 24;

const rendered = visibleElements
  .map((element) => {
    if (element.type === "rectangle") return renderRectangle(element);
    if (element.type === "text") return renderText(element);
    if (element.type === "arrow") return renderArrow(element);
    return "";
  })
  .join("\n");

const svg = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}" width="${maxX - minX + padding * 2}" height="${maxY - minY + padding * 2}">`,
  `<rect x="${minX - padding}" y="${minY - padding}" width="${maxX - minX + padding * 2}" height="${maxY - minY + padding * 2}" fill="${document.appState.viewBackgroundColor}" />`,
  rendered,
  "</svg>",
  "",
].join("\n");

await writeFile(outputPath, svg, "utf8");
console.log(outputPath);
