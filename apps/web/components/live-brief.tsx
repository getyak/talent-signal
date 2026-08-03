"use client";

import { ArrowRight, ShieldCheck } from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  analyzeConversation,
  deriveInsight,
  sampleConversation,
  type EvidenceKind,
} from "@/lib/signals";

const sample = analyzeConversation(sampleConversation);

export function LiveBrief() {
  const [selected, setSelected] = useState<Set<EvidenceKind>>(
    () => new Set(sample.evidence.map((item) => item.id)),
  );
  const visibleEvidence = useMemo(
    () => sample.evidence.filter((item) => selected.has(item.id)),
    [selected],
  );
  const insight = deriveInsight(visibleEvidence);

  function toggleEvidence(id: EvidenceKind) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="live-brief" aria-label="Interactive candidate brief">
      <div className="live-brief__candidate">
        <div>
          <p className="metadata">Candidate brief</p>
          <h3>Leila Hartmann</h3>
          <p>VP Product candidate</p>
        </div>
        <span className="source-lock">
          <ShieldCheck aria-hidden="true" size={16} />
          Source attached
        </span>
      </div>

      <blockquote>
        “I have another offer and need to decide by Wednesday. I can speak
        Tuesday afternoon, but remote flexibility is important.”
      </blockquote>

      <div className="evidence-selector">
        <p className="field-label">Evidence in scope</p>
        <p className="field-helper">
          Toggle a fact to see how the recommendation changes.
        </p>
        <div className="evidence-selector__items">
          {sample.evidence.map((item) => {
            const active = selected.has(item.id);
            return (
              <button
                key={item.id}
                className="evidence-chip"
                data-active={active}
                type="button"
                aria-pressed={active}
                onClick={() => toggleEvidence(item.id)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="live-brief__insight" aria-live="polite">
        <div className="insight-heading">
          <p>Momentum insight</p>
          <span className="verdict">{insight.verdict}</span>
        </div>
        <div
          className="insight-transition"
          key={insight.verdict + selected.size}
        >
          <p className="insight-rationale">{insight.rationale}</p>
          <p className="next-action">
            <span>Next action</span>
            {insight.nextAction}
          </p>
        </div>
      </div>

      <Link className="text-link" href="/demo">
        Open live demo
        <ArrowRight aria-hidden="true" size={17} />
      </Link>
    </div>
  );
}
