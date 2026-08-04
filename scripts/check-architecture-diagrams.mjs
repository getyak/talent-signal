import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function luminance(hex) {
  const channels = hex
    .match(/[0-9a-f]{2}/gi)
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4,
    );
  return (
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  );
}

function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function absoluteBounds(element) {
  if (element.type !== "arrow") {
    return {
      minX: element.x,
      minY: element.y,
      maxX: element.x + element.width,
      maxY: element.y + element.height,
    };
  }

  const points = element.points.map(([x, y]) => [
    element.x + x,
    element.y + y,
  ]);
  return {
    minX: Math.min(...points.map(([x]) => x)),
    minY: Math.min(...points.map(([, y]) => y)),
    maxX: Math.max(...points.map(([x]) => x)),
    maxY: Math.max(...points.map(([, y]) => y)),
  };
}

function pngDimensions(path) {
  const output = execFileSync("/usr/bin/sips", [
    "-g",
    "pixelWidth",
    "-g",
    "pixelHeight",
    path,
  ]).toString();
  const width = Number(output.match(/pixelWidth: (\d+)/)?.[1]);
  const height = Number(output.match(/pixelHeight: (\d+)/)?.[1]);
  return { width, height };
}

async function checkScene(config) {
  const excalidrawPath = resolve(root, config.excalidraw);
  const svgPath = resolve(root, config.svg);
  const pngPath = resolve(root, config.png);
  const document = JSON.parse(await readFile(excalidrawPath, "utf8"));

  assert(document.type === "excalidraw", `${config.name}: invalid document type`);
  assert(document.version === 2, `${config.name}: unexpected document version`);
  assert(document.elements.length >= config.minimumElements, `${config.name}: scene is incomplete`);

  const ids = new Set();
  const byId = new Map();
  for (const element of document.elements) {
    assert(!ids.has(element.id), `${config.name}: duplicate id ${element.id}`);
    ids.add(element.id);
    byId.set(element.id, element);
    assert(!element.isDeleted, `${config.name}: deleted element ${element.id}`);
  }

  const canvas = byId.get(`${config.prefix}-canvas-bg`);
  assert(canvas, `${config.name}: canvas background is missing`);
  const canvasBounds = absoluteBounds(canvas);

  for (const element of document.elements) {
    const bounds = absoluteBounds(element);
    assert(
      bounds.minX >= canvasBounds.minX &&
        bounds.minY >= canvasBounds.minY &&
        bounds.maxX <= canvasBounds.maxX &&
        bounds.maxY <= canvasBounds.maxY,
      `${config.name}: ${element.id} falls outside the canvas`,
    );
    if (element.type === "text") {
      assert(element.text.trim().length > 0, `${config.name}: blank text element`);
      assert(
        element.fontSize >= config.minimumFontSize,
        `${config.name}: ${element.id} is below the minimum font size`,
      );
    }
  }

  const combinedText = document.elements
    .filter((element) => element.type === "text")
    .map((element) => element.text)
    .join("\n");
  for (const phrase of config.requiredPhrases) {
    assert(
      combinedText.includes(phrase),
      `${config.name}: missing required phrase "${phrase}"`,
    );
  }

  for (const suffix of config.requiredElementSuffixes) {
    assert(
      [...ids].some((id) => id.endsWith(suffix)),
      `${config.name}: missing element *${suffix}`,
    );
  }

  for (const suffix of config.dashedElementSuffixes) {
    const element = [...byId.values()].find((candidate) =>
      candidate.id.endsWith(suffix),
    );
    assert(element, `${config.name}: missing future element *${suffix}`);
    assert(
      element.strokeStyle === "dashed",
      `${config.name}: future element *${suffix} must be dashed`,
    );
  }

  for (const forbiddenSuffix of config.forbiddenElementSuffixes ?? []) {
    assert(
      ![...ids].some((id) => id.endsWith(forbiddenSuffix)),
      `${config.name}: forbidden route *${forbiddenSuffix} is present`,
    );
  }

  for (const element of document.elements.filter(
    (candidate) => candidate.type === "text",
  )) {
    const baseId = element.id.endsWith("-title")
      ? element.id.slice(0, -"-title".length)
      : element.id.endsWith("-body")
        ? element.id.slice(0, -"-body".length)
        : element.id.endsWith("-text")
          ? element.id.slice(0, -"-text".length)
          : null;
    if (!baseId) continue;
    const background =
      byId.get(`${baseId}-box`) ??
      byId.get(baseId);
    if (
      !background ||
      background.backgroundColor === "transparent" ||
      !/^#[0-9a-f]{6}$/i.test(background.backgroundColor) ||
      !/^#[0-9a-f]{6}$/i.test(element.strokeColor)
    ) {
      continue;
    }
    assert(
      contrast(element.strokeColor, background.backgroundColor) >= 4.5,
      `${config.name}: ${element.id} has insufficient text contrast`,
    );
  }

  const svg = await readFile(svgPath, "utf8");
  for (const phrase of config.renderPhrases) {
    assert(svg.includes(phrase), `${config.name}: SVG lost "${phrase}"`);
  }

  const pngStat = await stat(pngPath);
  assert(pngStat.size > 100_000, `${config.name}: PNG is unexpectedly small`);
  const png = pngDimensions(pngPath);
  const sceneRatio = canvas.width / canvas.height;
  const pngRatio = png.width / png.height;
  assert(
    Math.abs(sceneRatio - pngRatio) / sceneRatio < 0.035,
    `${config.name}: PNG aspect ratio suggests clipping or excess padding`,
  );

  return {
    name: config.name,
    elements: document.elements.length,
    texts: document.elements.filter((element) => element.type === "text")
      .length,
    solid: document.elements.filter(
      (element) => element.strokeStyle === "solid",
    ).length,
    dashed: document.elements.filter(
      (element) => element.strokeStyle === "dashed",
    ).length,
    png: `${png.width}x${png.height}`,
  };
}

const results = [];
results.push(
  await checkScene({
    name: "product architecture",
    prefix: "product",
    excalidraw: "docs/talent-signal-product-architecture.excalidraw",
    svg: "docs/talent-signal-product-architecture.svg",
    png: "docs/talent-signal-product-architecture.png",
    minimumElements: 75,
    minimumFontSize: 12,
    requiredPhrases: [
      "iOS",
      "Web",
      "Android",
      "浏览器插件",
      "Agent 起草",
      "猎头确认",
      "MEMORY 记住",
      "WIKI / LIVING PAGE",
      "Wiki 是解释层，不是执行事实源",
      "不做候选人评分",
    ],
    requiredElementSuffixes: [
      "flow-capture-agent",
      "flow-agent-review",
      "flow-review-memory",
      "flywheel-1",
      "flywheel-2",
      "flywheel-loop",
    ],
    dashedElementSuffixes: ["android-box", "extension-box"],
    renderPhrases: ["Talent Signal 产品架构", "猎头确认"],
  }),
);
results.push(
  await checkScene({
    name: "system architecture",
    prefix: "system",
    excalidraw: "docs/talent-signal-system-architecture.excalidraw",
    svg: "docs/talent-signal-system-architecture.svg",
    png: "docs/talent-signal-system-architecture.png",
    minimumElements: 100,
    minimumFontSize: 12,
    requiredPhrases: [
      "iOS · SwiftUI",
      "Web · Next.js",
      "Android",
      "Browser Extension",
      "Evidence Compiler",
      "Context Resolver",
      "Action Planner",
      "Human Approval Checkpoint",
      "Execution Guard",
      "Connector Executor",
      "Canonical Memory",
      "Insight Synthesizer",
      "Wiki Compiler",
      "async projection",
      "no tool args",
      "ATS Adapter",
    ],
    requiredElementSuffixes: [
      "compiler-resolver",
      "resolver-planner",
      "planner-approval",
      "approval-guard",
      "guard-executor",
      "approval-to-memory",
      "executor-to-memory",
      "memory-to-canonical",
      "canonical-to-resolver",
      "canonical-to-insight",
      "canonical-to-wiki",
      "compiler-to-evidence",
      "wiki-to-store",
      "executor-to-writes",
    ],
    dashedElementSuffixes: [
      "android-box",
      "extension-box",
      "ats-adapter-box",
    ],
    forbiddenElementSuffixes: ["insight-to-wiki"],
    renderPhrases: ["Talent Signal 系统架构", "Human Approval Checkpoint"],
  }),
);

for (const result of results) {
  console.log(
    `${result.name}: PASS · ${result.elements} elements · ${result.texts} texts · ${result.solid} solid · ${result.dashed} dashed · ${result.png}`,
  );
}
