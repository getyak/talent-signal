"use client";

import { useEffect, useRef } from "react";
import { RelationshipBrief } from "./relationship-brief";

/** The public CTA arrives at the actual keyboard-operable brief, including on mobile. */
export function DemoEntry() {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function focusEntry() {
      if (window.location.hash === "#relationship-experience") {
        target.current?.focus({ preventScroll: true });
        target.current?.scrollIntoView({ block: "start", behavior: "instant" });
      }
    }
    const frame = requestAnimationFrame(focusEntry);
    window.addEventListener("hashchange", focusEntry);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", focusEntry);
    };
  }, []);
  return (
    <div id="relationship-experience" ref={target} tabIndex={-1}>
      <RelationshipBrief />
    </div>
  );
}
