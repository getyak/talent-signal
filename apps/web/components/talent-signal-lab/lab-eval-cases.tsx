import type { LabEvalCase } from "@talent-signal/contracts";
import { CheckCircle, Flask } from "@phosphor-icons/react/dist/ssr";

import styles from "./talent-signal-lab.module.css";

export function LabEvalCases({ cases }: { cases: LabEvalCase[] }) {
  if (cases.length === 0) return null;

  return (
    <section aria-labelledby="lab-eval-cases-title" className={styles.evalCases}>
      <header>
        <div>
          <p className={styles.eyebrow}>Reality Receipts</p>
          <h2 id="lab-eval-cases-title">人工晋升的 Lab Eval Cases</h2>
        </div>
        <span>{cases.length} 个 candidate release gates</span>
      </header>
      <div className={styles.evalCaseList}>
        {cases.map((evalCase) => (
          <article key={evalCase.id}>
            <div className={styles.evalCaseIdentity}>
              <Flask aria-hidden="true" size={19} weight="duotone" />
              <span>
                <strong>{evalCase.case_ref} · v{evalCase.version}</strong>
                <small>{evalCase.scenario_id}@{evalCase.scenario_revision}</small>
              </span>
            </div>
            <div>
              <span>必须保护</span>
              <p>{evalCase.expected_behavior}</p>
            </div>
            <div>
              <span>观察到的偏差</span>
              <p>{evalCase.observed_regression}</p>
            </div>
            <footer>
              <span><CheckCircle aria-hidden="true" size={15} weight="fill" /> human gold</span>
              <code>{evalCase.snapshot_hash.slice(0, 14)} · dev · candidate blocking</code>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
