import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const outputDirectory = resolve(process.cwd(), "docs");

const colors = {
  canvas: "#f2f1ed",
  surface: "#faf9f5",
  surfaceMuted: "#ebe9e3",
  surfaceStrong: "#ddd9d1",
  ink: "#181816",
  inkSoft: "#34332f",
  muted: "#64615a",
  line: "#b9b5ac",
  accent: "#d84a35",
  accentStrong: "#b53727",
  accentInk: "#8f251b",
  accentSoft: "#f0d4cd",
  success: "#356c51",
  successSoft: "#dce8df",
  blue: "#315f7d",
  blueSoft: "#dce8ef",
  violet: "#62527d",
  violetSoft: "#e7e1ee",
  future: "#747068",
  futureFill: "#f5f3ee",
  white: "#ffffff",
};

function createScene(name, width, height, build) {
  let seed = 1000;
  let versionNonce = 5000;
  const elements = [];

  function base(id, type, x, y, elementWidth, elementHeight, options = {}) {
    return {
      id: `${name}-${id}`,
      type,
      x,
      y,
      width: elementWidth,
      height: elementHeight,
      angle: 0,
      strokeColor: options.strokeColor ?? colors.ink,
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

  function rectangle(id, x, y, elementWidth, elementHeight, options = {}) {
    elements.push(
      base(id, "rectangle", x, y, elementWidth, elementHeight, options),
    );
  }

  function text(
    id,
    x,
    y,
    elementWidth,
    elementHeight,
    value,
    fontSize = 22,
    options = {},
  ) {
    elements.push({
      ...base(id, "text", x, y, elementWidth, elementHeight, {
        strokeColor: options.color ?? colors.ink,
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

  function arrow(id, points, options = {}) {
    const [start, ...rest] = points;
    const relative = [
      [0, 0],
      ...rest.map(([x, y]) => [x - start[0], y - start[1]]),
    ];
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
          strokeColor: options.strokeColor ?? colors.ink,
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

  function node(
    id,
    x,
    y,
    elementWidth,
    elementHeight,
    title,
    body,
    options = {},
  ) {
    rectangle(`${id}-box`, x, y, elementWidth, elementHeight, {
      strokeColor: options.strokeColor ?? colors.line,
      backgroundColor: options.backgroundColor ?? colors.surface,
      strokeStyle: options.strokeStyle ?? "solid",
      strokeWidth: options.strokeWidth ?? 2,
      roundness: options.roundness,
    });
    text(
      `${id}-title`,
      x + (options.padding ?? 20),
      y + (options.titleTop ?? 16),
      elementWidth - (options.padding ?? 20) * 2,
      options.titleHeight ?? 34,
      title,
      options.titleSize ?? 22,
      {
        color: options.titleColor ?? options.strokeColor ?? colors.ink,
        align: options.titleAlign ?? "left",
        verticalAlign: "middle",
      },
    );
    text(
      `${id}-body`,
      x + (options.padding ?? 20),
      y + (options.bodyTop ?? 58),
      elementWidth - (options.padding ?? 20) * 2,
      elementHeight - (options.bodyTop ?? 58) - (options.bottomPadding ?? 18),
      body,
      options.bodySize ?? 17,
      {
        color: options.bodyColor ?? colors.inkSoft,
        align: options.bodyAlign ?? "left",
        verticalAlign: options.bodyVerticalAlign ?? "top",
        lineHeight: options.lineHeight ?? 1.35,
      },
    );
  }

  function label(id, x, y, elementWidth, value, options = {}) {
    rectangle(`${id}-bg`, x, y, elementWidth, options.height ?? 30, {
      strokeColor: "transparent",
      backgroundColor: options.backgroundColor ?? colors.surface,
      strokeWidth: 0,
      roundness: null,
    });
    text(
      id,
      x + 5,
      y + 2,
      elementWidth - 10,
      (options.height ?? 30) - 4,
      value,
      options.fontSize ?? 15,
      {
        color: options.color ?? colors.muted,
        align: options.align ?? "center",
      },
    );
  }

  function badge(id, x, y, elementWidth, value, options = {}) {
    rectangle(id, x, y, elementWidth, options.height ?? 34, {
      strokeColor: options.strokeColor ?? colors.accentStrong,
      backgroundColor: options.backgroundColor ?? colors.accentStrong,
      strokeStyle: options.strokeStyle,
      strokeWidth: options.strokeWidth ?? 1,
    });
    text(
      `${id}-text`,
      x + 8,
      y + 3,
      elementWidth - 16,
      (options.height ?? 34) - 6,
      value,
      options.fontSize ?? 15,
      {
        color: options.color ?? colors.white,
      },
    );
  }

  function sectionHeader(id, x, y, index, title, subtitle, options = {}) {
    badge(`${id}-step`, x, y, 38, index, {
      height: 38,
      fontSize: 17,
      backgroundColor: options.accent ?? colors.accentStrong,
      strokeColor: options.accent ?? colors.accentStrong,
    });
    text(`${id}-title`, x + 52, y - 3, options.width ?? 280, 34, title, 24, {
      color: colors.ink,
      align: "left",
    });
    text(
      `${id}-subtitle`,
      x + 52,
      y + 33,
      options.subtitleWidth ?? options.width ?? 300,
      44,
      subtitle,
      15,
      {
        color: colors.muted,
        align: "left",
        verticalAlign: "top",
        lineHeight: 1.3,
      },
    );
  }

  build({
    elements,
    rectangle,
    text,
    arrow,
    node,
    label,
    badge,
    sectionHeader,
  });

  return {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements,
    appState: {
      gridSize: null,
      gridStep: 5,
      gridModeEnabled: false,
      viewBackgroundColor: colors.canvas,
      currentItemFontFamily: 2,
      currentItemStrokeColor: colors.ink,
      currentItemBackgroundColor: "transparent",
      currentItemFillStyle: "solid",
      currentItemStrokeWidth: 2,
      currentItemStrokeStyle: "solid",
      currentItemRoughness: 0,
      currentItemOpacity: 100,
      currentItemRoundness: "round",
      scrollX: 40,
      scrollY: 40,
      zoom: { value: 0.55 },
    },
    files: {},
  };
}

function buildProductDiagram(api) {
  const { rectangle, text, arrow, node, label, badge, sectionHeader } = api;

  rectangle("canvas-bg", 20, 20, 1880, 1040, {
    strokeColor: "transparent",
    backgroundColor: colors.surface,
    strokeWidth: 0,
    locked: true,
  });
  text(
    "title",
    74,
    48,
    1270,
    58,
    "Talent Signal Product Architecture",
    38,
    { align: "left", color: colors.ink },
  );
  text(
    "subtitle",
    76,
    108,
    1240,
    36,
    "Capture once. Review the evidence. Move the relationship forward with context.",
    20,
    { align: "left", color: colors.muted },
  );

  arrow("legend-v1", [[1510, 72], [1580, 72]], {
    endArrowhead: null,
    strokeColor: colors.ink,
    strokeWidth: 3,
  });
  text("legend-v1-text", 1592, 57, 120, 30, "V1 scope", 16, {
    align: "left",
  });
  arrow("legend-future", [[1510, 112], [1580, 112]], {
    endArrowhead: null,
    strokeColor: colors.future,
    strokeStyle: "dashed",
    strokeWidth: 3,
  });
  text("legend-future-text", 1592, 97, 170, 30, "Later", 16, {
    align: "left",
    color: colors.future,
  });

  rectangle("capture-panel", 70, 205, 410, 510, {
    strokeColor: colors.line,
    backgroundColor: colors.futureFill,
    strokeWidth: 1,
  });
  rectangle("agent-panel", 535, 205, 400, 510, {
    strokeColor: colors.line,
    backgroundColor: colors.blueSoft,
    strokeWidth: 1,
  });
  rectangle("review-panel", 990, 205, 370, 510, {
    strokeColor: colors.accent,
    backgroundColor: colors.accentSoft,
    strokeWidth: 2,
  });
  rectangle("memory-panel", 1415, 205, 435, 510, {
    strokeColor: colors.success,
    backgroundColor: colors.successSoft,
    strokeWidth: 2,
  });

  arrow("flow-capture-agent", [[480, 462], [535, 462]], {
    strokeColor: colors.ink,
    strokeWidth: 3,
  });
  arrow("flow-agent-review", [[935, 462], [990, 462]], {
    strokeColor: colors.ink,
    strokeWidth: 3,
  });
  arrow("flow-review-memory", [[1360, 462], [1415, 462]], {
    strokeColor: colors.ink,
    strokeWidth: 3,
  });

  sectionHeader(
    "capture",
    98,
    232,
    "1",
    "Capture in flow",
    "Start where you already work.\nNo pre-organized notes.",
    { width: 250, subtitleWidth: 290 },
  );
  node(
    "ios",
    98,
    335,
    170,
    135,
    "iOS",
    "Screenshot · camera\nShare Sheet · Today",
    {
      strokeColor: colors.ink,
      backgroundColor: colors.surface,
      titleSize: 21,
      bodySize: 14,
      bodyTop: 54,
      padding: 16,
    },
  );
  badge("ios-status", 112, 442, 58, "V1", {
    height: 24,
    fontSize: 14,
    backgroundColor: colors.ink,
    strokeColor: colors.ink,
  });
  node(
    "web",
    285,
    335,
    167,
    135,
    "Web",
    "Paste / upload\nReview · workspace",
    {
      strokeColor: colors.ink,
      backgroundColor: colors.surface,
      titleSize: 21,
      bodySize: 14,
      bodyTop: 54,
      padding: 16,
    },
  );
  badge("web-status", 299, 442, 58, "V1", {
    height: 24,
    fontSize: 14,
    backgroundColor: colors.ink,
    strokeColor: colors.ink,
  });
  node(
    "android",
    98,
    492,
    170,
    135,
    "Android",
    "System share\nBriefs · reminders",
    {
      strokeColor: colors.future,
      backgroundColor: colors.surface,
      strokeStyle: "dashed",
      titleColor: colors.future,
      titleSize: 20,
      bodySize: 15,
      bodyTop: 54,
    },
  );
  node(
    "extension",
    285,
    492,
    167,
    135,
    "Browser extension",
    "Selected context\nSide-panel review",
    {
      strokeColor: colors.future,
      backgroundColor: colors.surface,
      strokeStyle: "dashed",
      titleColor: colors.future,
      titleSize: 15,
      bodySize: 14,
      bodyTop: 54,
    },
  );
  text(
    "capture-note",
    99,
    648,
    350,
    42,
    "Every surface enters one shared Capture Inbox.",
    15,
    { align: "left", color: colors.muted },
  );

  sectionHeader(
    "agent",
    565,
    232,
    "2",
    "Agent draft",
    "Organizes evidence; never owns\nrelationship judgment.",
    { width: 250, subtitleWidth: 290, accent: colors.blue },
  );
  badge("agent-runtime", 565, 329, 335, "Governed · Pausable · Recoverable", {
    height: 32,
    fontSize: 14,
    backgroundColor: colors.blue,
    strokeColor: colors.blue,
  });
  text(
    "agent-capabilities",
    575,
    383,
    315,
    175,
    "01  Interpret evidence\n      OCR · speaker · date · exact excerpt\n\n02  Resolve context\n      Person · role · assignment · conflicts\n\n03  Draft facts and actions\n      Contact · meeting · follow-up · no_action",
    16,
    {
      align: "left",
      verticalAlign: "top",
      color: colors.inkSoft,
      lineHeight: 1.35,
    },
  );
  rectangle("agent-rule", 565, 590, 335, 86, {
    strokeColor: colors.blue,
    backgroundColor: colors.surface,
    strokeWidth: 1,
  });
  text(
    "agent-rule-text",
    585,
    603,
    295,
    58,
    "Weak evidence → clarify or stop\nNo silent writes. No person scoring.",
    15,
    {
      align: "left",
      verticalAlign: "top",
      color: colors.blue,
      lineHeight: 1.35,
    },
  );

  sectionHeader(
    "review",
    1020,
    232,
    "3",
    "Recruiter decision",
    "Fact confirmation and action\napproval stay separate.",
    { width: 250, subtitleWidth: 285, accent: colors.accentStrong },
  );
  text(
    "review-headline",
    1020,
    330,
    310,
    58,
    "Read the source. See the change.\nPreview the exact effect.",
    20,
    {
      align: "left",
      verticalAlign: "top",
      color: colors.accentStrong,
      lineHeight: 1.25,
    },
  );
  text(
    "review-checklist",
    1020,
    410,
    310,
    205,
    "✓  Exact evidence + speaker\n✓  Proposed before / after value\n✓  Ambiguity, conflict, expiry\n✓  Target, field, timing, impact\n✓  Edit / confirm / dismiss / undo",
    17,
    {
      align: "left",
      verticalAlign: "top",
      color: colors.inkSoft,
      lineHeight: 1.62,
    },
  );
  badge("review-rule", 1020, 635, 305, "Only the approved version may execute", {
    height: 38,
    fontSize: 15,
    backgroundColor: colors.accentStrong,
    strokeColor: colors.accentStrong,
  });

  sectionHeader(
    "memory",
    1445,
    232,
    "4",
    "Relationship continuity",
    "The next conversation starts\nfrom confirmed context.",
    { width: 280, subtitleWidth: 325, accent: colors.success },
  );
  text("memory-label", 1445, 337, 230, 30, "MEMORY / WHAT IS KNOWN", 15, {
    align: "left",
    color: colors.success,
  });
  text(
    "memory-content",
    1445,
    374,
    350,
    108,
    "Confirmed facts · decision drivers\nObserved outcomes · version · expiry\nScoped by assignment and permission",
    17,
    {
      align: "left",
      verticalAlign: "top",
      color: colors.inkSoft,
      lineHeight: 1.42,
    },
  );
  arrow("memory-divider", [[1445, 500], [1808, 500]], {
    endArrowhead: null,
    strokeColor: colors.success,
    strokeWidth: 1,
  });
  text("wiki-label", 1445, 518, 245, 30, "WIKI / HOW IT READS", 15, {
    align: "left",
    color: colors.success,
  });
  text(
    "wiki-content",
    1445,
    555,
    350,
    105,
    "Candidate timeline · open questions\nEvidence links · owner · due date\nOne small, concrete next step",
    17,
    {
      align: "left",
      verticalAlign: "top",
      color: colors.inkSoft,
      lineHeight: 1.42,
    },
  );
  text(
    "wiki-rule",
    1445,
    670,
    360,
    25,
    "The Wiki explains; it never authorizes execution.",
    14,
    { align: "left", color: colors.muted },
  );

  rectangle("flywheel-band", 150, 790, 1620, 150, {
    strokeColor: colors.success,
    backgroundColor: colors.surface,
    strokeWidth: 2,
  });
  text("flywheel-title", 182, 812, 250, 32, "Auditable learning loop", 21, {
    align: "left",
    color: colors.success,
  });
  node(
    "outcome",
    455,
    812,
    255,
    96,
    "Verified outcome",
    "Observed in the destination",
    {
      strokeColor: colors.line,
      backgroundColor: colors.futureFill,
      titleColor: colors.ink,
      titleSize: 17,
      bodySize: 14,
      bodyTop: 49,
      bottomPadding: 10,
    },
  );
  node(
    "confirmed-memory",
    815,
    812,
    275,
    96,
    "Confirmed memory",
    "Only reviewed facts and outcomes persist",
    {
      strokeColor: colors.line,
      backgroundColor: colors.successSoft,
      titleColor: colors.success,
      titleSize: 17,
      bodySize: 14,
      bodyTop: 49,
      bottomPadding: 10,
    },
  );
  node(
    "next-context",
    1195,
    812,
    330,
    96,
    "Next conversation has context",
    "Less repetition without losing change",
    {
      strokeColor: colors.line,
      backgroundColor: colors.futureFill,
      titleColor: colors.ink,
      titleSize: 17,
      bodySize: 14,
      bodyTop: 49,
      bottomPadding: 10,
    },
  );
  arrow("flywheel-1", [[710, 860], [815, 860]], {
    strokeColor: colors.success,
    strokeWidth: 2,
  });
  arrow("flywheel-2", [[1090, 860], [1195, 860]], {
    strokeColor: colors.success,
    strokeWidth: 2,
  });
  arrow(
    "flywheel-loop",
    [
      [1525, 860],
      [1680, 860],
      [1680, 752],
      [745, 752],
      [745, 715],
    ],
    {
      strokeColor: colors.success,
      strokeWidth: 2,
    },
  );
  label("flywheel-loop-label", 1105, 736, 265, "Better context for the next decision", {
    backgroundColor: colors.surface,
    color: colors.success,
    fontSize: 14,
  });

  text(
    "boundary",
    78,
    985,
    1760,
    38,
    "Boundary: not an ATS replacement  ·  no candidate scoring  ·  no ambient monitoring  ·  automation reduces admin, not human care",
    16,
    { align: "center", color: colors.muted },
  );
}

function buildSystemDiagram(api) {
  const { rectangle, text, arrow, node, label, badge } = api;

  rectangle("canvas-bg", 20, 20, 2160, 1440, {
    strokeColor: "transparent",
    backgroundColor: colors.surface,
    strokeWidth: 0,
    locked: true,
  });
  text("title", 74, 45, 1320, 58, "Talent Signal System Architecture", 38, {
    align: "left",
    color: colors.ink,
  });
  text(
    "subtitle",
    76,
    105,
    1380,
    36,
    "Evidence first · human in the loop · recoverable effects · rebuildable memory",
    20,
    { align: "left", color: colors.muted },
  );
  arrow("legend-v1", [[1770, 68], [1840, 68]], {
    endArrowhead: null,
    strokeColor: colors.ink,
    strokeWidth: 3,
  });
  text("legend-v1-text", 1852, 53, 150, 30, "V1 contract", 16, {
    align: "left",
  });
  arrow("legend-future", [[1770, 108], [1840, 108]], {
    endArrowhead: null,
    strokeColor: colors.future,
    strokeStyle: "dashed",
    strokeWidth: 3,
  });
  text("legend-future-text", 1852, 93, 180, 30, "Later surfaces", 16, {
    align: "left",
    color: colors.future,
  });

  rectangle("clients-band", 70, 165, 2060, 250, {
    strokeColor: colors.line,
    backgroundColor: colors.futureFill,
    strokeWidth: 1,
  });
  badge("clients-label", 95, 148, 210, "01  CLIENT SURFACES", {
    height: 34,
    backgroundColor: colors.ink,
    strokeColor: colors.ink,
  });
  node(
    "ios",
    105,
    215,
    350,
    130,
    "iOS · SwiftUI",
    "Screenshot / Share Sheet · Evidence review\nAction Cards · Today Brief · Resume",
    {
      strokeColor: colors.ink,
      backgroundColor: colors.surface,
      titleSize: 20,
      bodySize: 15,
      bodyTop: 52,
    },
  );
  node(
    "web",
    515,
    215,
    350,
    130,
    "Web · Next.js",
    "Capture Inbox · Living Page\nWorkspace · Timeline · Audit · Research",
    {
      strokeColor: colors.ink,
      backgroundColor: colors.surface,
      titleSize: 20,
      bodySize: 15,
      bodyTop: 52,
    },
  );
  node(
    "android",
    925,
    215,
    350,
    130,
    "Android",
    "System share · Evidence review\nBriefs · Notifications · Resume",
    {
      strokeColor: colors.future,
      backgroundColor: colors.surface,
      strokeStyle: "dashed",
      titleColor: colors.future,
      titleSize: 20,
      bodySize: 15,
      bodyTop: 52,
    },
  );
  node(
    "extension",
    1335,
    215,
    350,
    130,
    "Browser Extension",
    "Selected-context capture\nSource label · side review\nNo ambient scraping",
    {
      strokeColor: colors.future,
      backgroundColor: colors.surface,
      strokeStyle: "dashed",
      titleColor: colors.future,
      titleSize: 20,
      bodySize: 14,
      bodyTop: 52,
    },
  );
  node(
    "shared-contract",
    1745,
    215,
    350,
    130,
    "Shared Client Contract",
    "Capture · Evidence · Approval\nBrief · Resume · Delete",
    {
      strokeColor: colors.blue,
      backgroundColor: colors.blueSoft,
      titleColor: colors.blue,
      titleSize: 18,
      bodySize: 15,
      bodyTop: 52,
    },
  );
  text(
    "clients-note",
    110,
    362,
    1980,
    30,
    "Surfaces are views of one governed task; identity, facts, permissions, and audit remain shared.",
    15,
    { align: "center", color: colors.muted },
  );

  arrow("clients-to-trust", [[1100, 415], [1100, 462]], {
    strokeColor: colors.ink,
    strokeWidth: 3,
  });

  rectangle("trust-band", 70, 462, 2060, 180, {
    strokeColor: colors.line,
    backgroundColor: colors.surfaceMuted,
    strokeWidth: 1,
  });
  badge("trust-label", 95, 445, 240, "02  TRUST + API BOUNDARY", {
    height: 34,
    backgroundColor: colors.accentStrong,
    strokeColor: colors.accentStrong,
  });
  node(
    "gateway",
    105,
    505,
    355,
    98,
    "Gateway / BFF",
    "Versioned API · rate limits · input bounds · state flow",
    {
      strokeColor: colors.line,
      backgroundColor: colors.surface,
      titleColor: colors.ink,
      titleSize: 18,
      bodySize: 14,
      bodyTop: 47,
      bottomPadding: 10,
    },
  );
  node(
    "identity-scope",
    500,
    505,
    355,
    98,
    "Identity + Scope",
    "User · tenant · assignment scope · RLS",
    {
      strokeColor: colors.line,
      backgroundColor: colors.surface,
      titleColor: colors.ink,
      titleSize: 18,
      bodySize: 14,
      bodyTop: 47,
      bottomPadding: 10,
    },
  );
  node(
    "capture-ingest",
    895,
    505,
    355,
    98,
    "Capture Ingest",
    "Intent confirmation · dedupe\nValidation · encrypted object refs",
    {
      strokeColor: colors.line,
      backgroundColor: colors.surface,
      titleColor: colors.ink,
      titleSize: 18,
      bodySize: 14,
      bodyTop: 47,
      bottomPadding: 10,
    },
  );
  node(
    "run-state",
    1290,
    505,
    355,
    98,
    "Run State + Checkpoint",
    "Pause / resume · proposal versions · expiry",
    {
      strokeColor: colors.line,
      backgroundColor: colors.surface,
      titleColor: colors.ink,
      titleSize: 18,
      bodySize: 14,
      bodyTop: 47,
      bottomPadding: 10,
    },
  );
  node(
    "status-stream",
    1685,
    505,
    410,
    98,
    "Status / Notification",
    "Progress + outcome only\nNo private body text · reconnectable",
    {
      strokeColor: colors.line,
      backgroundColor: colors.surface,
      titleColor: colors.ink,
      titleSize: 18,
      bodySize: 14,
      bodyTop: 47,
      bottomPadding: 10,
    },
  );

  arrow("trust-to-agent", [[1100, 642], [1100, 690]], {
    strokeColor: colors.ink,
    strokeWidth: 3,
  });

  rectangle("agent-band", 70, 690, 2060, 420, {
    strokeColor: colors.blue,
    backgroundColor: colors.blueSoft,
    strokeWidth: 2,
  });
  badge("agent-label", 95, 673, 500, "03  AGENT RUNTIME · DETERMINISTIC STATE MACHINE", {
    height: 34,
    backgroundColor: colors.blue,
    strokeColor: colors.blue,
  });
  text(
    "agent-note",
    625,
    712,
    1475,
    22,
    "Bounded roles · deterministic state · audited steps · no multi-agent chat",
    14,
    { align: "left", color: colors.blue },
  );

  arrow("compiler-resolver", [[385, 802], [430, 802]], {
    strokeColor: colors.ink,
  });
  arrow("resolver-planner", [[710, 802], [755, 802]], {
    strokeColor: colors.ink,
  });
  arrow("planner-approval", [[1035, 802], [1080, 802]], {
    strokeColor: colors.ink,
  });
  arrow("approval-guard", [[1380, 802], [1425, 802]], {
    strokeColor: colors.accent,
    strokeWidth: 3,
  });
  arrow("guard-executor", [[1725, 802], [1770, 802]], {
    strokeColor: colors.accent,
    strokeWidth: 3,
  });
  node(
    "evidence-compiler",
    105,
    745,
    280,
    130,
    "Evidence Compiler",
    "OCR / layout / speaker\nidentity candidates · assertions\nprompt injection remains untrusted data",
    {
      strokeColor: colors.blue,
      backgroundColor: colors.surface,
      titleColor: colors.blue,
      titleSize: 18,
      bodySize: 14,
      bodyTop: 50,
    },
  );
  node(
    "context-resolver",
    430,
    745,
    280,
    130,
    "Context Resolver",
    "read-only scoped memory\nperson / assignment match · conflicts\nunknown / ambiguous",
    {
      strokeColor: colors.blue,
      backgroundColor: colors.surface,
      titleColor: colors.blue,
      titleSize: 18,
      bodySize: 14,
      bodyTop: 50,
    },
  );
  node(
    "action-planner",
    755,
    745,
    280,
    130,
    "Action Planner",
    "allowlisted proposals\ncontact / meeting / follow-up\nno_action / clarify",
    {
      strokeColor: colors.blue,
      backgroundColor: colors.surface,
      titleColor: colors.blue,
      titleSize: 18,
      bodySize: 14,
      bodyTop: 50,
    },
  );
  node(
    "approval",
    1080,
    730,
    300,
    160,
    "Human Approval Checkpoint",
    "fact: confirm / edit / dismiss\naction: approve / edit / reject\nshow evidence, target, change, and impact",
    {
      strokeColor: colors.accent,
      backgroundColor: colors.accentSoft,
      titleColor: colors.accentInk,
      titleSize: 18,
      bodySize: 14,
      bodyTop: 54,
    },
  );
  node(
    "execution-guard",
    1425,
    745,
    300,
    130,
    "Execution Guard",
    "recheck scope / version / expiry\ntime zone / conflict / duplicate\nidempotency + outbox",
    {
      strokeColor: colors.accent,
      backgroundColor: colors.surface,
      titleColor: colors.accentStrong,
      titleSize: 18,
      bodySize: 14,
      bodyTop: 50,
    },
  );
  node(
    "connector-executor",
    1770,
    745,
    325,
    130,
    "Connector Executor",
    "one explicitly approved call\nawait external id / result\nfail · retry · reconcile · reverse",
    {
      strokeColor: colors.accent,
      backgroundColor: colors.surface,
      titleColor: colors.accentStrong,
      titleSize: 18,
      bodySize: 14,
      bodyTop: 50,
    },
  );

  arrow(
    "approval-to-memory",
    [
      [1230, 890],
      [1230, 925],
      [420, 925],
      [420, 980],
    ],
    { strokeColor: colors.success, strokeWidth: 2 },
  );
  arrow(
    "executor-to-memory",
    [
      [1932, 875],
      [1932, 930],
      [610, 930],
      [610, 980],
    ],
    { strokeColor: colors.success, strokeWidth: 2 },
  );
  node(
    "memory-compiler",
    265,
    980,
    345,
    92,
    "Memory Compiler",
    "confirmed facts + verified results + outcomes",
    {
      strokeColor: colors.success,
      backgroundColor: colors.successSoft,
      titleColor: colors.success,
      titleSize: 18,
      bodySize: 14,
      bodyTop: 48,
      bottomPadding: 10,
    },
  );
  node(
    "insight-synth",
    820,
    980,
    345,
    92,
    "Insight Synthesizer",
    "what changed · labeled inference\none next step · no write",
    {
      strokeColor: colors.violet,
      backgroundColor: colors.violetSoft,
      titleColor: colors.violet,
      titleSize: 18,
      bodySize: 14,
      bodyTop: 48,
      bottomPadding: 10,
      lineHeight: 1.1,
    },
  );
  node(
    "wiki-compiler",
    1375,
    980,
    345,
    92,
    "Wiki Compiler",
    "async projection · evidence links\nrebuildable · no tool args",
    {
      strokeColor: colors.success,
      backgroundColor: colors.successSoft,
      titleColor: colors.success,
      titleSize: 18,
      bodySize: 14,
      bodyTop: 48,
      bottomPadding: 10,
      lineHeight: 1.1,
    },
  );
  arrow(
    "wiki-to-status",
    [
      [1720, 1026],
      [2070, 1026],
      [2070, 625],
      [1890, 625],
      [1890, 603],
    ],
    { strokeColor: colors.success },
  );

  rectangle("data-band", 70, 1160, 1390, 210, {
    strokeColor: colors.line,
    backgroundColor: colors.futureFill,
    strokeWidth: 1,
  });
  badge("data-label", 95, 1143, 250, "04  DATA + MEMORY PLANE", {
    height: 34,
    backgroundColor: colors.success,
    strokeColor: colors.success,
  });
  node(
    "evidence-store",
    105,
    1205,
    300,
    125,
    "Evidence Store",
    "asset · spans · OCR version\nassertions · ambiguity · retention",
    {
      strokeColor: colors.line,
      backgroundColor: colors.surface,
      titleColor: colors.ink,
      titleSize: 17,
      bodySize: 14,
      bodyTop: 48,
    },
  );
  node(
    "canonical-memory",
    435,
    1205,
    330,
    125,
    "Canonical Memory",
    "Person · roles · assignment\nrelationship · FactVersion · outcome",
    {
      strokeColor: colors.success,
      backgroundColor: colors.successSoft,
      titleColor: colors.success,
      titleSize: 17,
      bodySize: 14,
      bodyTop: 48,
    },
  );
  node(
    "audit-outbox",
    795,
    1205,
    300,
    125,
    "Audit + Outbox",
    "run · proposal version · approval\nexternal id · retry · reversal",
    {
      strokeColor: colors.line,
      backgroundColor: colors.surface,
      titleColor: colors.ink,
      titleSize: 17,
      bodySize: 14,
      bodyTop: 48,
    },
  );
  node(
    "wiki-store",
    1125,
    1205,
    300,
    125,
    "Wiki + Retrieval",
    "WikiSnapshot · search index · cache\nderived · rebuildable\ndeletion-coupled",
    {
      strokeColor: colors.future,
      backgroundColor: colors.surface,
      titleColor: colors.ink,
      titleSize: 17,
      bodySize: 14,
      bodyTop: 48,
      lineHeight: 1.2,
    },
  );

  arrow("compiler-to-evidence", [[245, 875], [245, 1205]], {
    strokeColor: colors.blue,
  });
  arrow("memory-to-canonical", [[437, 1072], [437, 1175], [600, 1175], [600, 1205]], {
    strokeColor: colors.success,
  });
  arrow(
    "canonical-to-insight",
    [
      [600, 1205],
      [600, 1145],
      [992, 1145],
      [992, 1072],
    ],
    { strokeColor: colors.success },
  );
  arrow(
    "canonical-to-resolver",
    [
      [600, 1205],
      [600, 1178],
      [790, 1178],
      [790, 920],
      [570, 920],
      [570, 875],
    ],
    { strokeColor: colors.success },
  );
  arrow(
    "canonical-to-wiki",
    [
      [600, 1205],
      [600, 1122],
      [1547, 1122],
      [1547, 1072],
    ],
    { strokeColor: colors.success },
  );
  arrow("guard-to-audit", [[1575, 875], [1575, 1130], [945, 1130], [945, 1205]], {
    strokeColor: colors.accent,
  });
  arrow("wiki-to-store", [[1547, 1072], [1547, 1140], [1275, 1140], [1275, 1205]], {
    strokeColor: colors.success,
  });

  rectangle("external-band", 1500, 1160, 630, 210, {
    strokeColor: colors.line,
    backgroundColor: colors.futureFill,
    strokeWidth: 1,
  });
  badge("external-label", 1525, 1143, 265, "05  EXTERNAL ADAPTERS", {
    height: 34,
    backgroundColor: colors.violet,
    strokeColor: colors.violet,
  });
  node(
    "model-adapters",
    1525,
    1205,
    180,
    125,
    "AI Adapters",
    "OCR / Vision / LLM\nrole-specific schema\nZDR · proposal only",
    {
      strokeColor: colors.violet,
      backgroundColor: colors.violetSoft,
      titleColor: colors.violet,
      titleSize: 16,
      bodySize: 14,
      bodyTop: 48,
      lineHeight: 1.2,
    },
  );
  node(
    "v1-write-adapters",
    1730,
    1205,
    180,
    125,
    "V1 Write Adapters",
    "Contacts / Calendar\nleast privilege\nresult verification",
    {
      strokeColor: colors.accent,
      backgroundColor: colors.surface,
      titleColor: colors.accentStrong,
      titleSize: 15,
      bodySize: 14,
      bodyTop: 48,
      lineHeight: 1.2,
    },
  );
  node(
    "ats-adapter",
    1935,
    1205,
    160,
    125,
    "ATS Adapter",
    "official API only\nscoped sync\nreconciliation",
    {
      strokeColor: colors.future,
      backgroundColor: colors.surface,
      strokeStyle: "dashed",
      titleColor: colors.future,
      titleSize: 16,
      bodySize: 14,
      bodyTop: 48,
      lineHeight: 1.2,
    },
  );
  arrow(
    "models-to-runtime",
    [
      [1615, 1205],
      [1615, 1125],
      [245, 1125],
      [245, 875],
    ],
    {
      strokeColor: colors.violet,
      strokeStyle: "dashed",
    },
  );
  arrow("executor-to-writes", [[1932, 875], [1932, 1175], [1820, 1175], [1820, 1205]], {
    strokeColor: colors.accent,
    strokeWidth: 2,
  });

  rectangle("security-bar", 70, 1400, 2060, 42, {
    strokeColor: colors.ink,
    backgroundColor: colors.ink,
    strokeWidth: 1,
  });
  text(
    "security-text",
    95,
    1405,
    2010,
    30,
    "CROSS-CUTTING: encryption · tenant scope · prompt isolation · redacted telemetry · model/version eval · retention + derivative deletion cascade",
    14,
    { color: colors.white },
  );
}

const scenes = [
  {
    filename: "talent-signal-product-architecture.excalidraw",
    document: createScene("product", 1920, 1080, buildProductDiagram),
  },
  {
    filename: "talent-signal-system-architecture.excalidraw",
    document: createScene("system", 2200, 1480, buildSystemDiagram),
  },
];

await mkdir(outputDirectory, { recursive: true });
for (const scene of scenes) {
  const outputPath = resolve(outputDirectory, scene.filename);
  await writeFile(
    outputPath,
    `${JSON.stringify(scene.document, null, 2)}\n`,
    "utf8",
  );
  console.log(outputPath);
}
