/* Talent Signal · 开场三幕交互
   Act 1 install window is static artwork. Motion and demo controls belong
   to first-launch and the evidence moment. Reduced motion jumps to final state. */

(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TRANSITION_MS = reduceMotion ? 0 : 760;

  const desk = document.querySelector(".desk");
  const tabs = Array.from(document.querySelectorAll(".scene-tabs [role='tab']"));
  const scenes = {
    install: document.getElementById("scene-install"),
    launch: document.getElementById("scene-launch"),
    deep: document.getElementById("scene-deep"),
  };

  const notesToggle = document.getElementById("notes-toggle");
  const designNotes = document.getElementById("design-notes");
  const demoDrag = document.getElementById("demo-drag");
  const volume = document.getElementById("install-volume");

  const launchWelcome = document.getElementById("launch-welcome");
  const launchEntries = document.getElementById("launch-entries");
  const connectForm = document.getElementById("connect-form");
  const workspaceUrl = document.getElementById("workspace-url");
  const urlError = document.getElementById("url-error");
  const probeResult = document.getElementById("probe-result");
  const testConnection = document.getElementById("test-connection");
  const tryExample = document.getElementById("try-example");

  const unfold = document.getElementById("unfold");
  const insightList = document.getElementById("insight-list");
  const editNote = document.getElementById("edit-note");
  const sourceQuote = document.getElementById("source-quote");

  let launchEntered = false;

  function showScene(name) {
    Object.entries(scenes).forEach(([key, el]) => {
      const on = key === name;
      el.hidden = !on;
      if (on) el.focus({ preventScroll: true });
    });
    tabs.forEach((tab) => {
      tab.setAttribute("aria-selected", tab.dataset.scene === name ? "true" : "false");
    });
    desk.dataset.scene = name;
    demoDrag.hidden = name !== "install";
    if (name === "launch") enterLaunch();
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.scene;
      if (history.replaceState) history.replaceState(null, "", "#" + name);
      showScene(name);
    });
    tab.addEventListener("keydown", (event) => {
      const idx = tabs.indexOf(tab);
      if (event.key === "ArrowRight") {
        event.preventDefault();
        const next = tabs[(idx + 1) % tabs.length];
        next.focus();
        showScene(next.dataset.scene);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
        prev.focus();
        showScene(prev.dataset.scene);
      }
    });
  });

  const initial = (location.hash || "").replace(/^#/, "");
  if (initial && scenes[initial]) showScene(initial);

  notesToggle.addEventListener("click", () => {
    const open = notesToggle.getAttribute("aria-expanded") === "true";
    notesToggle.setAttribute("aria-expanded", open ? "false" : "true");
    designNotes.hidden = open;
  });

  function playInstallGesture() {
    if (reduceMotion) {
      volume.dataset.demo = "copied";
      window.setTimeout(() => {
        delete volume.dataset.demo;
      }, 400);
      return;
    }
    volume.dataset.demo = "dragging";
    window.setTimeout(() => {
      volume.dataset.demo = "copied";
      window.setTimeout(() => {
        delete volume.dataset.demo;
      }, 720);
    }, 540);
  }

  demoDrag.addEventListener("click", playInstallGesture);

  /* ——— Act 2: welcome → entries (600–900ms) ——— */

  function showLaunchEntries() {
    launchWelcome.hidden = true;
    launchEntries.hidden = false;
  }

  function enterLaunch() {
    if (launchEntered) return;
    launchEntered = true;

    const jumpFinal = reduceMotion || new URLSearchParams(location.search).get("final") === "1";
    if (jumpFinal) {
      showLaunchEntries();
      return;
    }

    launchWelcome.hidden = false;
    launchWelcome.dataset.phase = "in";
    launchEntries.hidden = true;

    window.setTimeout(() => {
      launchWelcome.dataset.phase = "out";
      window.setTimeout(() => {
        showLaunchEntries();
        workspaceUrl.focus({ preventScroll: true });
      }, TRANSITION_MS);
    }, 880);
  }

  function parseWorkspace(value) {
    const raw = value.trim();
    if (!raw) return null;
    let candidate = raw;
    if (!/^https?:\/\//i.test(candidate)) {
      if (/^localhost(?::\d+)?(?:\/|$)/i.test(candidate) || /^127\./.test(candidate)) {
        candidate = "http://" + candidate;
      } else {
        candidate = "https://" + candidate;
      }
    }
    try {
      const url = new URL(candidate);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      if (url.protocol === "http:" && !/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname)) {
        return null;
      }
      return url;
    } catch {
      return null;
    }
  }

  function setUrlError(message) {
    if (!message) {
      urlError.hidden = true;
      urlError.textContent = "";
      return;
    }
    urlError.hidden = false;
    urlError.textContent = message;
  }

  workspaceUrl.addEventListener("input", () => {
    setUrlError("");
    probeResult.hidden = true;
  });

  connectForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const url = parseWorkspace(workspaceUrl.value);
    if (!url) {
      setUrlError("需要 HTTPS 工作区地址。");
      workspaceUrl.focus();
      return;
    }
    setUrlError("");
    probeResult.hidden = false;
    probeResult.dataset.state = "ok";
    probeResult.textContent = `将打开 ${url.toString()}。在此设计稿中不会真正跳转。`;
  });

  testConnection.addEventListener("click", () => {
    const url = parseWorkspace(workspaceUrl.value);
    if (!url) {
      setUrlError("需要 HTTPS 工作区地址。");
      workspaceUrl.focus();
      return;
    }
    setUrlError("");
    probeResult.hidden = false;
    probeResult.dataset.state = "ok";
    probeResult.textContent = `可访问 · ${url.host}（演示结果）`;
  });

  tryExample.addEventListener("click", () => showScene("deep"));

  /* ——— Act 3: one sentence → three sourced results ——— */

  const spanMap = {
    budget: sourceQuote.querySelector('[data-span="budget"]'),
    thu: sourceQuote.querySelector('[data-span="thu"]'),
    all: sourceQuote.querySelector('[data-span="all"]'),
  };

  function clearLit() {
    Object.values(spanMap).forEach((el) => el && el.classList.remove("is-lit"));
    insightList.querySelectorAll(".insight").forEach((el) => el.classList.remove("is-active"));
  }

  function lightSource(key, card) {
    clearLit();
    const span = spanMap[key];
    if (span) span.classList.add("is-lit");
    if (card) card.classList.add("is-active");
  }

  unfold.addEventListener("click", () => {
    insightList.hidden = false;
    insightList.classList.add("is-in");
    unfold.disabled = true;
    unfold.textContent = "已展开";
    lightSource("budget", insightList.querySelector('[data-span-target="budget"]'));
  });

  insightList.addEventListener("click", (event) => {
    const card = event.target.closest(".insight");
    if (!card) return;
    lightSource(card.dataset.spanTarget, card);
  });

  insightList.addEventListener("focusin", (event) => {
    const card = event.target.closest(".insight");
    if (card) lightSource(card.dataset.spanTarget, card);
  });

  insightList.querySelectorAll(".insight-body").forEach((body) => {
    body.addEventListener("input", () => {
      editNote.hidden = false;
    });
  });

  sourceQuote.addEventListener("click", (event) => {
    const span = event.target.closest("[data-span]");
    if (!span) return;
    const key = span.dataset.span;
    const card = insightList.querySelector(`[data-span-target="${key}"]`);
    if (card) lightSource(key, card);
  });
})();
