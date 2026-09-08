"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  ArrowUpRight,
  ArrowCounterClockwise,
  Pause,
  Play,
  ChatsCircle,
  LinkedinLogo,
  GithubLogo,
  X,
  Check,
} from "@phosphor-icons/react";
import type { MarketingLocale } from "@/lib/marketing-locale";
import {
  advanceFilmTime,
  filmCanAdvance,
  filmChapter,
  FILM_DURATION,
  type FilmIntent,
} from "@/lib/relationship-film";
import { useReducedMotionPreference } from "@/lib/use-reduced-motion";
import { ActionMark, PersonPortrait } from "./relationship-universe";
import f from "./relationship-film.module.css";

function subscribeVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}
const pageVisible = () => document.visibilityState === "visible";
const serverVisible = () => false;

const copy = {
  "zh-CN": {
    title: ["每一次相遇，", "都有更大的可能。"],
    promise: "人物的背景，与你的世界，自动相连。",
    chapters: [
      "一次相遇",
      "跨平台的背景",
      "同一个人",
      "原来，你们之间已有连接",
    ],
    captions: [
      "从一句话，认识一个人的世界。",
      "她的档案与作品，指向同一个人。",
      "正在做设计 Agent，想认识产品团队。",
      "你上周见过的 Alex，曾和 Maya 一起做过 Atlas。",
    ],
    message: "最近在做设计 Agent，想认识一些产品团队。",
    capture: "捕捉这次相遇",
    work: "正在做设计 Agent",
    you: "你",
    known: "上周的会面",
    newPerson: "你刚遇见的人",
    shared: "一起做过 Atlas",
    note: "未来体验 · 合成案例",
    pause: "暂停短片",
    resume: "继续播放",
    replay: "重播短片",
    reducedPlay: "播放动效短片",
    inspect: "看看这条连接",
    close: "关闭来源",
    source: "这份发现，从哪里来？",
    identity:
      "IM 消息分享了 maya-builds 项目，公开档案与作品也互相链接到同一账号。另一个同名 Maya C. 缺少关联线索，未合并。",
    quote: "“Maya 和我一起做过 Atlas 的第一版原型。”",
    sourceDate: "你的会面笔记 · 2026 年 9 月 3 日",
    boundary:
      "笔记记录了你和 Alex 的会面，也记录了 Alex 与 Maya 的既往合作。可以问问 Alex 是否愿意介绍；这不表示介绍已获同意，或两人现在仍有联系。",
    remove: "移除这条连接的依据",
    removed: "来源已移除。这条关系路径不再成立。",
    removedDetail:
      "Maya 的公开作品保留；会面背景与介绍建议已撤下。重播不会恢复已移除的依据。",
    still: "静态呈现",
    suspended: "播放已暂停",
    complete: "让每次相遇，都有下一种可能。",
  },
  en: {
    title: ["Every encounter.", "A world of possibility."],
    promise: "A person’s context meets the people in your world.",
    chapters: [
      "An encounter",
      "Across platforms",
      "One person",
      "A connection you hadn’t seen",
    ],
    captions: [
      "One message opens a person’s world.",
      "Her profile and work point to one person.",
      "Building a design agent. Looking for product teams.",
      "Alex, from last week’s coffee, built Atlas with Maya.",
    ],
    message: "Building a design agent. Hoping to meet a few product teams.",
    capture: "Capture this encounter",
    work: "Building a design agent",
    you: "You",
    known: "Last week’s coffee",
    newPerson: "Someone you just met",
    shared: "Built Atlas together",
    note: "Future experience · Synthetic people",
    pause: "Pause film",
    resume: "Continue film",
    replay: "Replay film",
    reducedPlay: "Play the animated film",
    inspect: "Explore this connection",
    close: "Close sources",
    source: "Where did this discovery come from?",
    identity:
      "The IM message shares maya-builds. The public profile and project explicitly link to the same account. Another Maya C. has no matching account link and remains separate.",
    quote: "“Maya and I built the first Atlas prototype together.”",
    sourceDate: "Your meeting note · September 3, 2026",
    boundary:
      "The note records your meeting with Alex and Alex’s past collaboration with Maya. You could ask Alex about an introduction; it does not establish agreement to introduce you or a current connection.",
    remove: "Remove the evidence for this connection",
    removed: "Source removed. This relationship path is no longer supported.",
    removedDetail:
      "Maya’s public work remains. The meeting context and introduction suggestion have been withdrawn. Replay does not restore removed evidence.",
    still: "Still presentation",
    suspended: "Playback suspended",
    complete: "Every encounter has another possibility.",
  },
};

function ResearchCard({
  time,
  index,
  locale,
}: {
  time: MotionValue<number>;
  index: 0 | 1;
  locale: MarketingLocale;
}) {
  const start = index ? 1500 : 1050;
  const opacity = useTransform(
    time,
    [start, start + 350, 2400, 3000],
    [0, 1, 1, 0],
  );
  const left = useTransform(
    time,
    [start, start + 350, 2400, 3100],
    index ? ["86%", "75%", "75%", "50%"] : ["14%", "25%", "25%", "50%"],
  );
  const scale = useTransform(
    time,
    [start, start + 350, 2400, 3100],
    [0.75, 1, 1, 0.35],
  );
  const rotate = useTransform(
    time,
    [start, 2400, 3100],
    [index ? 10 : -10, index ? 5 : -5, 0],
  );
  const Icon = index ? GithubLogo : LinkedinLogo;
  return (
    <motion.div
      className={`${f.research} ${index ? f.project : f.profile}`}
      style={{ left, opacity, scale, rotate, x: "-50%", y: "-50%" }}
      aria-hidden="true"
    >
      <span>
        <Icon size={19} />
        {index ? "GitHub" : "LinkedIn"}
      </span>
      <strong>{index ? "design-agent" : "Maya Chen"}</strong>
      <p>
        {index
          ? "maya-builds / design-agent"
          : locale === "en"
            ? "Building tools for thought."
            : "创造让人思考的工具。"}
      </p>
      <small>
        <Check size={13} />
        maya-builds
      </small>
    </motion.div>
  );
}

export function RelationshipFilm({
  locale,
  bridgeAvailable,
  onRemoveBridge,
  replayRequest,
}: {
  locale: MarketingLocale;
  bridgeAvailable: boolean;
  onRemoveBridge: () => void;
  replayRequest: number;
}) {
  const c = copy[locale];
  const sentinel = useRef<HTMLSpanElement>(null);
  const inView = useInView(sentinel, { amount: "all" });
  const visible = useSyncExternalStore(
    subscribeVisibility,
    pageVisible,
    serverVisible,
  );
  const reduced = useReducedMotionPreference();
  const time = useMotionValue(0);
  const [chapter, setChapter] = useState<0 | 1 | 2 | 3>(0);
  const [intent, setIntent] = useState<FilmIntent>("automatic");
  const [optIn, setOptIn] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const initialized = useRef(false);
  const requested = useRef(replayRequest);
  const reducedWas = useRef(reduced);
  const running = filmCanAdvance({
    intent,
    inView,
    pageVisible: visible,
    reducedMotion: reduced,
    motionOptIn: optIn,
    inspecting,
    sourceAvailable: bridgeAvailable,
  });
  const lastChapter = useRef(0);
  useMotionValueEvent(time, "change", (value) => {
    const next = filmChapter(value);
    if (next !== lastChapter.current) {
      lastChapter.current = next;
      setChapter(next);
    }
  });
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      // Read the client preference before the first frame, not the SSR fallback.
      const prefersReduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (!initialized.current) {
        initialized.current = true;
        if (prefersReduced) {
          time.set(FILM_DURATION);
          setIntent("complete");
        }
      }
      if (reduced && !reducedWas.current) {
        setOptIn(false);
        time.set(FILM_DURATION);
        setIntent("complete");
      }
      reducedWas.current = reduced;
    });
    return () => cancelAnimationFrame(frame);
  }, [reduced, time]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!bridgeAvailable) {
        time.set(FILM_DURATION);
        setIntent("complete");
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [bridgeAvailable, time]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (requested.current === replayRequest) return;
      requested.current = replayRequest;
      setInspecting(false);
      if (bridgeAvailable && (!reduced || optIn)) {
        time.set(0);
        setIntent("playing");
      } else {
        time.set(FILM_DURATION);
        setIntent("complete");
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [replayRequest, bridgeAvailable, time, reduced, optIn]);
  useEffect(() => {
    if (!running) return;
    // A preference may have been resolved in an earlier effect of this commit.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches && !optIn)
      return;
    let frame = 0;
    let previous: number | undefined;
    const tick = (now: number) => {
      if (previous !== undefined)
        time.set(advanceFilmTime(time.get(), now - previous));
      previous = now;
      if (time.get() >= FILM_DURATION) {
        setIntent("complete");
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, time, optIn]);
  useEffect(() => {
    if (inspecting) {
      panelRef.current?.focus({ preventScroll: true });
      panelRef.current?.scrollIntoView({
        block: "nearest",
        behavior: reduced ? "instant" : "smooth",
      });
    }
  }, [inspecting, reduced]);
  function replay() {
    setInspecting(false);
    if (!bridgeAvailable) return;
    time.set(0);
    setOptIn(true);
    setIntent("playing");
  }
  function inspect() {
    setIntent("paused");
    setInspecting(true);
  }
  const backgroundColor = useTransform(
    time,
    [0, 3400, 4700],
    ["#f5f4ef", "#f5f4ef", "#182c22"],
  );
  const color = useTransform(
    time,
    [0, 3400, 4700],
    ["#172319", "#172319", "#f5f7ed"],
  );
  const messageOpacity = useTransform(time, [0, 1500, 2700], [1, 1, 0]);
  const messageScale = useTransform(time, [0, 1000, 2700], [1, 1, 0.62]);
  const messageRotate = useTransform(time, [0, 1200, 2700], [-4, -4, -13]);
  const messageX = useTransform(
    time,
    [0, 1200, 2700],
    ["-50%", "-50%", "-83%"],
  );
  const keyScale = useTransform(
    time,
    [0, 650, 850, 1080, 1400],
    [1, 1, 0.86, 1.06, 1],
  );
  const keyY = useTransform(time, [0, 650, 850, 1080, 1400], [0, 0, 8, -3, 0]);
  const mayaOpacity = useTransform(time, [0, 2300, 2950], [0, 0, 1]);
  const mayaScale = useTransform(
    time,
    [0, 2300, 3000, 3550, 4650],
    [0.4, 0.4, 1.28, 1.28, 1],
  );
  const mayaLeft = useTransform(time, [0, 3550, 4750], ["50%", "50%", "80%"]);
  const infoOpacity = useTransform(
    time,
    [2700, 3100, 3700, 4200],
    [0, 1, 1, 0],
  );
  const networkOpacity = useTransform(time, [3500, 4300], [0, 1]);
  const networkScale = useTransform(time, [3500, 4700], [0.65, 1]);
  const alexScale = useTransform(time, [3700, 4300, 4850], [0.35, 1.12, 1]);
  const knownLine = useTransform(time, [4000, 4500], [0, 1]);
  const newLine = useTransform(time, [4300, 5050], [0, 1]);
  const noteOpacity = useTransform(time, [4650, 5050], [0, 1]);
  const progress = useTransform(time, [0, FILM_DURATION], [0, 1]);
  const inactive = chapter !== 3;
  return (
    <>
      <motion.section
        id="product"
        className={f.film}
        aria-labelledby="film-title"
        style={{ backgroundColor, color }}
        data-chapter={chapter}
        data-intent={intent}
        data-running={running}
        data-source={bridgeAvailable ? "available" : "removed"}
      >
        <header className={f.heading}>
          <h1 id="film-title">
            {c.title[0]}
            <span>{c.title[1]}</span>
          </h1>
          <p>{c.promise}</p>
        </header>
        <div className={f.stage} aria-hidden="true">
          <span ref={sentinel} className={f.sentinel} />
          <motion.div
            className={f.captureWindow}
            style={{
              opacity: messageOpacity,
              scale: messageScale,
              rotate: messageRotate,
              x: messageX,
              y: "-50%",
            }}
          >
            <div className={f.windowBar}>
              <ChatsCircle size={19} />
              <span>
                {locale === "en"
                  ? "A conversation · WeChat"
                  : "一段对话 · 微信"}
              </span>
            </div>
            <div className={f.sender}>
              <PersonPortrait name="maya" size={52} />
              <div>
                <strong>Maya Chen</strong>
                <span>maya-builds</span>
              </div>
            </div>
            <p className={f.bubble}>{c.message}</p>
            <motion.div
              className={f.captureKey}
              style={{ scale: keyScale, y: keyY }}
            >
              <ActionMark />
            </motion.div>
            <span className={f.captureLabel}>{c.capture}</span>
          </motion.div>
          <ResearchCard time={time} index={0} locale={locale} />
          <ResearchCard time={time} index={1} locale={locale} />
          <motion.div
            className={f.person}
            style={{
              left: mayaLeft,
              opacity: mayaOpacity,
              scale: mayaScale,
              x: "-50%",
              y: "-50%",
            }}
          >
            <PersonPortrait name="maya" size={120} />
            <strong>Maya Chen</strong>
            <span>{chapter === 3 ? c.newPerson : c.work}</span>
            <motion.div
              className={f.personContext}
              style={{ opacity: infoOpacity }}
            >
              <Check size={14} />
              maya-builds<span>LinkedIn · GitHub</span>
            </motion.div>
          </motion.div>
          <motion.div
            className={f.network}
            style={{ opacity: networkOpacity, scale: networkScale }}
          >
            <svg
              className={f.lines}
              viewBox="0 0 1000 400"
              preserveAspectRatio="none"
            >
              <path
                className={f.backgroundLine}
                d="M180 200 Q110 80 80 80 M180 200 Q300 340 360 320"
              />
              {bridgeAvailable && (
                <>
                  <motion.path
                    className={f.knownLine}
                    d="M180 200 C275 200 335 95 480 115"
                    style={{ pathLength: knownLine }}
                  />
                  <motion.path
                    className={f.newLine}
                    d="M480 115 C630 105 655 200 800 200"
                    style={{ pathLength: newLine }}
                  />
                </>
              )}
            </svg>
            <div className={`${f.person} ${f.you}`}>
              <PersonPortrait name="amir" size={100} />
              <strong>{c.you}</strong>
              <span>{locale === "en" ? "Your world" : "你的世界"}</span>
            </div>
            <motion.div
              className={`${f.person} ${f.alex}`}
              style={{ scale: alexScale, x: "-50%", y: "-50%" }}
            >
              <PersonPortrait name="nia" size={116} />
              <strong>Alex</strong>
              <span>
                {bridgeAvailable
                  ? c.known
                  : locale === "en"
                    ? "Source removed"
                    : "来源已移除"}
              </span>
            </motion.div>
            <div className={f.peripheral}>
              <PersonPortrait name="leila" size={40} />
              <span>Leila</span>
            </div>
            <span className={f.contextNode}>
              <ChatsCircle size={22} />
            </span>
            {bridgeAvailable && (
              <motion.div
                className={f.discoveryLabel}
                style={{ opacity: noteOpacity }}
              >
                {c.shared}
              </motion.div>
            )}
          </motion.div>
        </div>
        <div className={f.caption} aria-live="off">
          <p className={f.chapter}>
            {!bridgeAvailable ? c.still : c.chapters[chapter]}
          </p>
          <h2>{bridgeAvailable ? c.captions[chapter] : c.removed}</h2>
          <div className={f.exploreSlot}>
            <button
              ref={openerRef}
              onClick={inspect}
              tabIndex={inactive ? -1 : 0}
              disabled={inactive}
              style={{ visibility: inactive ? "hidden" : "visible" }}
            >
              {c.inspect}
              <ArrowUpRight size={17} />
            </button>
          </div>
        </div>
        <footer className={f.filmFooter}>
          <div className={f.playback}>
            <button
              onClick={() =>
                setIntent(intent === "paused" ? "playing" : "paused")
              }
              disabled={intent === "complete" || !bridgeAvailable}
              aria-label={intent === "paused" ? c.resume : c.pause}
            >
              {intent === "paused" ? (
                <Play size={17} weight="fill" />
              ) : (
                <Pause size={17} weight="fill" />
              )}
            </button>
            <button
              onClick={replay}
              disabled={!bridgeAvailable}
              aria-label={reduced && !optIn ? c.reducedPlay : c.replay}
            >
              <ArrowCounterClockwise size={18} />
              <span>{reduced && !optIn ? c.reducedPlay : c.replay}</span>
            </button>
            <span className={f.playState}>
              {intent === "complete"
                ? reduced && !optIn
                  ? c.still
                  : ""
                : !running
                  ? c.suspended
                  : ""}
            </span>
          </div>
          <p>{c.note}</p>
          <div className={f.filmProgress} aria-hidden="true">
            <motion.span style={{ scaleX: progress }} />
          </div>
        </footer>
      </motion.section>
      {inspecting && (
        <div className={f.sourceWrap}>
          <div
            ref={panelRef}
            className={f.sourcePanel}
            role="region"
            aria-labelledby="film-source-title"
            tabIndex={-1}
          >
            <button
              className={f.close}
              aria-label={c.close}
              onClick={() => {
                setInspecting(false);
                openerRef.current?.focus();
              }}
            >
              <X size={22} />
            </button>
            <h2 id="film-source-title">{c.source}</h2>
            <p>{c.identity}</p>
            {bridgeAvailable ? (
              <>
                <p className={f.sourceDate}>{c.sourceDate}</p>
                <blockquote>{c.quote}</blockquote>
                <p>{c.boundary}</p>
                <button
                  className={f.remove}
                  onClick={() => {
                    onRemoveBridge();
                    panelRef.current?.focus({ preventScroll: true });
                  }}
                >
                  {c.remove}
                </button>
              </>
            ) : (
              <>
                <h3>{c.removed}</h3>
                <p>{c.removedDetail}</p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
