"use client";
import { useEffect, useReducer, useState, useRef } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  ChatsCircle,
  LinkedinLogo,
  Article,
  LinkSimple,
} from "@phosphor-icons/react";
import {
  marketingAccessHref,
  relationshipDemoHref,
} from "@/lib/marketing-copy";
import { relationshipVisionCopy } from "@/lib/relationship-vision-copy";
import type { MarketingLocale } from "@/lib/marketing-locale";
import { useReducedMotionPreference } from "@/lib/use-reduced-motion";
import { ActionMark, PersonPortrait } from "./relationship-universe";
import { initialVisionState, visionReducer } from "@/lib/relationship-vision";
import s from "./universe.module.css";
import { RelationshipFilm } from "./relationship-film";
export function MarketingHome({ locale }: { locale: MarketingLocale }) {
  const c = relationshipVisionCopy(locale);
  const [surface, setSurface] = useState(0);
  const [context, setContext] = useState(0);
  const reduced = useReducedMotionPreference();
  const icons = [ChatsCircle, LinkedinLogo, Article];
  const [vision, dispatch] = useReducer(visionReducer, initialVisionState);
  const [entry, setEntry] = useState(0);
  function enter() {
    setEntry((value) => value + 1);
  }
  const handledEntry = useRef(0);
  useEffect(() => {
    if (entry === 0 || handledEntry.current === entry) return;
    const frame = requestAnimationFrame(() => {
      handledEntry.current = entry;
      document.getElementById("product")?.scrollIntoView({
        behavior: reduced ? "instant" : "smooth",
        block: "start",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [entry, locale, reduced]);
  return (
    <main id="main-content" tabIndex={-1} className={s.page} lang={locale}>
      <RelationshipFilm
        locale={locale}
        bridgeAvailable={vision.bridgeAvailable}
        onRemoveBridge={() => dispatch({ type: "remove-bridge" })}
        replayRequest={entry}
      />
      <section
        className={s.capture}
        id="method"
        aria-labelledby="capture-title"
      >
        <div className={s.captureInner}>
          <div className={s.captureCopy}>
            <h2 id="capture-title">
              {c.captureTitle[0]}
              <br />
              {c.captureTitle[1]}
            </h2>
            <p>{c.captureText}</p>
            <div
              className={s.surfaceTabs}
              role="group"
              aria-label={locale === "en" ? "Capture surfaces" : "捕捉场景"}
            >
              {c.captureSurface.map((label, i) => {
                const Icon = icons[i];
                return (
                  <button
                    key={label}
                    aria-pressed={surface === i}
                    onClick={() => setSurface(i)}
                  >
                    <Icon size={17} />
                    {label}
                  </button>
                );
              })}
            </div>
            <button className={s.captureLink} onClick={enter}>
              {c.captureAction}
              <ArrowUpRight size={16} />
            </button>
          </div>
          <div className={s.captureArtwork}>
            <motion.div
              className={s.messageWindow}
              animate={reduced ? {} : { rotate: surface === 1 ? 2 : -3 }}
              transition={{ type: "spring", stiffness: 150, damping: 20 }}
            >
              <div className={s.windowTop}>
                <span>{c.captureSource[surface]}</span>
                <span>maya-builds</span>
              </div>
              <div className={s.messageIdentity}>
                <PersonPortrait name="maya" size={42} />
                <div>
                  <strong>Maya Chen</strong>
                  <span>
                    {locale === "en"
                      ? "Building tools for thought"
                      : "创造让人思考的工具"}
                  </span>
                </div>
              </div>
              <AnimatePresence mode="wait">
                <motion.p
                  className={s.messageBubble}
                  key={surface}
                  initial={reduced ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0 : 0.2 }}
                >
                  {c.captureBody[surface]}
                </motion.p>
              </AnimatePresence>
              <button
                className={s.captureKey}
                onClick={enter}
                aria-label={c.captureAction}
              >
                <ActionMark />
              </button>
              <p className={s.captureFootnote}>{c.captureNote}</p>
            </motion.div>
          </div>
        </div>
      </section>
      <section className={s.living} aria-labelledby="living-title">
        <div className={s.livingCopy}>
          <h2 id="living-title">
            {c.livingTitle[0]}
            <br />
            {c.livingTitle[1]}
          </h2>
          <p>{c.livingText}</p>
          <Link href="/product">
            {c.livingLink}
            <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className={s.livingSheet}>
          <div className={s.livingPortrait}>
            <PersonPortrait name="maya" size={80} />
            <div>
              <h3>Maya Chen</h3>
              <p>{c.livingSubtitle}</p>
            </div>
          </div>
          <div
            className={s.contextTabs}
            role="group"
            aria-label={locale === "en" ? "Person context" : "人物背景"}
          >
            {c.tabs.map((label, i) => (
              <button
                key={label}
                aria-pressed={context === i}
                onClick={() => setContext(i)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={s.contextBody} aria-live="polite">
            <AnimatePresence mode="wait">
              <motion.div
                key={context}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.2 }}
              >
                <h4>
                  {!vision.bridgeAvailable && context > 0
                    ? locale === "en"
                      ? "Meeting note removed"
                      : "会面笔记已移除"
                    : c.tabHeadings[context]}
                </h4>
                <p>
                  {!vision.bridgeAvailable && context > 0
                    ? locale === "en"
                      ? "This context is no longer supported. Maya’s public work remains available."
                      : "这段背景已失去来源支持。Maya 的公开作品仍然保留。"
                    : c.tabBodies[context]}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
          <p className={s.sourceChips}>
            <LinkSimple size={15} />
            LinkedIn · GitHub
            {vision.bridgeAvailable &&
              (locale === "en" ? " · Your notes" : " · 你的笔记")}
          </p>
        </div>
      </section>
      <section className={s.closing} id="access" aria-labelledby="access-title">
        <h2 id="access-title">
          {c.closingTitle[0]}
          <br />
          {c.closingTitle[1]}
        </h2>
        <p>{c.closingText}</p>
        <div className={s.closingActions}>
          <a className={s.primaryLink} href={marketingAccessHref(locale)}>
            {c.access}
            <ArrowUpRight size={16} />
          </a>
          <Link className={s.secondaryLink} href={relationshipDemoHref}>
            {c.working}
            <ArrowRight size={16} />
          </Link>
        </div>
        <p className={s.visionStatus}>{c.status}</p>
        <div id="questions" className={s.faq}>
          {c.faqs.map((item) => (
            <details key={item.question}>
              <summary>
                {item.question}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
