import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputDirectory = resolve(process.cwd(), "docs");

const colors = {
  canvas: "#f2f1ed",
  surface: "#faf9f5",
  surfaceMuted: "#ebe9e3",
  ink: "#181816",
  inkSoft: "#34332f",
  muted: "#64615a",
  line: "#b9b5ac",
  accent: "#d84a35",
  accentStrong: "#b53727",
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
  let seed = 2000;
  let versionNonce = 9000;
  const elements = [];

  function base(id, type, x, y, elementWidth, elementHeight, options = {}) {
    const phase = options.phase ?? "v1";
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
      strokeStyle:
        options.strokeStyle ?? (phase === "later" ? "dashed" : "solid"),
      roughness: options.roughness ?? 1,
      opacity: options.opacity ?? 100,
      groupIds: [],
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
      customData: {
        phase,
        ...(options.weight ? { weight: options.weight } : {}),
      },
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
    fontSize = 18,
    options = {},
  ) {
    elements.push({
      ...base(id, "text", x, y, elementWidth, elementHeight, {
        strokeColor: options.color ?? colors.ink,
        strokeWidth: 1,
        roughness: 0,
        roundness: null,
        phase: options.phase,
        weight: options.weight,
      }),
      text: value,
      fontSize,
      fontFamily: 6,
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
          strokeWidth: options.strokeWidth ?? 2,
          strokeStyle: options.strokeStyle,
          phase: options.phase,
          roughness: 1,
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
    rectangle(`${id}-box`, x, y, elementWidth, elementHeight, options);
    text(
      `${id}-title`,
      x + 18,
      y + 14,
      elementWidth - 36,
      options.titleHeight ?? 32,
      title,
      options.titleSize ?? 19,
      {
        align: options.titleAlign ?? "left",
        color: options.titleColor ?? options.strokeColor ?? colors.ink,
        weight: 700,
        phase: options.phase,
      },
    );
    text(
      `${id}-body`,
      x + 18,
      y + (options.bodyTop ?? 54),
      elementWidth - 36,
      elementHeight - (options.bodyTop ?? 54) - 14,
      body,
      options.bodySize ?? 15,
      {
        align: options.bodyAlign ?? "left",
        verticalAlign: options.bodyVerticalAlign ?? "top",
        color: options.bodyColor ?? colors.inkSoft,
        lineHeight: options.lineHeight ?? 1.32,
        phase: options.phase,
      },
    );
  }

  function badge(id, x, y, elementWidth, value, options = {}) {
    const height = options.height ?? 30;
    rectangle(id, x, y, elementWidth, height, {
      strokeColor: options.strokeColor ?? colors.ink,
      backgroundColor: options.backgroundColor ?? colors.ink,
      strokeWidth: options.strokeWidth ?? 1,
      phase: options.phase,
    });
    text(
      `${id}-text`,
      x + 7,
      y + 2,
      elementWidth - 14,
      height - 4,
      value,
      options.fontSize ?? 14,
      {
        color: options.color ?? colors.white,
        weight: 700,
        phase: options.phase,
      },
    );
  }

  function lane(id, x, y, laneWidth, laneHeight, title, subtitle, options = {}) {
    rectangle(`${id}-box`, x, y, laneWidth, laneHeight, {
      strokeColor: options.strokeColor ?? colors.line,
      backgroundColor: options.backgroundColor ?? colors.surface,
      strokeWidth: options.strokeWidth ?? 1,
      phase: options.phase,
    });
    text(`${id}-title`, x + 24, y + 15, 340, 30, title, 20, {
      align: "left",
      color: options.titleColor ?? colors.ink,
      weight: 700,
      phase: options.phase,
    });
    text(`${id}-subtitle`, x + 390, y + 16, laneWidth - 420, 28, subtitle, 14, {
      align: "right",
      color: colors.muted,
      phase: options.phase,
    });
  }

  build({ rectangle, text, arrow, node, badge, lane });

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
      currentItemFontFamily: 6,
      currentItemStrokeColor: colors.ink,
      currentItemBackgroundColor: "transparent",
      currentItemFillStyle: "solid",
      currentItemStrokeWidth: 2,
      currentItemStrokeStyle: "solid",
      currentItemRoughness: 1,
      currentItemOpacity: 100,
      currentItemRoundness: "round",
      scrollX: 30,
      scrollY: 30,
      zoom: { value: 0.5 },
    },
    files: {},
  };
}

function buildControlPlane(api) {
  const { rectangle, text, arrow, node, badge, lane } = api;

  rectangle("background", 20, 20, 2460, 1380, {
    strokeColor: "transparent",
    backgroundColor: colors.surface,
    strokeWidth: 0,
    locked: true,
  });
  text(
    "title",
    75,
    50,
    1500,
    54,
    "Talent Signal agent control plane",
    38,
    { align: "left", weight: 700 },
  );
  text(
    "subtitle",
    78,
    108,
    1540,
    34,
    "Models propose. The control plane authorizes. Destinations prove effects.",
    19,
    { align: "left", color: colors.muted },
  );
  arrow("legend-v1", [[1970, 75], [2040, 75]], {
    endArrowhead: null,
    strokeWidth: 3,
  });
  text("legend-v1-text", 2055, 59, 125, 32, "V1 contract", 15, {
    align: "left",
  });
  arrow("legend-later", [[1970, 118], [2040, 118]], {
    endArrowhead: null,
    strokeColor: colors.future,
    strokeWidth: 3,
    phase: "later",
  });
  text("legend-later-text", 2055, 102, 190, 32, "Later / optional", 15, {
    align: "left",
    color: colors.future,
    phase: "later",
  });

  lane(
    "surface-lane",
    70,
    180,
    470,
    1115,
    "1 · Product surfaces",
    "intent + review",
    { backgroundColor: colors.futureFill },
  );
  node(
    "ios",
    105,
    255,
    190,
    126,
    "iOS",
    "Capture · Today\nreview · approve",
    { backgroundColor: colors.surface, strokeColor: colors.ink },
  );
  node(
    "web",
    315,
    255,
    190,
    126,
    "Web",
    "Evidence desk\ncandidate living page",
    { backgroundColor: colors.surface, strokeColor: colors.ink },
  );
  node(
    "browser",
    105,
    410,
    190,
    126,
    "Browser extension",
    "Selected capture\nreview deep link",
    {
      backgroundColor: colors.surface,
      strokeColor: colors.future,
      titleColor: colors.future,
      phase: "later",
    },
  );
  node(
    "wechat",
    315,
    410,
    190,
    126,
    "WeChat / OpenClaw",
    "Capture · Today\nsnooze · task status",
    {
      backgroundColor: colors.surface,
      strokeColor: colors.future,
      titleColor: colors.future,
      phase: "later",
    },
  );
  node(
    "byoa",
    105,
    565,
    400,
    140,
    "Bring-your-own agent",
    "Codex · Claude Desktop · Cursor · Manus\nthrough one scoped remote MCP",
    {
      backgroundColor: colors.surface,
      strokeColor: colors.future,
      titleColor: colors.future,
      phase: "later",
    },
  );
  arrow("surfaces-gateway", [[505, 323], [635, 323]], {
    strokeColor: colors.blue,
    strokeWidth: 3,
  });
  arrow("byoa-gateway", [[505, 635], [570, 635], [570, 350], [635, 350]], {
    strokeColor: colors.future,
    phase: "later",
  });
  rectangle("surface-rule-box", 105, 765, 400, 180, {
    strokeColor: colors.accent,
    backgroundColor: colors.accentSoft,
    strokeWidth: 2,
  });
  text("surface-rule-title", 128, 785, 350, 32, "Surface rule", 19, {
    align: "left",
    color: colors.accentStrong,
    weight: 700,
  });
  text(
    "surface-rule-body",
    128,
    832,
    350,
    92,
    "Every surface may capture intent and show review.\nNo surface owns canonical candidate state.",
    16,
    {
      align: "left",
      verticalAlign: "top",
      color: colors.inkSoft,
      lineHeight: 1.45,
    },
  );

  lane(
    "control-lane",
    590,
    180,
    990,
    1115,
    "2 · Agent control plane",
    "identity · policy · context · lifecycle",
    { backgroundColor: colors.blueSoft, strokeColor: colors.blue },
  );
  node(
    "gateway",
    635,
    255,
    260,
    135,
    "Agent Gateway",
    "Auth · tenant · idempotency\nrate and budget guards",
    { backgroundColor: colors.surface, strokeColor: colors.blue },
  );
  node(
    "task",
    930,
    255,
    260,
    135,
    "Task & Run service",
    "definition · task · run\ncheckpoint · branch · artifact",
    { backgroundColor: colors.surface, strokeColor: colors.blue },
  );
  node(
    "context",
    1225,
    255,
    310,
    135,
    "Context Compiler",
    "objective + policy + evidence\nstate + memory + tool schemas",
    { backgroundColor: colors.surface, strokeColor: colors.blue },
  );
  arrow("gateway-task", [[895, 323], [930, 323]], {
    strokeColor: colors.blue,
    strokeWidth: 3,
  });
  arrow("task-context", [[1190, 323], [1225, 323]], {
    strokeColor: colors.blue,
    strokeWidth: 3,
  });

  node(
    "definition",
    635,
    435,
    260,
    145,
    "Agent Definition",
    "versioned method\nskills · tools · output\nmodel policy · budgets",
    { backgroundColor: colors.surface, strokeColor: colors.violet },
  );
  node(
    "policy",
    930,
    435,
    260,
    145,
    "Policy Engine",
    "role + tenant + risk\nconsent + destination\ncurrent state + TTL",
    { backgroundColor: colors.surface, strokeColor: colors.accent },
  );
  node(
    "inbox",
    1225,
    435,
    310,
    145,
    "Attention Inbox",
    "fact review ≠ action approval\nclarify · ignore · edit · approve",
    { backgroundColor: colors.surface, strokeColor: colors.accent },
  );
  arrow("definition-task", [[765, 435], [765, 390]], {
    strokeColor: colors.violet,
  });
  arrow("policy-task", [[1060, 435], [1060, 390]], {
    strokeColor: colors.accent,
  });
  arrow("inbox-task", [[1380, 435], [1380, 390], [1190, 390]], {
    strokeColor: colors.accent,
  });

  rectangle("boundary-box", 635, 635, 900, 224, {
    strokeColor: colors.accent,
    backgroundColor: colors.surface,
    strokeWidth: 3,
  });
  text("boundary-title", 665, 655, 835, 32, "Capability Broker · the only effect boundary", 21, {
    align: "left",
    color: colors.accentStrong,
    weight: 700,
  });
  text(
    "boundary-body",
    665,
    707,
    835,
    72,
    "Resolve scoped capability → preview exact diff → collect approval →\nre-check policy at execution → call adapter → verify destination observation",
    17,
    {
      align: "left",
      verticalAlign: "top",
      lineHeight: 1.45,
    },
  );
  badge("boundary-gate-a", 665, 800, 248, "FACT CONFIRMATION", {
    backgroundColor: colors.ink,
    strokeColor: colors.ink,
  });
  badge("boundary-gate-b", 928, 800, 258, "ACTION APPROVAL", {
    backgroundColor: colors.accentStrong,
    strokeColor: colors.accentStrong,
  });
  badge("boundary-gate-c", 1201, 800, 299, "DESTINATION VERIFICATION", {
    backgroundColor: colors.success,
    strokeColor: colors.success,
  });

  node(
    "audit",
    635,
    920,
    420,
    155,
    "Audit & evaluation",
    "trajectory + outcome traces\nprompt · model · tool · approval versions\nrelease gates and replay corpus",
    { backgroundColor: colors.surface, strokeColor: colors.ink },
  );
  node(
    "ops",
    1085,
    920,
    450,
    155,
    "Operations",
    "dead letters · unknown-effect reconciliation\ncost/latency budgets · redaction\nretention and deletion jobs",
    { backgroundColor: colors.surface, strokeColor: colors.ink },
  );

  lane(
    "runtime-lane",
    1630,
    180,
    780,
    650,
    "3 · Runtime adapters",
    "replaceable compute",
    { backgroundColor: colors.violetSoft, strokeColor: colors.violet },
  );
  node(
    "workflow",
    1675,
    255,
    320,
    155,
    "Governed workflow",
    "known stages and schemas\npause/resume at review gates\nprimary capture runtime",
    { backgroundColor: colors.surface, strokeColor: colors.violet },
  );
  node(
    "model",
    2040,
    255,
    325,
    155,
    "Model adapters",
    "OCR · extraction · synthesis\nstructured outputs\nprovider-routing policy",
    { backgroundColor: colors.surface, strokeColor: colors.violet },
  );
  arrow("workflow-model", [[1995, 333], [2040, 333]], {
    strokeColor: colors.violet,
    strokeWidth: 3,
  });
  node(
    "durable-agent",
    1675,
    455,
    320,
    155,
    "Durable agent runner",
    "unknown-step research\ncheckpoint · artifact · branch\nstrict capability budget",
    {
      backgroundColor: colors.surface,
      strokeColor: colors.future,
      titleColor: colors.future,
      phase: "later",
    },
  );
  node(
    "external-agent",
    2040,
    455,
    325,
    155,
    "External agent runtimes",
    "Codex · Claude · Cursor · Manus\nread/capture/propose only\nno direct domain writes",
    {
      backgroundColor: colors.surface,
      strokeColor: colors.future,
      titleColor: colors.future,
      phase: "later",
    },
  );
  arrow("durable-external", [[1995, 533], [2040, 533]], {
    strokeColor: colors.future,
    strokeWidth: 3,
    phase: "later",
  });
  arrow("context-workflow", [[1535, 323], [1675, 323]], {
    strokeColor: colors.violet,
    strokeWidth: 3,
  });
  arrow("task-durable", [[1190, 360], [1595, 360], [1595, 533], [1675, 533]], {
    strokeColor: colors.future,
    phase: "later",
  });

  lane(
    "truth-lane",
    1630,
    875,
    780,
    420,
    "4 · Truth, memory & effects",
    "durable and auditable",
    { backgroundColor: colors.successSoft, strokeColor: colors.success },
  );
  node(
    "postgres",
    1675,
    945,
    320,
    138,
    "PostgreSQL",
    "evidence · assertions · state\nproposals · approvals · runs\noutbox · observations · outcomes",
    { backgroundColor: colors.surface, strokeColor: colors.success },
  );
  node(
    "objects",
    2040,
    945,
    325,
    138,
    "Object storage",
    "source blobs · artifacts\nretention class · checksum\naccess and deletion record",
    { backgroundColor: colors.surface, strokeColor: colors.success },
  );
  node(
    "projection",
    1675,
    1115,
    320,
    130,
    "Derived memory",
    "temporal state · timeline\nliving page · retrieval index\nalways rebuildable",
    { backgroundColor: colors.surface, strokeColor: colors.success },
  );
  node(
    "connectors",
    2040,
    1115,
    325,
    130,
    "Connector adapters",
    "Contacts · Calendar · messaging\nATS/CRM · n8n edge workflows\nobserve before success",
    { backgroundColor: colors.surface, strokeColor: colors.success },
  );
  arrow("postgres-projection", [[1835, 1083], [1835, 1115]], {
    strokeColor: colors.success,
  });
  arrow("objects-projection", [[2202, 1083], [2202, 1098], [1995, 1098], [1995, 1180]], {
    strokeColor: colors.success,
  });
  arrow(
    "broker-connectors",
    [[1535, 748], [2440, 748], [2440, 1180], [2365, 1180]],
    {
      strokeColor: colors.accent,
      strokeWidth: 3,
    },
  );
  arrow("task-postgres", [[1190, 390], [1595, 390], [1595, 1015], [1675, 1015]], {
    strokeColor: colors.success,
  });
  arrow("postgres-context", [[1675, 1015], [1605, 1015], [1605, 610], [1380, 610], [1380, 390]], {
    strokeColor: colors.success,
  });
  arrow("connector-observation", [[2202, 1115], [2202, 1098]], {
    strokeColor: colors.success,
  });

  text(
    "footer",
    75,
    1330,
    2300,
    36,
    "Canonical rule: evidence and confirmed state live in the domain database; models, channels, workflows and agents are replaceable adapters.",
    16,
    { align: "center", color: colors.muted },
  );
}

function buildRuntimeFlow(api) {
  const { rectangle, text, arrow, node, badge, lane } = api;

  rectangle("background", 20, 20, 2740, 1430, {
    strokeColor: "transparent",
    backgroundColor: colors.surface,
    strokeWidth: 0,
    locked: true,
  });
  text(
    "title",
    75,
    50,
    1600,
    54,
    "One episode: evidence → governed action → verified learning",
    37,
    { align: "left", weight: 700 },
  );
  text(
    "subtitle",
    78,
    108,
    1700,
    34,
    "The ordinary screenshot path is a resumable workflow, not an autonomous multi-agent conversation.",
    19,
    { align: "left", color: colors.muted },
  );
  arrow("legend-v1", [[2240, 75], [2310, 75]], {
    endArrowhead: null,
    strokeWidth: 3,
  });
  text("legend-v1-text", 2325, 59, 125, 32, "V1 contract", 15, {
    align: "left",
  });
  arrow("legend-later", [[2240, 118], [2310, 118]], {
    endArrowhead: null,
    strokeColor: colors.future,
    strokeWidth: 3,
    phase: "later",
  });
  text("legend-later-text", 2325, 102, 190, 32, "Later / learning", 15, {
    align: "left",
    color: colors.future,
    phase: "later",
  });

  lane(
    "evidence-lane",
    70,
    185,
    2620,
    405,
    "A · Evidence compilation",
    "Nothing becomes candidate state before recruiter confirmation.",
    { backgroundColor: colors.blueSoft, strokeColor: colors.blue },
  );
  const evidenceNodes = [
    {
      id: "capture",
      x: 110,
      title: "1 · Intentional capture",
      body: "screenshot · share\npaste · photo\nsource consent + retention",
    },
    {
      id: "episode",
      x: 505,
      title: "2 · Episode",
      body: "immutable source\nchecksum · tenant\nactor · captured_at",
    },
    {
      id: "extract",
      x: 900,
      title: "3 · Typed evidence",
      body: "spans · speakers\ndates · OCR confidence\nexact source anchors",
    },
    {
      id: "assert",
      x: 1295,
      title: "4 · Assertions",
      body: "candidate identity\nfield + before/after\nconflict · uncertainty · TTL",
    },
    {
      id: "review",
      x: 1690,
      title: "5 · Fact review",
      body: "inspect original quote\ncorrect · confirm · ignore\nclarify or no_action",
    },
    {
      id: "state",
      x: 2085,
      title: "6 · Confirmed state",
      body: "temporal record\nprovenance + version\nreversible domain event",
    },
  ];
  for (const item of evidenceNodes) {
    node(item.id, item.x, 285, 320, 210, item.title, item.body, {
      backgroundColor: colors.surface,
      strokeColor:
        item.id === "review"
          ? colors.accent
          : item.id === "state"
            ? colors.success
            : colors.blue,
      titleColor:
        item.id === "review"
          ? colors.accentStrong
          : item.id === "state"
            ? colors.success
            : colors.blue,
      titleSize: 18,
      bodySize: 15,
      bodyTop: 62,
    });
  }
  for (let index = 0; index < evidenceNodes.length - 1; index += 1) {
    arrow(
      `evidence-${index}`,
      [
        [evidenceNodes[index].x + 320, 390],
        [evidenceNodes[index + 1].x, 390],
      ],
      {
        strokeColor:
          index === 3
            ? colors.accent
            : index === 4
              ? colors.success
              : colors.blue,
        strokeWidth: 3,
      },
    );
  }
  badge("fact-gate", 1750, 515, 200, "GATE 1 · CONFIRM", {
    backgroundColor: colors.accentStrong,
    strokeColor: colors.accentStrong,
  });

  lane(
    "action-lane",
    70,
    635,
    2620,
    455,
    "B · Governed action",
    "A proposal is not permission. An API response is not proof.",
    { backgroundColor: colors.accentSoft, strokeColor: colors.accent },
  );
  const actionNodes = [
    {
      id: "signal",
      x: 110,
      title: "7 · Signal builder",
      body: "confirmed changes only\nurgency + expiry\ncandidate/recruiter control",
    },
    {
      id: "proposal",
      x: 505,
      title: "8 · Action proposal",
      body: "one smallest step\nexact target + fields\nreason + risk + undo",
    },
    {
      id: "approval",
      x: 900,
      title: "9 · Preview & approve",
      body: "show final payload\nedit · snooze · reject\nfresh approval token",
    },
    {
      id: "execute",
      x: 1295,
      title: "10 · Capability Broker",
      body: "re-check identity/policy\nidempotency + adapter\noutbox + retry budget",
    },
    {
      id: "observe",
      x: 1690,
      title: "11 · Observe effect",
      body: "read destination state\nverified / failed / unknown\nreconcile or compensate",
    },
    {
      id: "outcome",
      x: 2085,
      title: "12 · Outcome",
      body: "accepted · edited · sent\nreplied · met · moved\nlatency and user control",
    },
  ];
  for (const item of actionNodes) {
    node(item.id, item.x, 750, 320, 225, item.title, item.body, {
      backgroundColor: colors.surface,
      strokeColor:
        item.id === "approval" || item.id === "execute"
          ? colors.accent
          : item.id === "observe" || item.id === "outcome"
            ? colors.success
            : colors.ink,
      titleColor:
        item.id === "approval" || item.id === "execute"
          ? colors.accentStrong
          : item.id === "observe" || item.id === "outcome"
            ? colors.success
            : colors.ink,
      titleSize: 18,
      bodySize: 15,
      bodyTop: 62,
    });
  }
  for (let index = 0; index < actionNodes.length - 1; index += 1) {
    arrow(
      `action-${index}`,
      [
        [actionNodes[index].x + 320, 862],
        [actionNodes[index + 1].x, 862],
      ],
      {
        strokeColor:
          index === 1 || index === 2
            ? colors.accent
            : index >= 3
              ? colors.success
              : colors.ink,
        strokeWidth: 3,
      },
    );
  }
  arrow("state-to-signal", [[2245, 495], [2245, 610], [270, 610], [270, 750]], {
    strokeColor: colors.success,
    strokeWidth: 3,
  });
  badge("approval-gate", 960, 995, 200, "GATE 2 · APPROVE", {
    backgroundColor: colors.accentStrong,
    strokeColor: colors.accentStrong,
  });
  badge("verify-gate", 1750, 995, 200, "GATE 3 · VERIFY", {
    backgroundColor: colors.success,
    strokeColor: colors.success,
  });

  lane(
    "memory-lane",
    70,
    1135,
    2620,
    240,
    "C · Memory and learning",
    "The Wiki is a projection; learning is proposed and reviewable.",
    { backgroundColor: colors.successSoft, strokeColor: colors.success },
  );
  node(
    "memory",
    205,
    1200,
    495,
    125,
    "Temporal relationship memory",
    "confirmed state · evidence lineage · expiry · supersession",
    { backgroundColor: colors.surface, strokeColor: colors.success },
  );
  node(
    "wiki",
    835,
    1200,
    495,
    125,
    "Living page / Wiki",
    "timeline · open questions · next step · rebuildable views",
    { backgroundColor: colors.surface, strokeColor: colors.success },
  );
  node(
    "learning",
    1465,
    1200,
    495,
    125,
    "Learning proposal",
    "recruiter preference or playbook only after repeated outcomes",
    {
      backgroundColor: colors.surface,
      strokeColor: colors.future,
      titleColor: colors.future,
      phase: "later",
    },
  );
  node(
    "eval",
    2095,
    1200,
    455,
    125,
    "Evaluation loop",
    "replay corpus · trajectory score · outcome metrics · release gates",
    { backgroundColor: colors.surface, strokeColor: colors.ink },
  );
  arrow("outcome-memory", [[2245, 975], [2245, 1120], [452, 1120], [452, 1200]], {
    strokeColor: colors.success,
    strokeWidth: 3,
  });
  arrow("memory-wiki", [[700, 1262], [835, 1262]], {
    strokeColor: colors.success,
  });
  arrow("wiki-learning", [[1330, 1262], [1465, 1262]], {
    strokeColor: colors.future,
    phase: "later",
  });
  arrow("learning-eval", [[1960, 1262], [2095, 1262]], {
    strokeColor: colors.future,
    phase: "later",
  });
  arrow("outcome-eval", [[2405, 975], [2405, 1200]], {
    strokeColor: colors.ink,
  });

  rectangle("failure-box", 110, 1390, 2440, 38, {
    strokeColor: colors.ink,
    backgroundColor: colors.surfaceMuted,
    strokeWidth: 1,
  });
  text(
    "failure-text",
    130,
    1393,
    2400,
    30,
    "At every step: ambiguous identity → ask; weak evidence → no_action; duplicate → reuse; stale approval → re-preview; unknown effect → reconcile, never claim success.",
    15,
    { align: "center", color: colors.inkSoft, weight: 700 },
  );
}

const scenes = [
  {
    filename: "talent-signal-agent-control-plane.excalidraw",
    scene: createScene("agent-control", 2500, 1420, buildControlPlane),
  },
  {
    filename: "talent-signal-agent-runtime-flow.excalidraw",
    scene: createScene("agent-runtime", 2780, 1470, buildRuntimeFlow),
  },
];

for (const { filename, scene } of scenes) {
  await writeFile(
    resolve(outputDirectory, filename),
    `${JSON.stringify(scene, null, 2)}\n`,
    "utf8",
  );
  console.log(`Wrote docs/${filename}`);
}
