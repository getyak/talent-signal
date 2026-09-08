"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { Dispatch } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowCounterClockwise,
  Check,
  ChatsCircle,
  GithubLogo,
  LinkedinLogo,
  GlobeHemisphereWest,
  X,
  Plus,
  Fingerprint,
  ShareNetwork,
} from "@phosphor-icons/react";
import { useReducedMotionPreference } from "@/lib/use-reduced-motion";
import {
  type VisionEvent,
  type VisionState,
  type VisionPhase,
} from "@/lib/relationship-vision";
import type { MarketingLocale } from "@/lib/marketing-locale";
import s from "./universe.module.css";

const portraits = "/concepts/relationships/avatars/";
export function ActionMark() {
  return (
    <svg width="53" height="53" viewBox="0 0 64 64" aria-hidden="true">
      <path
        d="M38 10.5c-4.3-2.1-9.2-2.8-14-1.6C12.1 11.8 5.7 24.2 9.9 35.6c3.8 10.2 14.8 15.8 25.2 12.9"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="4.5"
      />
      <path
        d="M43.8 15.6c7.4 6.1 8.6 17 2.7 24.5"
        fill="none"
        stroke="var(--accent-strong)"
        strokeLinecap="round"
        strokeWidth="4.5"
      />
    </svg>
  );
}
export function PersonPortrait({
  name,
  size = 64,
  className,
}: {
  name: "maya" | "nia" | "amir" | "leila";
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={`${portraits}${name}.webp`}
      width={size}
      height={size}
      alt=""
      className={className}
    />
  );
}
const localCopy = {
  "zh-CN": {
    steps: ["一次捕捉", "背景汇集", "同一个人", "关系浮现"],
    start: "按下 Action Button",
    hint: "试着按一下，让背景相连",
    capture: "选择起点，开始新演示",
    platform: ["微信", "LinkedIn", "网页"],
    sources: ["一段对话", "公开档案", "她的作品", "你的会面笔记"],
    snippets: [
      "最近在做设计 Agent，想认识一些产品团队。",
      "Building tools for thought.",
      "maya-builds / design-agent",
      "上周和 Alex 喝的那杯咖啡。",
    ],
    statuses: [
      "一个名字，散落在不同地方。",
      "Agent 正在汇集公开资料与已授权背景。",
      "原来，这些都是同一个 Maya。",
      "你与 Maya 之间，其实只隔着 Alex。",
    ],
    absent: "连接依据已移除，这条路径不再成立。",
    note: "未来体验 · 合成数据 · 本页不进行真实搜索",
    skip: "直接看连接",
    reset: "重新开始",
    stop: "停止演示",
    inspect: "查看这条连接",
    identity: "查看身份关联",
    context: "设计工具创造者",
    same: "3 个来源，同一个人",
    matched: "同一公开账号 · maya-builds",
    uncertain: "另一个 Maya C. · 同名，未合并",
    you: "你",
    alex: "上周的会面",
    maya: "你刚遇见的人",
    leila: "你的合作伙伴",
    route: "一条可探索的路径",
    routeText: "Alex 曾和她一起做过 Atlas。可以先问问 Alex，是否愿意介绍。",
    removedText: "保留 Maya 的资料，撤下失去依据的连接。",
    view: "为什么会有这条连接？",
    close: "关闭来源",
    remove: "移除这条连接的依据",
    detailTitle: "一条连接，两段背景。",
    noteTitle: "会面笔记 · 2026 年 9 月 3 日",
    quote: "“Maya 和我一起做过 Atlas 的第一版原型。”",
    relation:
      "Alex → Maya：笔记中的既往合作。你 → Alex：同一条笔记记录了你们的会面。",
    distinction:
      "这支持“可以问问 Alex”的建议；不代表 Alex 已同意介绍，也不证明两人现在仍有联系。",
    identityTitle: "同一个人，有可核对的线索。",
    identityText:
      "演示中的 IM 消息分享了 maya-builds 项目。LinkedIn 档案与项目主页互相链接到同一账号；头像和相似姓名不参与确认。",
    mismatch: "同名的 Maya C. 缺少相同账号线索，因此单独保留。",
    identityButton: "查看关联线索",
    details: "背景有了，连接才有意义。",
    action: "找一位产品合作者",
    noAction: "暂无有依据的介绍路径",
    demoOnly: "仅演示中发生的变化；未修改真实联系人。",
  },
  en: {
    steps: [
      "One capture",
      "Context gathers",
      "One person",
      "Connections emerge",
    ],
    start: "Press the Action Button",
    hint: "One press. Let the context connect.",
    capture: "Choose a starting point for a new demo",
    platform: ["WeChat", "LinkedIn", "Web"],
    sources: [
      "A conversation",
      "A public profile",
      "Her work",
      "Your meeting notes",
    ],
    snippets: [
      "Building a design agent. Hoping to meet a few product teams.",
      "Building tools for thought.",
      "maya-builds / design-agent",
      "That coffee with Alex last week.",
    ],
    statuses: [
      "One name, scattered across your world.",
      "The Agent gathers public work and authorized context.",
      "These are all the same Maya.",
      "You and Maya are only an Alex apart.",
    ],
    absent: "Evidence removed. This path is no longer supported.",
    note: "Future experience · Synthetic data · No live search",
    skip: "Reveal the connection",
    reset: "Start a new demo",
    stop: "Stop demo",
    inspect: "Inspect this connection",
    identity: "Inspect identity links",
    context: "Building tools for thought",
    same: "3 sources. One person.",
    matched: "The same public handle · maya-builds",
    uncertain: "Another Maya C. · Not merged",
    you: "You",
    alex: "Last week’s coffee",
    maya: "Someone you just met",
    leila: "Your collaborator",
    route: "A path worth exploring",
    routeText:
      "Alex built Atlas with her. You could ask whether Alex would be open to an introduction.",
    removedText: "Maya’s context stays. The unsupported connection disappears.",
    view: "Why this connection?",
    close: "Close sources",
    remove: "Remove the evidence for this connection",
    detailTitle: "One connection. Two pieces of context.",
    noteTitle: "Meeting note · September 3, 2026",
    quote: "“Maya and I built the first Atlas prototype together.”",
    relation:
      "Alex → Maya: past collaboration in the note. You → Alex: the same note records your meeting.",
    distinction:
      "This supports asking Alex. It does not mean Alex has agreed to introduce you, or that they are still in touch.",
    identityTitle: "One person, with links you can check.",
    identityText:
      "The synthetic IM message shares the maya-builds project. The LinkedIn profile and project explicitly link to each other. Neither a matching portrait nor a similar name establishes identity.",
    mismatch:
      "Another Maya C. has no matching account link and stays separate.",
    identityButton: "Inspect the identity links",
    details: "Context makes the connection meaningful.",
    action: "Find a product collaborator",
    noAction: "No supported introduction path",
    demoOnly: "A change in this demo only. No real contacts are modified.",
  },
};

export function RelationshipUniverse({
  locale,
  state,
  dispatch,
}: {
  locale: MarketingLocale;
  state: VisionState;
  dispatch: Dispatch<VisionEvent>;
}) {
  const c = localCopy[locale];
  const [origin, setOrigin] = useState(0);
  const [detail, setDetail] = useState<"bridge" | "identity" | null>(null);
  const systemReduced = useReducedMotionPreference();
  const [motionOptIn, setMotionOptIn] = useState(false);
  const reduced = systemReduced && !motionOptIn;
  const [goal, setGoal] = useState<"people" | "work">("people");
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const regionId = useId();
  const { phase, playing, bridgeAvailable } = state;
  const duration = reduced ? 0 : 0.65;
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(
      () => dispatch({ type: "tick", run: state.run, phase }),
      phase === 1 ? 1600 : 1700,
    );
    return () => window.clearTimeout(timer);
  }, [playing, phase, state.run, dispatch]);
  useEffect(() => {
    if (detail) {
      detailRef.current?.focus({ preventScroll: true });
      detailRef.current?.scrollIntoView({
        block: "nearest",
        behavior: reduced ? "instant" : "smooth",
      });
    }
  }, [detail, reduced]);
  function openDetail(kind: "identity" | "bridge", opener: HTMLButtonElement) {
    openerRef.current = opener;
    dispatch({ type: "visit", phase });
    setDetail(kind);
  }
  useEffect(() => {
    if (phase >= 2 && document.activeElement === actionRef.current)
      revealRef.current?.focus({ preventScroll: true });
  }, [phase]);
  function reset() {
    setDetail(null);
    dispatch({ type: "reset" });
    actionRef.current?.focus({ preventScroll: true });
  }
  const fragmentPositions = [
    { left: "9%", top: "14%", rotate: -7 },
    { left: "72%", top: "6%", rotate: 7 },
    { left: "19%", top: "67%", rotate: 4 },
    { left: "70%", top: "67%", rotate: -5 },
  ];
  const icons = [ChatsCircle, LinkedinLogo, GithubLogo, GlobeHemisphereWest];
  return (
    <div
      id="relationship-universe"
      className={s.universe}
      data-phase={phase}
      data-playing={playing}
      data-motion={reduced ? "reduced" : "enabled"}
      data-goal={goal}
    >
      <p className={s.scope}>
        {locale === "en"
          ? "A future experience, with synthetic people"
          : "未来体验 · 合成案例"}
      </p>
      <div className={s.originPicker} role="group" aria-label={c.capture}>
        {c.platform.map((name, i) => (
          <button
            key={name}
            aria-pressed={origin === i}
            onClick={() => {
              setOrigin(i);
              reset();
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div className={s.stage} aria-label={c.steps[phase]}>
        <div className={s.ground} aria-hidden="true" />
        <div className={s.orbit} aria-hidden="true" />
        <div className={`${s.orbit} ${s.orbitOuter}`} aria-hidden="true" />
        {c.sources.map((name, i) => {
          const Icon = icons[i];
          return (
            <motion.div
              key={name}
              aria-hidden={phase >= 2}
              className={`${s.fragment} ${s[`fragment${i}`]}`}
              initial={false}
              animate={
                phase < 2
                  ? {
                      left: fragmentPositions[i].left,
                      top: fragmentPositions[i].top,
                      rotate: fragmentPositions[i].rotate,
                      scale: 1,
                      opacity: 1,
                      x: "0%",
                      y: "0%",
                    }
                  : {
                      left: "50%",
                      top: "46%",
                      rotate: 0,
                      scale: 0.2,
                      opacity: 0,
                      x: "-50%",
                      y: "-50%",
                    }
              }
              transition={{ duration, delay: reduced ? 0 : i * 0.07 }}
            >
              <span className={s.sourceName}>
                <Icon size={16} />
                {i === 0 ? c.platform[origin] : name}
              </span>
              <div className={s.fragmentHeading}>
                {i === 1 && <PersonPortrait name="maya" size={36} />}
                <strong>
                  {i === 0
                    ? "Maya"
                    : i === 1
                      ? "Maya Chen"
                      : i === 2
                        ? "design-agent"
                        : "Alex"}
                </strong>
              </div>
              <p>
                {i === 3 && !bridgeAvailable
                  ? locale === "en"
                    ? "Meeting note removed. Context unavailable."
                    : "会面笔记已移除，背景不可用。"
                  : c.snippets[i]}
              </p>
              {i === 0 && (
                <small className={s.sharedHandle}>
                  {locale === "en" ? "Shared project: " : "分享的项目："}
                  maya-builds
                </small>
              )}
              {phase === 1 && (i !== 3 || bridgeAvailable) && (
                <motion.span
                  className={s.found}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: reduced ? 0 : 0.15 + i * 0.3 }}
                >
                  <Check size={13} />
                  {i === 3
                    ? locale === "en"
                      ? "Context found"
                      : "找到相关背景"
                    : "maya-builds"}
                </motion.span>
              )}
            </motion.div>
          );
        })}
        <motion.div
          className={s.actionDock}
          style={{ pointerEvents: phase >= 2 ? "none" : "auto" }}
          initial={false}
          animate={{ opacity: phase < 2 ? 1 : 0, scale: phase < 2 ? 1 : 0.5 }}
          transition={{ duration }}
          aria-hidden={phase >= 2}
        >
          <motion.button
            ref={actionRef}
            className={s.actionButton}
            aria-label={c.start}
            tabIndex={phase >= 2 ? -1 : 0}
            disabled={playing || phase >= 2}
            whileHover={reduced ? {} : { y: -3 }}
            whileTap={reduced ? {} : { y: 6, scale: 0.96 }}
            onClick={() => dispatch({ type: "start", reducedMotion: reduced })}
          >
            <ActionMark />
            {playing && (
              <motion.span
                className={s.scan}
                aria-hidden="true"
                animate={{ rotate: 360 }}
                transition={{
                  duration: 1.7,
                  repeat: reduced ? 0 : Infinity,
                  ease: "linear",
                }}
              />
            )}
          </motion.button>
          <span className={s.actionHint}>
            {playing
              ? locale === "en"
                ? "Connecting the context…"
                : "正在连接背景…"
              : c.hint}
          </span>
        </motion.div>
        <AnimatePresence>
          {phase >= 2 && (
            <motion.div
              key="person"
              style={{ x: "-50%", y: "-50%" }}
              className={s.personDock}
              data-connected={phase === 3}
              initial={reduced ? false : { opacity: 0, scale: 0.75 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration }}
              layout
            >
              <motion.div
                className={s.personCard}
                layout
                transition={{ duration }}
              >
                <PersonPortrait
                  name="maya"
                  size={100}
                  className={s.mayaPortrait}
                />
                <div className={s.personName}>
                  <strong>Maya Chen</strong>
                  <span>{phase === 2 ? c.context : c.maya}</span>
                </div>
                {phase === 2 && (
                  <motion.div
                    className={s.identityInfo}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: reduced ? 0 : 0.25 }}
                  >
                    <p>
                      <Check size={16} />
                      {c.same}
                    </p>
                    <span>{c.matched}</span>
                    <button
                      aria-label={c.identity}
                      onClick={(event) =>
                        openDetail("identity", event.currentTarget)
                      }
                    >
                      {c.identityButton}
                      <ArrowUpRight size={14} />
                    </button>
                    <small>{c.uncertain}</small>
                  </motion.div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {phase === 3 && (
          <div className={s.connections}>
            <svg
              viewBox="0 0 1000 430"
              preserveAspectRatio="none"
              className={s.connectionLines}
              aria-hidden="true"
            >
              {bridgeAvailable && (
                <motion.path
                  opacity={goal === "work" ? 0.2 : 1}
                  d="M200 195 C300 120 400 120 500 195"
                  className={s.solidPath}
                  initial={{ pathLength: reduced ? 1 : 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.75 }}
                />
              )}
              {goal === "people" && bridgeAvailable && (
                <motion.path
                  d="M500 195 C600 270 700 270 800 195"
                  className={s.mainPath}
                  initial={{ pathLength: reduced ? 1 : 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.9, delay: reduced ? 0 : 0.4 }}
                />
              )}
              {goal === "work" && (
                <motion.path
                  d="M200 195 C370 370 650 370 800 195"
                  className={s.workPath}
                  initial={{ pathLength: reduced ? 1 : 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.8 }}
                />
              )}
              <motion.path
                d="M200 195 C210 60 280 40 350 70 M200 195 C300 280 340 360 390 350"
                className={s.minorPath}
                initial={{ pathLength: reduced ? 1 : 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1 }}
              />
            </svg>
            <motion.div
              className={`${s.networkPerson} ${s.you}`}
              style={{ x: "-50%", y: "-50%" }}
              initial={reduced ? false : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration }}
            >
              <PersonPortrait name="amir" size={76} />
              <strong>{c.you}</strong>
              <span>{locale === "en" ? "Your world" : "你的世界"}</span>
            </motion.div>
            <motion.button
              className={`${s.networkPerson} ${s.alex}`}
              style={{ x: "-50%", y: "-50%" }}
              aria-label={c.inspect}
              onClick={(event) => openDetail("bridge", event.currentTarget)}
              initial={reduced ? false : { opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration, delay: reduced ? 0 : 0.2 }}
            >
              <PersonPortrait name="nia" size={76} />
              <strong>Alex</strong>
              <span>
                {bridgeAvailable
                  ? c.alex
                  : locale === "en"
                    ? "Source removed"
                    : "来源已移除"}
              </span>
              <span className={s.personPlus}>
                <Plus size={14} />
              </span>
            </motion.button>
            <div
              className={`${s.networkPerson} ${s.peripheral}`}
              aria-hidden="true"
            >
              <PersonPortrait name="leila" size={42} />
              <span>Leila</span>
            </div>
            <div
              className={`${s.networkPerson} ${s.peripheralTwo}`}
              aria-hidden="true"
            >
              <span className={s.paperNode}>
                <ChatsCircle size={23} />
              </span>
              <span>{locale === "en" ? "Your conversations" : "你的对话"}</span>
            </div>
            <motion.div
              className={s.connectionLabel}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduced ? 0 : 0.8 }}
            >
              {goal === "work"
                ? locale === "en"
                  ? "Her public project"
                  : "她的公开作品"
                : bridgeAvailable
                  ? locale === "en"
                    ? "Built Atlas together"
                    : "一起做过 Atlas"
                  : locale === "en"
                    ? "Evidence unavailable"
                    : "依据不可用"}
            </motion.div>
          </div>
        )}
      </div>
      <div
        className={s.reveal}
        ref={revealRef}
        tabIndex={-1}
        aria-live="polite"
        aria-atomic="true"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`${phase}-${bridgeAvailable}-${goal}`}
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.3 }}
          >
            <h2>
              {phase === 3 && goal === "work"
                ? locale === "en"
                  ? "Start with what she is building."
                  : "从她的作品，找到可以聊的话题。"
                : phase === 3 && !bridgeAvailable
                  ? c.absent
                  : c.statuses[phase]}
            </h2>
            {phase === 3 ? (
              <>
                <p>
                  {goal === "work"
                    ? locale === "en"
                      ? "Her profile links to maya-builds / design-agent. A shared interest is a place to begin."
                      : "她的档案链接到 maya-builds / design-agent。共同的兴趣，是一次对话的起点。"
                    : bridgeAvailable
                      ? c.routeText
                      : c.removedText}
                </p>
                <button
                  className={s.textButton}
                  onClick={(event) =>
                    openDetail(
                      goal === "work" ? "identity" : "bridge",
                      event.currentTarget,
                    )
                  }
                >
                  {goal === "work" ? c.identityButton : c.view}
                  <ArrowUpRight size={16} />
                </button>
              </>
            ) : (
              <p>
                {phase === 2
                  ? c.details
                  : locale === "en"
                    ? "From a name on a screen to someone in your world."
                    : "从屏幕上的一个名字，到与你有关的一个人。"}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      {phase === 3 && (
        <div
          className={s.goalPicker}
          role="group"
          aria-label={
            locale === "en" ? "What would you like to do?" : "你现在想做什么？"
          }
        >
          <button
            aria-pressed={goal === "people"}
            onClick={() => setGoal("people")}
          >
            {locale === "en" ? "Find a collaborator" : "找一位合作者"}
          </button>
          <button
            aria-pressed={goal === "work"}
            onClick={() => setGoal("work")}
          >
            {locale === "en" ? "Explore her work" : "先了解她的作品"}
          </button>
        </div>
      )}
      <div className={s.sequenceControls}>
        <div
          className={s.stepPicker}
          role="group"
          aria-label={locale === "en" ? "Explore the sequence" : "探索体验步骤"}
        >
          {c.steps.map((label, i) => (
            <button
              key={label}
              aria-pressed={phase === i}
              onClick={() =>
                dispatch({ type: "visit", phase: i as VisionPhase })
              }
            >
              <span>{i + 1}</span>
              {label}
            </button>
          ))}
        </div>
        {phase === 0 ? (
          <button
            className={s.textButton}
            onClick={() => dispatch({ type: "visit", phase: 3 })}
          >
            {c.skip}
            <ArrowRight size={15} />
          </button>
        ) : (
          <button className={s.textButton} onClick={reset}>
            <ArrowCounterClockwise size={15} />
            {playing ? c.stop : c.reset}
          </button>
        )}
      </div>
      {systemReduced && (
        <label className={s.motionChoice}>
          <input
            type="checkbox"
            checked={motionOptIn}
            onChange={(e) => setMotionOptIn(e.target.checked)}
          />
          {locale === "en" ? "Play motion for this demo" : "为这次演示播放动效"}
        </label>
      )}
      <p className={s.demoNotice}>{c.note}</p>
      {detail && (
        <div
          className={s.sourcePanel}
          role="region"
          aria-labelledby={regionId}
          ref={detailRef}
          tabIndex={-1}
        >
          <button
            className={s.closePanel}
            aria-label={c.close}
            onClick={() => {
              setDetail(null);
              (openerRef.current?.isConnected
                ? openerRef.current
                : revealRef.current
              )?.focus();
            }}
          >
            <X size={20} />
          </button>
          <span className={s.sourceName}>
            {detail === "bridge" ? (
              <ShareNetwork size={17} />
            ) : (
              <Fingerprint size={17} />
            )}{" "}
            {locale === "en" ? "Synthetic source context" : "合成来源背景"}
          </span>
          <h3 id={regionId}>
            {detail === "bridge" ? c.detailTitle : c.identityTitle}
          </h3>
          {detail === "bridge" ? (
            <>
              {bridgeAvailable ? (
                <>
                  <p className={s.noteDate}>{c.noteTitle}</p>
                  <blockquote>{c.quote}</blockquote>
                  <p>{c.relation}</p>
                </>
              ) : (
                <p>{c.absent}</p>
              )}
              <p className={s.sourceCaveat}>
                {bridgeAvailable
                  ? c.distinction
                  : locale === "en"
                    ? "There is no supported introduction suggestion while this source is unavailable."
                    : "来源不可用时，不再保留这条介绍建议。"}
              </p>
              {bridgeAvailable && (
                <button
                  className={s.removeButton}
                  onClick={() => {
                    dispatch({ type: "remove-bridge" });
                    detailRef.current?.focus({ preventScroll: true });
                  }}
                >
                  {c.remove}
                </button>
              )}
              <p className={s.demoNotice}>{c.demoOnly}</p>
            </>
          ) : (
            <>
              <p>{c.identityText}</p>
              <p className={s.sourceCaveat}>{c.mismatch}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
