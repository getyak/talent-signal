"use client";

import {
  ArrowDown,
  Check,
  Crosshair,
  DeviceMobile,
  LinkSimple,
  UserCircle,
} from "@phosphor-icons/react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import styles from "./signal-journey.module.css";

export const signalJourneySources = [
  {
    id: "wechat",
    label: "WeChat",
    detail: "Private message",
    image: "/marketing/signal-journey/wechat-synthetic.webp",
    alt: "Synthetic Chinese recruiter conversation in a green messaging interface",
    evidence: ["我周三前需要做决定。", "新加坡远程办公的安排还没有确认。"],
    facts: [
      ["Decision deadline", "Needs full date", "ambiguous"],
      ["Work mode constraint", "Not yet confirmed", "proposed"],
    ],
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    detail: "Candidate chat",
    image: "/marketing/signal-journey/whatsapp-synthetic.webp",
    alt: "Synthetic English recruiter conversation in a restrained green messaging interface",
    evidence: [
      "I have another offer",
      "decide by Wednesday",
      "remote from Singapore is unresolved",
    ],
    facts: [
      ["Competing process", "Another offer", "proposed"],
      ["Decision deadline", "Needs full date", "ambiguous"],
      ["Work mode constraint", "Still unresolved", "proposed"],
    ],
  },
  {
    id: "line",
    label: "LINE-style",
    detail: "Channel not verified",
    image: "/marketing/signal-journey/line-synthetic.webp",
    alt: "Synthetic bilingual recruiter conversation in a cool mint messaging interface",
    evidence: [
      "Wednesday is my decision deadline",
      "I can meet Tuesday afternoon",
      "2:00 PM Tuesday works",
    ],
    facts: [
      ["Decision deadline", "Needs full date", "ambiguous"],
      ["Availability", "Needs full date", "ambiguous"],
    ],
  },
  {
    id: "boss",
    label: "BOSS直聘",
    detail: "Role conversation",
    image: "/marketing/signal-journey/boss-synthetic.webp",
    alt: "Synthetic Chinese executive search conversation in a teal job platform interface",
    evidence: [
      "目前有一个竞品 offer",
      "最晚周三答复",
      "远程政策需要再确认",
    ],
    facts: [
      ["Competing process", "Another offer", "proposed"],
      ["Decision deadline", "Needs full date", "ambiguous"],
      ["Work mode constraint", "Policy unresolved", "proposed"],
    ],
  },
  {
    id: "xiaohongshu",
    label: "小红书",
    detail: "Social message",
    image: "/marketing/signal-journey/xiaohongshu-synthetic.webp",
    alt: "Synthetic Chinese talent outreach conversation in a restrained coral social messaging interface",
    evidence: ["但我需要先确认新加坡远程办公和决策时间"],
    facts: [
      ["Decision deadline", "Open question", "ambiguous"],
    ],
  },
] as const;

const chapters = [
  {
    title: "Bring one screenshot",
    detail: "Only the source you choose enters the workspace.",
    icon: DeviceMobile,
  },
  {
    title: "Locate exact phrases",
    detail: "Every proposed fact keeps its original words attached.",
    icon: Crosshair,
  },
  {
    title: "Bind the relationship",
    detail:
      "You bind the person and search; uncertain channel or time stays visible.",
    icon: UserCircle,
  },
  {
    title: "Review where work happens",
    detail: "The same evidence appears on Web and iPhone.",
    icon: LinkSimple,
  },
] as const;

function chapterForProgress(progress: number) {
  if (progress < 0.23) {
    return 0;
  }
  if (progress < 0.48) {
    return 1;
  }
  if (progress < 0.72) {
    return 2;
  }
  return 3;
}

export function SignalJourney() {
  const journeyRef = useRef<HTMLElement>(null);
  const autoRotateRef = useRef(true);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [activeSourceIndex, setActiveSourceIndex] = useState(1);
  const [activeChapter, setActiveChapter] = useState(0);
  const source = signalJourneySources[activeSourceIndex];

  // Motion useScroll tracks the target without a page-level scroll listener:
  // https://motion.dev/docs/react-use-scroll
  const { scrollYProgress } = useScroll({
    target: journeyRef,
    offset: ["start start", "end end"],
  });

  // Transform and opacity stay on the compositor-friendly path:
  // https://motion.dev/docs/react-use-transform
  const sourceX = useTransform(
    scrollYProgress,
    [0, 0.2, 0.46, 0.72, 1],
    ["0%", "0%", "-12%", "-30%", "-36%"],
  );
  const sourceY = useTransform(
    scrollYProgress,
    [0, 0.23, 0.5, 0.72, 1],
    ["0%", "0%", "-3%", "4%", "7%"],
  );
  const sourceScale = useTransform(
    scrollYProgress,
    [0, 0.22, 0.48, 0.74, 1],
    [1, 1, 0.84, 0.68, 0.61],
  );
  const sourceOpacity = useTransform(
    scrollYProgress,
    [0, 0.72, 0.88, 1],
    [1, 1, 0.44, 0.18],
  );
  const scanOpacity = useTransform(
    scrollYProgress,
    [0.12, 0.22, 0.42, 0.52],
    [0, 1, 1, 0],
  );
  const scanX = useTransform(
    scrollYProgress,
    [0.14, 0.47],
    ["-36%", "84%"],
  );
  const evidenceOpacity = useTransform(
    scrollYProgress,
    [0.2, 0.3, 0.47, 0.58],
    [0, 1, 1, 0.28],
  );
  const evidenceX = useTransform(
    scrollYProgress,
    [0.2, 0.35, 0.54, 0.72],
    ["-28%", "0%", "22%", "40%"],
  );
  const contactOpacity = useTransform(
    scrollYProgress,
    [0.43, 0.54, 0.72, 0.83],
    [0, 1, 1, 0.18],
  );
  const contactX = useTransform(
    scrollYProgress,
    [0.43, 0.58, 0.76],
    ["38%", "0%", "-18%"],
  );
  const contactScale = useTransform(
    scrollYProgress,
    [0.43, 0.58, 0.78],
    [0.9, 1, 0.88],
  );
  const outputOpacity = useTransform(
    scrollYProgress,
    [0.69, 0.79, 1],
    [0, 1, 1],
  );
  const outputY = useTransform(
    scrollYProgress,
    [0.69, 0.84, 1],
    ["18%", "0%", "-2%"],
  );

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    const next = chapterForProgress(latest);
    setActiveChapter((current) => (current === next ? current : next));
  });

  useEffect(() => {
    if (
      prefersReducedMotion ||
      activeChapter !== 0 ||
      !autoRotateRef.current
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      if (!autoRotateRef.current) {
        return;
      }
      setActiveSourceIndex(
        (current) => (current + 1) % signalJourneySources.length,
      );
    }, 3200);

    return () => window.clearInterval(interval);
  }, [activeChapter, prefersReducedMotion]);

  function chooseSource(index: number) {
    autoRotateRef.current = false;
    setActiveSourceIndex(index);
  }

  function jumpToChapter(index: number) {
    setActiveChapter(index);
    const section = journeyRef.current;
    if (!section) {
      return;
    }

    const sectionTop = window.scrollY + section.getBoundingClientRect().top;
    const scrollableDistance = Math.max(
      0,
      section.offsetHeight - window.innerHeight,
    );

    window.scrollTo({
      top: sectionTop + scrollableDistance * (index / (chapters.length - 1)),
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }

  const animatedSourceStyle = prefersReducedMotion
    ? undefined
    : {
        x: sourceX,
        y: sourceY,
        scale: sourceScale,
        opacity: sourceOpacity,
      };
  const animatedScanStyle = prefersReducedMotion
    ? undefined
    : { x: scanX, opacity: scanOpacity };
  const animatedEvidenceStyle = prefersReducedMotion
    ? undefined
    : { x: evidenceX, opacity: evidenceOpacity };
  const animatedContactStyle = prefersReducedMotion
    ? undefined
    : {
        x: contactX,
        scale: contactScale,
        opacity: contactOpacity,
      };
  const animatedOutputStyle = prefersReducedMotion
    ? undefined
    : { y: outputY, opacity: outputOpacity };

  return (
    <section
      ref={journeyRef}
      id="signal-journey"
      className={styles.journey}
      aria-labelledby="signal-journey-title"
    >
      <div className={`shell ${styles.journeyFrame}`}>
        <div className={styles.chapterRail}>
          <div className={styles.chapterIntro}>
            <p>One source. One relationship.</p>
            <h2 id="signal-journey-title">
              Watch the signal keep its source.
            </h2>
          </div>

          <ol className={styles.chapterList}>
            {chapters.map((chapter, index) => {
              const Icon = chapter.icon;
              return (
                <li key={chapter.title}>
                  <button
                    type="button"
                    data-active={activeChapter === index || undefined}
                    aria-current={
                      activeChapter === index ? "step" : undefined
                    }
                    onClick={() => jumpToChapter(index)}
                  >
                    <span className={styles.chapterIcon}>
                      <Icon aria-hidden="true" size={17} />
                    </span>
                    <span>
                      <strong>{chapter.title}</strong>
                      <small>{chapter.detail}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <p className={styles.syntheticNote}>
            Synthetic walkthrough. No real candidate data.
          </p>
        </div>

        <div className={styles.stage}>
          <div className={styles.stageHeader}>
            <span>
              <i aria-hidden="true" />
              Source attached
            </span>
            <strong aria-live="polite">
              {chapters[activeChapter].title}
            </strong>
          </div>

          <div className={styles.canvas}>
            <motion.div
              className={styles.sourceObject}
              style={animatedSourceStyle}
            >
              <div className={styles.sourceFrame}>
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.div
                    key={source.id}
                    className={styles.sourceImage}
                    initial={
                      prefersReducedMotion
                        ? false
                        : { opacity: 0, x: 22, scale: 0.985 }
                    }
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={
                      prefersReducedMotion
                        ? undefined
                        : { opacity: 0, x: -18, scale: 0.985 }
                    }
                    transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <Image
                      src={source.image}
                      alt={source.alt}
                      fill
                      sizes="(max-width: 760px) 70vw, 330px"
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className={styles.sourceCaption}>
                <span>{source.label}</span>
                <strong>{source.detail}</strong>
              </div>
            </motion.div>

            <motion.div
              className={styles.scanLens}
              style={animatedScanStyle}
              aria-hidden="true"
            >
              <span />
            </motion.div>

            <motion.div
              className={styles.evidenceStack}
              style={animatedEvidenceStyle}
            >
              <div className={styles.evidenceHeading}>
                <Crosshair aria-hidden="true" size={16} />
                Exact evidence
              </div>
              {source.evidence.map((item, index) => (
                <div key={item} className={styles.evidenceToken}>
                  <span>0{index + 1}</span>
                  <q>{item}</q>
                  <Check aria-hidden="true" size={15} weight="bold" />
                </div>
              ))}
              <p>Speaker, time, and source region stay attached.</p>
            </motion.div>

            <motion.article
              className={styles.contactCard}
              style={animatedContactStyle}
            >
              <div className={styles.contactHeader}>
                <div className={styles.personMark}>SC</div>
                <div>
                  <span>Context binding</span>
                  <h3>Synthetic candidate</h3>
                  <p>CPO search · identity bound by recruiter</p>
                </div>
                <span className={styles.reviewed}>
                  <Check aria-hidden="true" size={13} weight="bold" />
                  Recruiter selected
                </span>
              </div>
              <dl>
                {source.facts.map(([label, value, status]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                    <small>{status}</small>
                  </div>
                ))}
              </dl>
              <div className={styles.contactFooter}>
                <span>Proposed relationship state</span>
                <strong>Review before saving</strong>
              </div>
            </motion.article>

            <motion.div
              className={styles.outputGroup}
              style={animatedOutputStyle}
            >
              <div className={styles.webOutput}>
                <div className={styles.outputChrome}>
                  <span />
                  <span />
                  <span />
                  <strong>Talent Signal · Web</strong>
                </div>
                <div className={styles.outputImage}>
                  <Image
                    src="/marketing/signal-journey/web-relationship-output.webp"
                    alt="Talent Signal Web relationship workspace showing evidence and a client dependency"
                    fill
                    sizes="(max-width: 760px) 92vw, 720px"
                  />
                </div>
              </div>
              <div className={styles.phoneOutput}>
                <div className={styles.phoneSpeaker} aria-hidden="true" />
                <div className={styles.phoneImage}>
                  <Image
                    src="/marketing/signal-journey/iphone-relationship-output.webp"
                    alt="Talent Signal iPhone relationship view showing the same attached evidence"
                    fill
                    sizes="210px"
                  />
                </div>
              </div>
            </motion.div>
          </div>

          <div className={styles.sourceSwitcher} aria-label="Example sources">
            <span>Try another source</span>
            <div>
              {signalJourneySources.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  data-active={activeSourceIndex === index || undefined}
                  aria-pressed={activeSourceIndex === index}
                  onClick={() => chooseSource(index)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.progress} aria-hidden="true">
            <motion.span
              style={{
                scaleX: prefersReducedMotion ? 1 : scrollYProgress,
              }}
            />
          </div>

          <div className={styles.mobileContinue} aria-hidden="true">
            Continue through the evidence
            <ArrowDown size={15} />
          </div>
        </div>
      </div>
    </section>
  );
}
