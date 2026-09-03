import { ArrowCounterClockwise, ArrowRight, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import styles from "./workspace-disconnected-state.module.css";

export function WorkspaceDisconnectedState({
  description,
  hint,
  primaryHref = "/workspace/boundaries",
  primaryLabel = "打开冻结边界案例",
  secondaryHref = "/demo",
  secondaryLabel = "继续查看受控演示",
  title = "账号范围内的工作区暂时不可用。",
}: {
  description: string;
  hint: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  title?: string;
}) {
  return (
    <section className={styles.panel} role="alert">
      <div className={styles.header}>
        <span className={styles.icon}>
          <WarningCircle aria-hidden="true" size={22} />
        </span>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>受治理工作区离线</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      <div className={styles.actions}>
        <Link className={styles.primary} href={primaryHref}>
          {primaryLabel}
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
        <Link className={styles.secondary} href={secondaryHref}>
          {secondaryLabel}
        </Link>
      </div>

      <p className={styles.hint}>
        <ArrowCounterClockwise aria-hidden="true" size={14} /> {hint}
      </p>
    </section>
  );
}
