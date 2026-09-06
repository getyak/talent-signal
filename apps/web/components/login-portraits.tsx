"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import { BrandMark } from "./brand-mark";
import styles from "./login-portraits.module.css";

const people = [
  { image: "maya", x: 25, y: 33, size: 92 }, { image: "amir", x: 73, y: 32, size: 84 },
  { image: "nia", x: 48, y: 12, size: 56 }, { image: "leila", x: 50, y: 44, size: 104 },
  { image: "welcome-5", x: 88, y: 53, size: 52 }, { image: "welcome-6", x: 15, y: 60, size: 60 },
  { image: "welcome-7", x: 76, y: 73, size: 64 }, { image: "welcome-8", x: 30, y: 77, size: 46 },
  { image: "welcome-9", x: 11, y: 12, size: 42 }, { image: "welcome-10", x: 87, y: 9, size: 40 },
  { image: "welcome-11", x: 54, y: 72, size: 34 },
];

export function LoginPortraits() {
  const reduced = useReducedMotion();
  const [entered, setEntered] = useState(false);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const touchY = useRef(0);
  return (
    <div className={styles.scene}
      onWheel={event => { if (event.deltaY > 24) setEntered(true); }}
      onTouchStart={event => { touchY.current = event.touches[0]?.clientY ?? 0; }}
      onTouchEnd={event => { if (touchY.current - (event.changedTouches[0]?.clientY ?? touchY.current) > 45) setEntered(true); }}
      onPointerMove={event => {
        if (reduced || !entered || event.pointerType !== "mouse") return;
        const box = event.currentTarget.getBoundingClientRect();
        setPointer({ x: (event.clientX - box.left) / box.width - .5, y: (event.clientY - box.top) / box.height - .5 });
      }} onPointerLeave={() => setPointer({ x: 0, y: 0 })}>
      {entered && <>
        <motion.svg aria-hidden="true" className={styles.threads} viewBox="0 0 100 100" preserveAspectRatio="none"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduced ? 0 : .65, duration: .6 }}>
          <path d="M25 33 Q36 30 48 12 M48 12 Q62 26 73 32 M25 33 Q34 46 50 44 M50 44 Q68 48 88 53 M73 32 Q69 52 50 44 M15 60 L30 77 L50 44 L76 73 L88 53 M11 12 L25 33 M87 9 L73 32 M54 72 L76 73" />
        </motion.svg>
        {people.map((person, index) => <motion.div key={person.image} aria-hidden="true"
          className={styles.portrait} style={{ left: `${person.x}%`, top: `${person.y}%`, width: `calc(${person.size}px * var(--portrait-scale, 1))`, height: `calc(${person.size}px * var(--portrait-scale, 1))` }}
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: .35, y: 330, x: (50 - person.x) * 2 }}
          animate={{ opacity: 1, scale: 1, x: reduced ? 0 : pointer.x * (10 + index), y: reduced ? 0 : pointer.y * (9 + index) }}
          transition={{ type: "spring", stiffness: 115, damping: 12, mass: .7, delay: index * .035 }}>
          <Image src={`/concepts/relationships/avatars/${person.image}.${person.image.startsWith("welcome-") ? "png" : "webp"}`} alt="" fill sizes="104px" />
        </motion.div>)}
      </>}
      <motion.div className={styles.mark} aria-hidden="true"
        animate={{ y: entered ? 0 : -125, scale: entered ? 1 : 1.45, rotate: entered || reduced ? 0 : -12 }}
        transition={reduced ? { duration: .18 } : { type: "spring", stiffness: 100, damping: 15 }}>
        <span inert><BrandMark compact /></span>
      </motion.div>
      {!entered ? <button className={styles.enter} onClick={() => setEntered(true)}><span>↑</span>上滑，或点击开始连接</button>
        : <button className={styles.replay} onClick={() => { setEntered(false); setPointer({ x: 0, y: 0 }); }}>再见一次，初次见面</button>}
    </div>
  );
}
