import {
  type CSSProperties,
  type PropsWithChildren,
} from "react";

type RevealProps = PropsWithChildren<{
  className?: string;
  delay?: number;
  direction?: "up" | "left" | "right" | "none";
}>;

export function Reveal({
  children,
  className,
  delay = 0,
  direction = "up",
}: RevealProps) {
  return (
    <div
      className={className}
      data-reveal-direction={direction}
      style={{ "--reveal-delay": `${delay}s` } as CSSProperties}
    >
      {children}
    </div>
  );
}
