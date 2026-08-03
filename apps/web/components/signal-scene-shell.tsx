"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const SignalScene = dynamic(
  () => import("./signal-scene").then((module) => module.SignalScene),
  {
    ssr: false,
    loading: () => null,
  },
);

function SignalPoster({ hidden = false }: { hidden?: boolean }) {
  return (
    <div
      className="signal-poster"
      role={hidden ? undefined : "img"}
      aria-hidden={hidden || undefined}
      aria-label={
        hidden
          ? undefined
          : "A spatial map showing five evidence fragments converging into one recommended action."
      }
    >
      <span className="signal-poster__ring signal-poster__ring--one" />
      <span className="signal-poster__ring signal-poster__ring--two" />
      <span className="signal-poster__line signal-poster__line--one" />
      <span className="signal-poster__line signal-poster__line--two" />
      <span className="signal-poster__line signal-poster__line--three" />
      <span className="signal-poster__line signal-poster__line--four" />
      <span className="signal-poster__line signal-poster__line--five" />
      <span className="signal-poster__node signal-poster__node--one" />
      <span className="signal-poster__node signal-poster__node--two" />
      <span className="signal-poster__node signal-poster__node--three" />
      <span className="signal-poster__node signal-poster__node--four" />
      <span className="signal-poster__node signal-poster__node--five" />
      <span className="signal-poster__core" />
    </div>
  );
}

export function SignalSceneShell() {
  const [enabled, setEnabled] = useState(false);

  function enableScene() {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (window.innerWidth >= 768 && !reduceMotion) {
      setEnabled(true);
    }
  }

  return (
    <div
      className="signal-scene-shell"
      onPointerEnter={enableScene}
    >
      <SignalPoster hidden={enabled} />
      {enabled && <SignalScene />}
    </div>
  );
}
