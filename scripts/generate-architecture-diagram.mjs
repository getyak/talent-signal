import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const outputPath = resolve(
  process.cwd(),
  "docs/talent-signal-architecture.excalidraw",
);

let seed = 1000;
let versionNonce = 5000;
const elements = [];

const palette = {
  ink: "#1f2937",
  muted: "#64748b",
  blue: "#2563eb",
  blueFill: "#dbeafe",
  cyan: "#0891b2",
  cyanFill: "#cffafe",
  green: "#16a34a",
  greenFill: "#dcfce7",
  amber: "#d97706",
  amberFill: "#fef3c7",
  rose: "#e11d48",
  roseFill: "#ffe4e6",
  violet: "#7c3aed",
  violetFill: "#ede9fe",
  grayFill: "#f1f5f9",
  future: "#64748b",
  futureFill: "#f8fafc",
};

function base(id, type, x, y, width, height, options = {}) {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: options.strokeColor ?? palette.ink,
    backgroundColor: options.backgroundColor ?? "transparent",
    fillStyle: "solid",
    strokeWidth: options.strokeWidth ?? 2,
    strokeStyle: options.strokeStyle ?? "solid",
    roughness: options.roughness ?? 0,
    opacity: options.opacity ?? 100,
    groupIds: options.groupIds ?? [],
    frameId: null,
    index: null,
    roundness: options.roundness ?? { type: 3 },
    seed: seed++,
    version: 1,
    versionNonce: versionNonce++,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: options.locked ?? false,
  };
}

function rectangle(id, x, y, width, height, options = {}) {
  elements.push(base(id, "rectangle", x, y, width, height, options));
}

function text(
  id,
  x,
  y,
  width,
  height,
  value,
  fontSize = 22,
  options = {},
) {
  elements.push({
    ...base(id, "text", x, y, width, height, {
      strokeColor: options.color ?? palette.ink,
      strokeWidth: 1,
      roughness: 0,
      roundness: null,
      locked: options.locked ?? false,
    }),
    text: value,
    fontSize,
    fontFamily: 2,
    textAlign: options.align ?? "center",
    verticalAlign: options.verticalAlign ?? "middle",
    containerId: null,
    originalText: value,
    autoResize: false,
    lineHeight: options.lineHeight ?? 1.25,
  });
}

function node(id, x, y, width, height, title, body, options = {}) {
  rectangle(`${id}-box`, x, y, width, height, {
    strokeColor: options.strokeColor,
    backgroundColor: options.backgroundColor,
    strokeStyle: options.strokeStyle,
    strokeWidth: options.strokeWidth ?? 2,
  });
  text(
    `${id}-title`,
    x + 18,
    y + 14,
    width - 36,
    34,
    title,
    options.titleSize ?? 22,
    {
      color: options.titleColor ?? options.strokeColor ?? palette.ink,
      align: "left",
      verticalAlign: "middle",
    },
  );
  text(
    `${id}-body`,
    x + 18,
    y + 52,
    width - 36,
    height - 66,
    body,
    options.bodySize ?? 18,
    {
      color: options.bodyColor ?? palette.ink,
      align: "left",
      verticalAlign: "top",
      lineHeight: 1.35,
    },
  );
}

function arrow(id, points, options = {}) {
  const [start, ...rest] = points;
  const relative = [[0, 0], ...rest.map(([x, y]) => [x - start[0], y - start[1]])];
  const xs = relative.map(([x]) => x);
  const ys = relative.map(([, y]) => y);
  elements.push({
    ...base(
      id,
      "arrow",
      start[0],
      start[1],
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      {
        strokeColor: options.strokeColor ?? palette.ink,
        strokeStyle: options.strokeStyle ?? "solid",
        strokeWidth: options.strokeWidth ?? 2,
        roughness: 0,
        roundness: { type: 2 },
      },
    ),
    points: relative,
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: options.startArrowhead ?? null,
    endArrowhead:
      "endArrowhead" in options ? options.endArrowhead : "arrow",
    elbowed: false,
  });
}

function arrowLabel(id, x, y, width, value, options = {}) {
  rectangle(`${id}-bg`, x, y, width, 30, {
    strokeColor: "transparent",
    backgroundColor: options.backgroundColor ?? "#ffffff",
    strokeWidth: 0,
  });
  text(id, x + 4, y + 2, width - 8, 26, value, 15, {
    color: options.color ?? palette.muted,
  });
}

rectangle("canvas-bg", 20, 20, 1760, 1190, {
  strokeColor: "transparent",
  backgroundColor: "#ffffff",
  strokeWidth: 0,
  locked: true,
});

text(
  "title",
  70,
  42,
  1150,
  58,
  "Talent Signal / Lite Ailoha 架构与数据飞轮",
  36,
  { align: "left", color: "#0f172a" },
);
text(
  "subtitle",
  72,
  102,
  1120,
  32,
  "从聊天截图到可确认行动，再到候选人关系洞察",
  20,
  { align: "left", color: palette.muted },
);

arrow("legend-solid", [[1325, 70], [1400, 70]], {
  endArrowhead: null,
  strokeColor: palette.ink,
  strokeWidth: 3,
});
text("legend-solid-label", 1410, 54, 130, 32, "V1 / 48h", 17, {
  align: "left",
});
arrow("legend-dashed", [[1325, 110], [1400, 110]], {
  endArrowhead: null,
  strokeColor: palette.future,
  strokeStyle: "dashed",
  strokeWidth: 3,
});
text("legend-dashed-label", 1410, 94, 180, 32, "后续演进", 17, {
  align: "left",
  color: palette.future,
});

rectangle("v1-boundary", 70, 155, 1660, 665, {
  strokeColor: "#0f172a",
  backgroundColor: "#ffffff",
  strokeWidth: 3,
});
rectangle("v1-label-bg", 100, 139, 252, 38, {
  strokeColor: "#0f172a",
  backgroundColor: "#0f172a",
  strokeWidth: 2,
});
text("v1-label", 112, 143, 228, 30, "V1 · 48 小时可运行闭环", 18, {
  color: "#ffffff",
});

node(
  "input",
  110,
  225,
  220,
  145,
  "1  输入",
  "聊天截图\n+ 可选补充文字",
  {
    strokeColor: palette.blue,
    backgroundColor: palette.blueFill,
    titleColor: "#1d4ed8",
  },
);
node(
  "capture",
  395,
  225,
  250,
  145,
  "2  iOS 捕获",
  "导入 · 预览\n补充上下文",
  {
    strokeColor: palette.cyan,
    backgroundColor: palette.cyanFill,
    titleColor: "#0e7490",
  },
);
node(
  "extract",
  710,
  225,
  275,
  145,
  "3  结构化提取",
  "适配器接口\nV1: Fixture / 确定性解析",
  {
    strokeColor: palette.violet,
    backgroundColor: palette.violetFill,
    titleColor: "#6d28d9",
    bodySize: 17,
  },
);
node(
  "cards",
  1050,
  225,
  285,
  145,
  "4  Action Cards",
  "创建联系人 · 更新联系人\n创建会议",
  {
    strokeColor: palette.amber,
    backgroundColor: palette.amberFill,
    titleColor: "#b45309",
    bodySize: 17,
  },
);
node(
  "review",
  1400,
  225,
  250,
  145,
  "5  人审闸门",
  "编辑 · 确认 · 忽略\n默认不自动执行",
  {
    strokeColor: palette.rose,
    backgroundColor: palette.roseFill,
    titleColor: "#be123c",
    bodySize: 17,
  },
);

arrow("a-input-capture", [[330, 298], [395, 298]], {
  strokeColor: palette.blue,
});
arrow("a-capture-extract", [[645, 298], [710, 298]], {
  strokeColor: palette.cyan,
});
arrow("a-extract-cards", [[985, 298], [1050, 298]], {
  strokeColor: palette.violet,
});
arrow("a-cards-review", [[1335, 298], [1400, 298]], {
  strokeColor: palette.amber,
});

node(
  "evidence",
  110,
  485,
  275,
  170,
  "Evidence + Audit",
  "来源片段 · 导入时间\n确认 / 修改 / 忽略历史\n删除状态与可追溯性",
  {
    strokeColor: "#475569",
    backgroundColor: palette.grayFill,
    titleColor: "#334155",
    bodySize: 17,
  },
);
node(
  "candidate",
  455,
  485,
  275,
  170,
  "Candidate State",
  "种子联系人数据\n已确认属性 · 阶段\n互动时间线",
  {
    strokeColor: palette.green,
    backgroundColor: palette.greenFill,
    titleColor: "#15803d",
    bodySize: 17,
  },
);
node(
  "insight",
  800,
  485,
  295,
  170,
  "Insight Engine",
  "只读取已确认事实\n动机 / 约束 / 截止期\n置信度 + 推荐动作",
  {
    strokeColor: palette.violet,
    backgroundColor: palette.violetFill,
    titleColor: "#6d28d9",
    bodySize: 17,
  },
);
node(
  "brief",
  1180,
  485,
  470,
  170,
  "候选人 Brief",
  "事实时间线  ·  证据支持的洞察\n下一步建议  ·  动量风险提示",
  {
    strokeColor: palette.blue,
    backgroundColor: palette.blueFill,
    titleColor: "#1d4ed8",
    bodySize: 19,
  },
);

arrow("a-input-evidence", [[220, 370], [220, 485]], {
  strokeColor: "#475569",
});
arrow("a-candidate-extract", [[592, 485], [592, 430], [848, 430], [848, 370]], {
  strokeColor: palette.green,
});
arrow("a-review-evidence", [
  [1525, 370],
  [1525, 425],
  [247, 425],
  [247, 485],
], {
  strokeColor: palette.rose,
});
arrow("a-review-candidate", [
  [1525, 370],
  [1525, 450],
  [592, 450],
  [592, 485],
], {
  strokeColor: palette.rose,
});
arrow("a-evidence-insight", [
  [385, 570],
  [420, 570],
  [420, 680],
  [948, 680],
  [948, 655],
], {
  strokeColor: "#475569",
});
arrow("a-candidate-insight", [[730, 610], [800, 610]], {
  strokeColor: palette.green,
});
arrow("a-insight-brief", [[1095, 570], [1180, 570]], {
  strokeColor: palette.violet,
});
arrow("a-review-brief", [[1525, 370], [1525, 485]], {
  strokeColor: palette.rose,
});

arrowLabel("label-context", 655, 278, 45, "上下文");
arrowLabel("label-structured", 988, 278, 60, "候选动作");
arrowLabel("label-confirm", 1337, 278, 60, "必须确认");
arrowLabel("label-feedback", 870, 410, 150, "反馈事件沉淀");
arrowLabel("label-truth", 745, 665, 105, "已确认事实");
arrowLabel("label-output", 1098, 548, 78, "生成");

rectangle("flywheel-foundation", 110, 710, 1540, 72, {
  strokeColor: "#0f766e",
  backgroundColor: "#f0fdfa",
  strokeWidth: 2,
});
text(
  "flywheel-title",
  135,
  718,
  250,
  28,
  "V1 飞轮地基",
  19,
  { align: "left", color: "#0f766e" },
);
text(
  "flywheel-body",
  345,
  716,
  1270,
  48,
  "每次确认、修改、忽略都变成可审计反馈；第一版先积累高质量信号，不做不透明的在线自动训练。",
  17,
  { align: "left", color: "#134e4a" },
);

rectangle("future-boundary", 70, 865, 1660, 315, {
  strokeColor: palette.future,
  backgroundColor: palette.futureFill,
  strokeStyle: "dashed",
  strokeWidth: 3,
});
rectangle("future-label-bg", 100, 849, 235, 38, {
  strokeColor: palette.future,
  backgroundColor: "#ffffff",
  strokeStyle: "dashed",
  strokeWidth: 2,
});
text("future-label", 112, 853, 211, 30, "后续演进 · 按证据解锁", 18, {
  color: palette.future,
});

node(
  "future-capture",
  110,
  925,
  310,
  195,
  "更多 iOS 入口",
  "Share Sheet · 剪贴板 / Files\nSiri / Shortcuts · Action Button\n小组件 · Live Activities\nVisual Intelligence / 端侧模型",
  {
    strokeColor: palette.future,
    backgroundColor: "#ffffff",
    strokeStyle: "dashed",
    titleColor: "#475569",
    bodyColor: "#475569",
    bodySize: 16,
  },
);
node(
  "future-cloud",
  485,
  925,
  355,
  195,
  "云端 Intelligence + 评测飞轮",
  "API 编排 · OCR / Vision / LLM\n反馈数据集 · 质量指标\nPrompt / 模型版本管理\n加密关系记忆",
  {
    strokeColor: palette.future,
    backgroundColor: "#ffffff",
    strokeStyle: "dashed",
    titleColor: "#475569",
    bodyColor: "#475569",
    bodySize: 16,
  },
);
node(
  "future-desktop",
  905,
  925,
  280,
  195,
  "桌面 Workbench",
  "深度研究 · 横向比较\nATS 协作 · 交付材料\n复用同一 Domain Contracts",
  {
    strokeColor: palette.future,
    backgroundColor: "#ffffff",
    strokeStyle: "dashed",
    titleColor: "#475569",
    bodyColor: "#475569",
    bodySize: 16,
  },
);
node(
  "future-connectors",
  1250,
  925,
  400,
  195,
  "合规系统连接",
  "Apple Contacts / Calendar 生产适配器\nATS / 招聘平台官方 API 或用户授权导入\n避免注入式抓取与账号风控",
  {
    strokeColor: palette.future,
    backgroundColor: "#ffffff",
    strokeStyle: "dashed",
    titleColor: "#475569",
    bodyColor: "#475569",
    bodySize: 16,
  },
);

arrow("f-capture-input", [[265, 925], [265, 855], [170, 855], [170, 370]], {
  strokeColor: palette.future,
  strokeStyle: "dashed",
});
arrow("f-evidence-cloud", [[247, 655], [247, 835], [662, 835], [662, 925]], {
  strokeColor: palette.future,
  strokeStyle: "dashed",
});
arrow("f-cloud-extract", [[720, 925], [720, 850], [910, 850], [910, 370]], {
  strokeColor: palette.future,
  strokeStyle: "dashed",
});
arrow("f-desktop-brief", [[1045, 925], [1045, 835], [1415, 835], [1415, 655]], {
  strokeColor: palette.future,
  strokeStyle: "dashed",
});
arrow("f-connectors-candidate", [
  [1450, 925],
  [1450, 805],
  [592, 805],
  [592, 655],
], {
  strokeColor: palette.future,
  strokeStyle: "dashed",
});

arrowLabel("label-train", 485, 820, 178, "匿名化反馈 / 评测集", {
  color: palette.future,
});
arrowLabel("label-model", 755, 835, 145, "更强适配器", {
  color: palette.future,
});

const document = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements,
  appState: {
    gridSize: null,
    gridStep: 5,
    gridModeEnabled: false,
    viewBackgroundColor: "#f8fafc",
    currentItemFontFamily: 2,
    currentItemStrokeColor: palette.ink,
    currentItemBackgroundColor: "transparent",
    currentItemFillStyle: "solid",
    currentItemStrokeWidth: 2,
    currentItemStrokeStyle: "solid",
    currentItemRoughness: 0,
    currentItemOpacity: 100,
    currentItemRoundness: "round",
    scrollX: 40,
    scrollY: 40,
    zoom: { value: 0.6 },
  },
  files: {},
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
console.log(outputPath);
