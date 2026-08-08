"use client";

import {
  ArrowRight,
  Check,
  Crosshair,
  ShieldCheck,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { signalJourneySources } from "./signal-journey";
import styles from "./hero-signal-preview.module.css";

const phases = [
  "Source in view",
  "Exact words located",
  "Review state staged",
] as const;

const channelMarks = ["微", "W", "L", "B", "红"] as const;

export function HeroSignalPreview() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const autoPlayRef = useRef(true);
  const [activeSource, setActiveSource] = useState(0);
  const [phase, setPhase] = useState(0);
  const source = signalJourneySources[activeSource];
  const visiblePhase = prefersReducedMotion ? phases.length - 1 : phase;

  useEffect(() => {
    if (prefersReducedMotion || !autoPlayRef.current) {
      return;
    }

    const interval = window.setInterval(() => {
      if (!autoPlayRef.current) {
        return;
      }
      setPhase((current) => {
        if (current === phases.length - 1) {
          setActiveSource(
            (sourceIndex) =>
              (sourceIndex + 1) % signalJourneySources.length,
          );
          return 0;
        }
        return current + 1;
      });
    }, 2200);

    return () => window.clearInterval(interval);
  }, [prefersReducedMotion]);

  function chooseSource(index: number) {
    autoPlayRef.current = false;
    setActiveSource(index);
    setPhase(2);
  }

  return (
    <figure
      className={styles.preview}
      data-phase={visiblePhase}
      aria-label="A verified synthetic conversation moving from screenshot to exact evidence and a reviewable contact state"
    >
      <div className={styles.previewHeader}>
        <span>
          <i aria-hidden="true" />
          Verified synthetic run
        </span>
        <strong>{phases[visiblePhase]}</strong>
      </div>

      <div className={styles.canvas}>
        <div className={styles.lightField} aria-hidden="true" />
        <div className={styles.route} aria-hidden="true">
          <span />
          <ArrowRight size={15} />
        </div>

        <motion.div
          className={styles.phone}
          animate={
            prefersReducedMotion
              ? undefined
              : {
                  rotate: visiblePhase === 0 ? -2.4 : -1.2,
                  scale: visiblePhase === 2 ? 0.965 : 1,
                  x: visiblePhase === 2 ? -7 : 0,
                }
          }
          transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className={styles.phoneTop}>
            <span />
            <small>{source.label}</small>
            <i />
          </div>
          <div className={styles.phoneViewport}>
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                className={styles.sourceImage}
                key={source.id}
                initial={
                  prefersReducedMotion
                    ? false
                    : { opacity: 0, scale: 1.025, y: 12 }
                }
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={
                  prefersReducedMotion
                    ? undefined
                    : { opacity: 0, scale: 0.985, y: -9 }
                }
                transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
              >
                <Image
                  alt={source.alt}
                  fill
                  sizes="(max-width: 900px) 42vw, 250px"
                  src={source.image}
                />
              </motion.div>
            </AnimatePresence>
          </div>
          <div className={styles.phoneFoot}>
            <ShieldCheck aria-hidden="true" size={13} />
            Original image not stored
          </div>
        </motion.div>

        <section className={styles.evidencePanel} aria-label="Exact evidence">
          <header>
            <span>
              <Crosshair aria-hidden="true" size={14} />
              Exact evidence
            </span>
            <small>{source.evidence.length} found</small>
          </header>
          <div>
            {source.evidence.slice(0, 2).map((quote, index) => (
              <div className={styles.quote} key={quote}>
                <span>0{index + 1}</span>
                <q>{quote}</q>
                <Check aria-hidden="true" size={14} weight="bold" />
              </div>
            ))}
          </div>
          <p>Continuous source spans · candidate speaker only</p>
        </section>

        <article className={styles.contactPanel}>
          <header>
            <span className={styles.personMark}>SC</span>
            <div>
              <small>Living contact · proposed</small>
              <strong>Synthetic candidate</strong>
              <span>CPO search · recruiter bound</span>
            </div>
            <i>Review</i>
          </header>
          <dl>
            {source.facts.slice(0, 2).map(([label, value, status]) => (
              <div key={label} data-status={status}>
                <dt>{label}</dt>
                <dd>{value}</dd>
                <small>{status}</small>
              </div>
            ))}
          </dl>
          <footer>
            <span>No automatic write</span>
            <strong>Confirm · edit · dismiss</strong>
          </footer>
        </article>
      </div>

      <figcaption className={styles.switcher}>
        <div>
          {signalJourneySources.map((item, index) => (
            <button
              aria-label={`Show ${item.label} synthetic example`}
              aria-pressed={activeSource === index}
              data-active={activeSource === index || undefined}
              key={item.id}
              onClick={() => chooseSource(index)}
              title={item.label}
              type="button"
            >
              {channelMarks[index]}
            </button>
          ))}
        </div>
        <span>
          {source.label}
          <i aria-hidden="true" />
          model-verified, human-reviewed
        </span>
      </figcaption>
    </figure>
  );
}
